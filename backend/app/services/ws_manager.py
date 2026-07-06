import logging
import json
from typing import Dict, List, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for the chat system.

    Tracks connections by user_id and subscriptions by chat_id.
    Optionally uses Redis pub/sub for multi-instance scaling.
    """

    def __init__(self):
        # user_id -> list of WebSocket connections
        self._connections: Dict[int, List[WebSocket]] = {}
        # chat_id -> set of user_ids subscribed
        self._chat_subscriptions: Dict[int, Set[int]] = {}
        # user_id -> set of chat_ids they're subscribed to
        self._user_subscriptions: Dict[int, Set[int]] = {}
        # redis pub/sub client (set up later if available)
        self._redis_pub = None
        self._redis_sub = None

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(ws)
        logger.info(f"WebSocket connected: user={user_id}, total={self._count_connections()}")

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        if user_id in self._connections:
            try:
                self._connections[user_id].remove(ws)
            except ValueError:
                pass
            if not self._connections[user_id]:
                del self._connections[user_id]
                # clean up subscriptions
                if user_id in self._user_subscriptions:
                    for chat_id in self._user_subscriptions[user_id].copy():
                        self._unsubscribe(user_id, chat_id)
                    del self._user_subscriptions[user_id]
        logger.info(f"WebSocket disconnected: user={user_id}, total={self._count_connections()}")

    def subscribe(self, user_id: int, chat_id: int) -> None:
        if chat_id not in self._chat_subscriptions:
            self._chat_subscriptions[chat_id] = set()
        self._chat_subscriptions[chat_id].add(user_id)
        if user_id not in self._user_subscriptions:
            self._user_subscriptions[user_id] = set()
        self._user_subscriptions[user_id].add(chat_id)

    def _unsubscribe(self, user_id: int, chat_id: int) -> None:
        if chat_id in self._chat_subscriptions:
            self._chat_subscriptions[chat_id].discard(user_id)
            if not self._chat_subscriptions[chat_id]:
                del self._chat_subscriptions[chat_id]

    async def broadcast_to_chat(self, chat_id: int, data: dict) -> None:
        """Send a message to all users subscribed to a chat."""
        message = json.dumps(data, default=str)
        subscribed_users = self._chat_subscriptions.get(chat_id, set())
        for user_id in subscribed_users:
            await self._send_to_user(user_id, message)

    async def _send_to_user(self, user_id: int, message: str) -> None:
        """Send a message to all connections of a specific user."""
        connections = self._connections.get(user_id, [])
        dead_connections = []
        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)
        # clean up broken connections
        for ws in dead_connections:
            self.disconnect(user_id, ws)

    async def broadcast_typing(self, chat_id: int, user_id: int, is_typing: bool) -> None:
        """Notify other subscribers that a user is typing."""
        data = json.dumps({
            "type": "typing",
            "chat_id": chat_id,
            "user_id": user_id,
            "is_typing": is_typing,
        })
        subscribed_users = self._chat_subscriptions.get(chat_id, set())
        for uid in subscribed_users:
            if uid != user_id:
                await self._send_to_user(uid, data)

    async def broadcast_new_message(self, chat_id: int, message_data: dict) -> None:
        """Notify subscribers about a new message."""
        data = json.dumps({
            "type": "new_message",
            "chat_id": chat_id,
            "message": message_data,
        }, default=str)
        subscribed_users = self._chat_subscriptions.get(chat_id, set())
        for user_id in subscribed_users:
            await self._send_to_user(user_id, data)

    async def broadcast_status_change(self, chat_id: int, status: str) -> None:
        """Notify subscribers about a status change."""
        data = json.dumps({
            "type": "status_changed",
            "chat_id": chat_id,
            "status": status,
        })
        subscribed_users = self._chat_subscriptions.get(chat_id, set())
        for user_id in subscribed_users:
            await self._send_to_user(user_id, data)

    def is_user_online(self, user_id: int) -> bool:
        """Check if a user has an active WebSocket connection."""
        return user_id in self._connections and bool(self._connections[user_id])

    def get_online_users(self) -> Set[int]:
        """Get all user IDs that are currently connected."""
        return set(self._connections.keys())

    def _count_connections(self) -> int:
        return sum(len(conns) for conns in self._connections.values())


# Global singleton
manager = ConnectionManager()

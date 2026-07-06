'use client'

import { create } from 'zustand'

interface TypingUser {
  userId: number
  chatId: number
}

interface ChatStore {
  ws: WebSocket | null
  connected: boolean
  activeChatId: number | null
  typingUsers: TypingUser[]
  connect: (token: string) => void
  disconnect: () => void
  sendTyping: (chatId: number, isTyping: boolean) => void
  sendMessage: (chatId: number, text: string) => void
  subscribe: (chatId: number) => void
  setActiveChat: (id: number | null) => void
  _onMessage: ((data: any) => void) | null
  setOnMessage: (handler: ((data: any) => void) | null) => void
  addTypingUser: (userId: number, chatId: number) => void
  removeTypingUser: (userId: number, chatId: number) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  ws: null,
  connected: false,
  activeChatId: null,
  typingUsers: [],
  _onMessage: null,

  connect: (token: string) => {
    const existing = get().ws
    if (existing) {
      try {
        existing.close()
      } catch {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const hostname = window.location.hostname
    // Backend WebSocket is exposed on port 8080 (Docker maps 8080->8000)
    const url = `${protocol}//${hostname}:8080/api/v1/ws/chat?token=${token}`

    const ws = new WebSocket(url)

    ws.onopen = () => {
      set({ ws, connected: true })
      // Re-subscribe to active chat
      const activeChatId = get().activeChatId
      if (activeChatId) {
        ws.send(JSON.stringify({ type: 'subscribe', chat_id: activeChatId }))
      }
    }

    ws.onclose = () => {
      set({ ws: null, connected: false })
      // Auto-reconnect after 5 seconds
      const token = localStorage.getItem('auth_token')
      if (token) {
        setTimeout(() => {
          const { connected } = get()
          if (!connected) get().connect(token)
        }, 5000)
      }
    }

    ws.onerror = () => {
      // Will trigger onclose
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const handler = get()._onMessage
        if (handler) {
          handler(data)
        }
        // Handle typing events in store
        if (data.type === 'typing') {
          if (data.is_typing) {
            get().addTypingUser(data.user_id, data.chat_id)
          } else {
            get().removeTypingUser(data.user_id, data.chat_id)
          }
        }
      } catch {}
    }

    set({ ws })
  },

  disconnect: () => {
    const { ws } = get()
    if (ws) {
      try {
        ws.close()
      } catch {}
    }
    set({ ws: null, connected: false })
  },

  sendTyping: (chatId, isTyping) => {
    const { ws, connected } = get()
    if (ws && connected) {
      ws.send(
        JSON.stringify({
          type: 'typing',
          chat_id: chatId,
          is_typing: isTyping,
        }),
      )
    }
  },

  sendMessage: (chatId, text) => {
    const { ws, connected } = get()
    if (ws && connected) {
      ws.send(JSON.stringify({ type: 'message', chat_id: chatId, text }))
    }
  },

  subscribe: (chatId) => {
    const { ws, connected } = get()
    if (ws && connected) {
      ws.send(JSON.stringify({ type: 'subscribe', chat_id: chatId }))
    }
  },

  setActiveChat: (id) => {
    const prevId = get().activeChatId
    set({ activeChatId: id })
    if (id && id !== prevId) {
      get().subscribe(id)
    }
  },

  _onMessage: null,

  setOnMessage: (handler) => set({ _onMessage: handler }),

  addTypingUser: (userId, chatId) => {
    set((state) => {
      const exists = state.typingUsers.some(
        (t) => t.userId === userId && t.chatId === chatId,
      )
      if (exists) return state
      return { typingUsers: [...state.typingUsers, { userId, chatId }] }
    })
    // Auto-remove after 4 seconds
    setTimeout(() => {
      get().removeTypingUser(userId, chatId)
    }, 4000)
  },

  removeTypingUser: (userId, chatId) => {
    set((state) => ({
      typingUsers: state.typingUsers.filter(
        (t) => !(t.userId === userId && t.chatId === chatId),
      ),
    }))
  },
}))

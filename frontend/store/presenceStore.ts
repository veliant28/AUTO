'use client'

import { create } from 'zustand'
import { STORAGE_KEYS } from '@/lib/constants'
import { getOrCreateSessionId } from '@/lib/session'
import { wsBaseUrl } from '@/lib/wsUrl'

const HEARTBEAT_INTERVAL = 30000
const RECONNECT_DELAY = 5000
// Сервер закрывает соединение этими кодами при бане / невалидной
// идентичности — бесконечный реконнект не нужен.
const NO_RECONNECT_CODES = [4001, 4403]

interface PresenceState {
  ws: WebSocket | null
  connected: boolean
  connect: () => void
  disconnect: () => void
}

/**
 * Presence-канал монитора: клиент шлёт heartbeat каждые 30 сек по WS,
 * сервер обновляет last_seen в Redis и закрывает «зависшие» сессии.
 *
 * URL — тот же бэкенд, что и для HTTP API (см. lib/wsUrl.ts): браузер
 * обращается к нему напрямую (compose мапит 8000:8000), без прокси.
 *
 * WS не проходит через ProtectionMiddleware — лимиты не тратятся,
 * бан проверяется на подключении и на каждом heartbeat.
 */
export const usePresenceStore = create<PresenceState>((set, get) => ({
  ws: null,
  connected: false,

  connect: () => {
    if (typeof window === 'undefined') return
    const existing = get().ws
    if (existing) {
      try {
        existing.close()
      } catch {}
    }

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
    const sessionId = getOrCreateSessionId()

    const params = new URLSearchParams()
    if (token) params.set('token', token)
    if (sessionId) params.set('session_id', sessionId)
    const url = `${wsBaseUrl()}/ws/presence?${params.toString()}`

    const ws = new WebSocket(url)
    let heartbeat: ReturnType<typeof setInterval> | null = null

    ws.onopen = () => {
      set({ ws, connected: true })
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }))
        }
      }, HEARTBEAT_INTERVAL)
    }

    ws.onclose = (event) => {
      if (heartbeat) clearInterval(heartbeat)
      set({ ws: null, connected: false })
      if (NO_RECONNECT_CODES.includes(event.code)) {
        // Сервер отклонил токен (4001 Invalid token) — токен протух/устарел
        // (например, аккаунт удалён). Сбрасываем и переподключаемся анонимно,
        // чтобы присутствие не умирало навсегда.
        if (event.code === 4001 && event.reason === 'Invalid token' && token) {
          localStorage.removeItem(STORAGE_KEYS.TOKEN)
          setTimeout(() => {
            if (!get().connected) get().connect()
          }, RECONNECT_DELAY)
        }
        return
      }
      setTimeout(() => {
        if (!get().connected) get().connect()
      }, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      // onclose сработает следом — реконнект там
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
}))

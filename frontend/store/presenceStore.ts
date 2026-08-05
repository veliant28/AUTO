'use client'

import { create } from 'zustand'
import { STORAGE_KEYS } from '@/lib/constants'
import { getOrCreateSessionId } from '@/lib/session'

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
 * URL — same-origin: Next.js dev-прокси (`/api/v1/*` в rewrites) туннелирует
 * и WebSocket-апгрейды, поэтому и в docker-деплое, и в локальной разработке
 * работает один и тот же адрес без завязки на порты.
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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const hostname = window.location.hostname
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
    const sessionId = getOrCreateSessionId()

    const params = new URLSearchParams()
    if (token) params.set('token', token)
    if (sessionId) params.set('session_id', sessionId)
    const url = `${protocol}//${hostname}/api/v1/ws/presence?${params.toString()}`

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
      if (!NO_RECONNECT_CODES.includes(event.code)) {
        setTimeout(() => {
          if (!get().connected) get().connect()
        }, RECONNECT_DELAY)
      }
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

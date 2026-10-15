'use client'

import { create } from 'zustand'
import { STORAGE_KEYS } from '@/lib/constants'
import { wsBaseUrl } from '@/lib/wsUrl'

export interface RequestWsEvent {
  type: 'request_created' | 'request_comment' | 'request_updated' | string
  request_id: number
  number: string | null
  title: string | null
  status: string
  created_by_id: number | null
  assignee_id: number | null
  actor_id: number | null
}

interface RequestsStore {
  ws: WebSocket | null
  connected: boolean
  lastEvent: RequestWsEvent | null
  connect: (token: string) => void
  disconnect: () => void
  _onEvent: ((event: RequestWsEvent) => void) | null
  setOnEvent: (handler: ((event: RequestWsEvent) => void) | null) => void
}

/**
 * WS-канал журнала заявок (/ws/requests): мгновенные события вместо опроса.
 * Страховочный опрос остаётся на страницах журнала (refetchInterval).
 */
export const useRequestsStore = create<RequestsStore>((set, get) => ({
  ws: null,
  connected: false,
  lastEvent: null,
  _onEvent: null,

  connect: (token: string) => {
    const existing = get().ws
    if (existing) {
      try {
        existing.close()
      } catch {}
    }

    const ws = new WebSocket(`${wsBaseUrl()}/ws/requests?token=${token}`)

    ws.onopen = () => {
      set({ ws, connected: true })
    }

    ws.onclose = () => {
      set({ ws: null, connected: false })
      // Авто-переподключение, пока есть токен
      const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN)
      if (storedToken) {
        setTimeout(() => {
          if (!get().connected) get().connect(storedToken)
        }, 5000)
      }
    }

    ws.onerror = () => {
      // приводит к onclose
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RequestWsEvent
        set({ lastEvent: data })
        get()._onEvent?.(data)
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

  setOnEvent: (handler) => set({ _onEvent: handler }),
}))

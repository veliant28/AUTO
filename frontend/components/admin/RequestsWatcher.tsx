'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import { STORAGE_KEYS } from '@/lib/constants'
import { can } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useRequestsStore } from '@/store/requestsStore'

const SEEN_KEY = 'requests_alert_toasts_v1'
const SEEN_LIMIT = 300

interface AlertItem {
  id: number
  number: string
  title: string
  category_name: string
  status: string
  minutes_left: number | null
  minutes_late: number | null
}

interface AlertsData {
  due_soon: AlertItem[]
  overdue: AlertItem[]
}

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveSeen(seen: Set<string>) {
  try {
    const arr = Array.from(seen).slice(-SEEN_LIMIT)
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch {}
}

/**
 * Наблюдатель журнала заявок: WS-подписка на события + опрос алертов раз в
 * минуту. Тосты показываются один раз на пару «заявка + состояние срока».
 */
export default function RequestsWatcher() {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const hasAccess = !!user && can(user, 'requests.view')
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    seenRef.current = loadSeen()
  }, [])

  const { data: alerts } = useQuery<AlertsData>({
    queryKey: ['requests-alerts'],
    queryFn: async () => {
      const { data } = await api.get('/admin/requests/alerts')
      return { due_soon: data?.due_soon || [], overdue: data?.overdue || [] }
    },
    enabled: hasAccess,
    refetchInterval: 60000,
  })

  // Тосты по срокам: синий — истекает, красный — просрочено
  useEffect(() => {
    if (!alerts || !hasAccess) return
    const seen = seenRef.current
    let changed = false

    for (const item of alerts.overdue || []) {
      const key = `${item.id}:overdue`
      if (!seen.has(key)) {
        seen.add(key)
        changed = true
        toast.error(
          t('requests_toast_overdue', {
            number: item.number,
            minutes: item.minutes_late ?? 0,
          }),
        )
      }
    }
    for (const item of alerts.due_soon || []) {
      const key = `${item.id}:due_soon`
      if (!seen.has(key)) {
        seen.add(key)
        changed = true
        toast.info(
          t('requests_toast_due_soon', {
            number: item.number,
            minutes: item.minutes_left ?? 0,
          }),
        )
      }
    }
    if (changed) saveSeen(seen)
  }, [alerts, hasAccess, t])

  // WS-канал: мгновенная инвалидация + тост о новой заявке/комментарии
  useEffect(() => {
    if (!hasAccess) return
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN) || ''
    if (!token) return

    const store = useRequestsStore.getState()
    store.setOnEvent((event) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['requests-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      if (event.actor_id && event.actor_id === user?.id) return
      if (event.type === 'request_created') {
        toast.info(
          t('requests_toast_new', {
            number: event.number || `#${event.request_id}`,
          }),
        )
      } else if (event.type === 'request_comment') {
        toast.info(
          t('requests_toast_comment', {
            number: event.number || `#${event.request_id}`,
          }),
        )
      }
    })
    store.connect(token)

    return () => {
      const s = useRequestsStore.getState()
      s.setOnEvent(null)
      s.disconnect()
    }
  }, [hasAccess, queryClient, t, user?.id])

  return null
}

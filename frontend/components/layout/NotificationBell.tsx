'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell, MessageCircle, ShoppingCart, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const ONE_HOUR = 60 * 60 * 1000
const TWO_HOURS = 2 * ONE_HOUR

interface OrderItem {
  id: number
  order_number: string | null
  full_name: string | null
  total: number | null
  created_at: string | null
}

interface ReturnItem {
  id: number
  created_at: string | null
}

interface MessageItem {
  conversation_id: number
  ticket_number: string | null
  message: string | null
  created_at: string | null
}

interface NotificationsData {
  new_orders: OrderItem[]
  new_returns: ReturnItem[]
  unread_messages: MessageItem[]
}

function timeColor(createdAt: string | null): string {
  if (!createdAt) return 'bg-gray-500'
  const diff = Date.now() - new Date(createdAt).getTime()
  if (diff < ONE_HOUR) return 'bg-green-500'
  if (diff < TWO_HOURS) return 'bg-orange-500'
  return 'bg-red-500'
}

function worstBadgeColor(
  items: { created_at: string | null }[],
): string | null {
  if (items.length === 0) return null
  let hasOrange = false
  for (const item of items) {
    if (!item.created_at) continue
    const diff = Date.now() - new Date(item.created_at).getTime()
    if (diff >= TWO_HOURS) return 'bg-red-500'
    if (diff >= ONE_HOUR) hasOrange = true
  }
  return hasOrange ? 'bg-orange-500' : 'bg-green-500'
}

function timeAgo(createdAt: string | null): string {
  if (!createdAt) return ''
  const diff = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  return `${hours} ч ${mins % 60} мин`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<NotificationsData | null>(null)

  useEffect(() => {
    let cancelled = false
    const API =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

    async function fetchNotifs() {
      try {
        const token = localStorage.getItem('token') || ''
        const res = await fetch(`${API}/admin/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch {}
    }

    fetchNotifs()
    const id = setInterval(fetchNotifs, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const orders = data?.new_orders || []
  const returns = data?.new_returns || []
  const messages = data?.unread_messages || []
  const total = orders.length + returns.length + messages.length

  // Badge color: priority orders/returns > support
  const allItems = [...orders, ...returns]
  const orderReturnColor = worstBadgeColor(allItems)
  const badgeColor =
    messages.length > 0 && allItems.length === 0
      ? 'bg-blue-500'
      : orderReturnColor || 'bg-red-500'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-10 w-10 rounded-md hover:bg-accent flex items-center justify-center relative cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {total > 0 && (
          <Badge
            className={`absolute -top-1.5 -right-1.5 ${badgeColor} text-white border-0 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center px-1`}
          >
            {total > 99 ? '99+' : total}
          </Badge>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-12 w-96 max-h-[70vh] bg-card border rounded-lg shadow-xl z-[999] flex flex-col overflow-hidden">
          <div className="p-3 border-b font-semibold text-sm flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Уведомления
            {total > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                — {total}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {total === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Нет новых уведомлений
              </p>
            )}

            {orders.map((o) => (
              <a
                key={`order-${o.id}`}
                href={`/admin/orders?id=${o.id}`}
                className={`${timeColor(o.created_at)} text-white flex items-start gap-3 p-3 rounded-lg hover:opacity-90 transition-opacity cursor-pointer`}
              >
                <ShoppingCart className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {o.order_number || `#${o.id}`}
                  </p>
                  <p className="text-xs opacity-90 truncate">{o.full_name}</p>
                  {o.total != null && (
                    <p className="text-xs opacity-80">
                      {o.total.toLocaleString()} ₴
                    </p>
                  )}
                </div>
                <span className="text-xs opacity-80 shrink-0 whitespace-nowrap">
                  {timeAgo(o.created_at)}
                </span>
              </a>
            ))}

            {returns.map((r) => (
              <a
                key={`return-${r.id}`}
                href={`/admin/returns?id=${r.id}`}
                className={`${timeColor(r.created_at)} text-white flex items-start gap-3 p-3 rounded-lg hover:opacity-90 transition-opacity cursor-pointer`}
              >
                <RotateCcw className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Возврат #{r.id}</p>
                </div>
                <span className="text-xs opacity-80 shrink-0 whitespace-nowrap">
                  {timeAgo(r.created_at)}
                </span>
              </a>
            ))}

            {messages.map((m) => (
              <a
                key={`msg-${m.conversation_id}`}
                href={`/admin/support?id=${m.conversation_id}`}
                className="bg-blue-500 text-white flex items-start gap-3 p-3 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.ticket_number || `#${m.conversation_id}`}
                  </p>
                  {m.message && (
                    <p className="text-xs opacity-90 line-clamp-2">
                      {m.message}
                    </p>
                  )}
                </div>
                <span className="text-xs opacity-80 shrink-0 whitespace-nowrap">
                  {timeAgo(m.created_at)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

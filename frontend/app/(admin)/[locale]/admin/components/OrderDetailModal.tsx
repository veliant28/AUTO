'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  X,
  Clock,
  History,
  Package,
  Truck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ORDER_STATUS_LABELS } from '@/lib/constants'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  let rest = digits
  if (rest.startsWith('380')) rest = rest.slice(3)
  else if (rest.startsWith('38')) rest = rest.slice(2)
  if (rest.length < 8) return phone
  if (rest.startsWith('0')) {
    return `+38 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8)}`
  }
  return `+38 (0${rest.slice(0, 2)}) ${rest.slice(2, 5)}-${rest.slice(5, 7)}-${rest.slice(7)}`
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'Z')
    return d.toLocaleString('uk-UA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

const EVENT_ICONS: Record<string, any> = {
  status_change: Clock,
  item_added: Package,
  item_removed: X,
  create: CheckCircle2,
  update: Clock,
  delete: X,
  print: Package,
  sync: Truck,
  error: AlertCircle,
}

const DELIVERY_LABELS: Record<string, string> = {
  warehouse: 'Отделение НП',
  courier: 'Курьер',
  pickup: 'Самовывоз',
}

interface OrderDetailModalProps {
  orderId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function OrderDetailModal({
  orderId,
  open,
  onOpenChange,
}: OrderDetailModalProps) {
  const t = useTranslations('admin')
  const [showHistory, setShowHistory] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order-detail', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${orderId}`)
      return data
    },
    enabled: !!orderId && open,
    refetchInterval: 10000,
  })

  const { data: events } = useQuery({
    queryKey: ['admin-order-all-events', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${orderId}/all-events`)
      return data as any[]
    },
    enabled: !!orderId && open && showHistory,
  })

  if (!orderId) return null

  const statusInfo = ORDER_STATUS_LABELS[order?.status || '']
  const statusClass = statusInfo?.className || 'bg-gray-500 text-white'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setShowHistory(false)
      }}
    >
      <DialogContent className="w-[95vw] max-w-[1400px] h-[85vh] flex flex-col !gap-0 !p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{order?.order_number || 'Заказ'}</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <h2 className="text-lg font-bold font-mono">
                  {order?.order_number}
                </h2>
                <Badge className={`${statusClass} border-0 text-sm`}>
                  {t('order_' + order?.status)}
                </Badge>
                {order?.created_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.created_at)}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-4 h-4 mr-1.5" />
              {showHistory ? t('back') : t('order_history')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : showHistory ? (
            /* ── History timeline ── */
            <div className="space-y-3">
              {!events || events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет событий</p>
              ) : (
                events.map((ev: any) => {
                  const Icon = EVENT_ICONS[ev.event_type] || Clock
                  return (
                    <div
                      key={`${ev.type}-${ev.id}`}
                      className="flex gap-3 items-start"
                    >
                      <div className="mt-0.5">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {ev.user_name && (
                            <Badge
                              className={`${ROLE_BADGE[ev.user_group] || 'bg-gray-500 text-white'} border-0 text-[10px]`}
                            >
                              {ev.user_name}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(ev.created_at)}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5">
                          {ev.details || ev.event_type}
                        </p>
                        {ev.np_number && (
                          <p className="text-xs text-muted-foreground font-mono">
                            ТТН: {ev.np_number}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            /* ── View mode: 2 columns ── */
            <div className="grid grid-cols-[2fr_1fr] gap-6 h-full">
              {/* Left: Items */}
              <div>
                <h3 className="text-sm font-semibold mb-3">
                  {t('order_items')}
                </h3>
                {order?.items?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет товаров</p>
                ) : (
                  <div className="space-y-2">
                    {order?.items?.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg border text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {item.brand && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1"
                              >
                                {item.brand}
                              </Badge>
                            )}
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.article}
                            </span>
                            {item.sku && (
                              <Badge className="bg-blue-500 text-white border-0 text-[10px]">
                                {item.sku}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs truncate mt-0.5">
                            {item.part_name}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-medium">
                            {item.quantity} × {fmt(item.price)} ₴
                          </p>
                          <p className="text-xs text-muted-foreground">
                            = {fmt(item.quantity * item.price)} ₴
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Customer + Summary */}
              <div className="space-y-4">
                {/* Customer info */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    {t('recipient_data')}
                  </h3>
                  <div className="text-sm space-y-1.5">
                    <p>
                      <span className="text-muted-foreground">
                        {t('order_customer')}:
                      </span>{' '}
                      {order?.full_name}
                    </p>
                    {order?.phone && (
                      <p>
                        <span className="text-muted-foreground">
                          {t('order_phone')}:
                        </span>{' '}
                        {formatPhone(order.phone)}
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">
                        {t('order_date')}:
                      </span>{' '}
                      {order?.created_at ? formatDate(order.created_at) : ''}
                    </p>
                    {order?.payment_method && (
                      <p>
                        <span className="text-muted-foreground">
                          {t('payment_method')}:
                        </span>{' '}
                        {order.payment_method}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Delivery */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    {t('delivery_info')}
                  </h3>
                  <div className="text-sm space-y-1.5">
                    <p>
                      {DELIVERY_LABELS[order?.delivery_type] ||
                        order?.delivery_type ||
                        '—'}
                    </p>
                    {order?.delivery_city && (
                      <p className="text-muted-foreground">
                        {order.delivery_city}
                      </p>
                    )}
                    {order?.delivery_warehouse && (
                      <p className="text-muted-foreground">
                        {order.delivery_warehouse}
                      </p>
                    )}
                    {(order?.delivery_street_label ||
                      order?.delivery_house) && (
                      <p className="text-muted-foreground">
                        {[
                          order.delivery_street_label,
                          order.delivery_house,
                          order.delivery_apartment,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Summary */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    {t('order_summary')}
                  </h3>
                  <div className="text-sm space-y-1.5">
                    {order?.original_total && order.original_total > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t('total_items')}
                        </span>
                        <span>{fmt(order.original_total)} ₴</span>
                      </div>
                    )}
                    {order?.discount_amount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>{t('discount_label')}</span>
                        <span>-{fmt(order.discount_amount)} ₴</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-base">
                      <span>{t('order_total')}</span>
                      <span>{fmt(order?.total || 0)} ₴</span>
                    </div>
                  </div>
                </div>

                {order?.updated_by_name && (
                  <>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      {order.updated_by_name} · {order.updated_by_group}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

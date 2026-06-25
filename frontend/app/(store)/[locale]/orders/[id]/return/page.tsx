'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMessages, useLocale } from 'next-intl'
import {
  ArrowLeft,
  RotateCcw,
  Package,
  Plus,
  Minus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useAuthStore } from '@/store/authStore'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { toast } from '@/lib/toast'

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
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

export default function CreateReturnPage() {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const messages = useMessages()
  const msgs = messages as Record<string, any>
  const t = (key: string) => msgs?.common?.[key] ?? key
  const params = useParams()
  const router = useRouter()
  const orderId = params.id
  const { isAuthenticated } = useAuthStore()

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`)
      return data
    },
    enabled: !!orderId && isAuthenticated,
  })

  // Quantities state: keyed by part_id
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [removedItems, setRemovedItems] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (order?.items) {
      const q: Record<number, number> = {}
      order.items.forEach((item: any) => {
        q[item.part_id] = item.quantity
      })
      setQuantities(q)
    }
  }, [order])

  const locale = LOCALE_MAP[useLocale()] || 'ru-RU'
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)

  const submitMutation = useMutation({
    mutationFn: async (items: { part_id: number; quantity: number }[]) => {
      const { data } = await api.post(`/returns/from-order/${orderId}`, {
        items,
      })
      return data
    },
    onSuccess: () => {
      toast.success(t('return_created'))
      router.push('/returns')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('error'))
    },
  })

  const visibleItems = useMemo(() => {
    if (!order?.items) return []
    return order.items.filter((item: any) => !removedItems.has(item.part_id))
  }, [order, removedItems])

  const totalRefund = useMemo(() => {
    return visibleItems.reduce((sum: number, item: any) => {
      const qty = quantities[item.part_id] ?? item.quantity
      return sum + qty * item.price
    }, 0)
  }, [visibleItems, quantities])

  const handleQuantityChange = (partId: number, delta: number) => {
    const current = quantities[partId] ?? 1
    const orderItem = order?.items?.find((i: any) => i.part_id === partId)
    const maxQty = orderItem?.quantity ?? current
    const newQty = Math.max(1, Math.min(maxQty, current + delta))
    if (newQty !== current) {
      toast.info(delta > 0 ? 'Количество увеличено' : 'Количество уменьшено')
    }
    setQuantities((prev) => ({ ...prev, [partId]: newQty }))
  }

  const handleRemoveItem = (partId: number) => {
    setRemovedItems((prev) => new Set(prev).add(partId))
    toast.info('Товар удалён из возврата')
  }

  const handleSubmit = () => {
    const items = visibleItems.map((item: any) => ({
      part_id: item.part_id,
      quantity: quantities[item.part_id] ?? item.quantity,
    }))
    submitMutation.mutate(items)
  }

  if (!mounted) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold">{t('login_required')}</h1>
        <Link href="/auth/login">
          <Button className="mt-4">{t('login')}</Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <Package className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-4">{t('order_not_found')}</h1>
        <Link href="/orders">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> {t('back')}
          </Button>
        </Link>
      </div>
    )
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status] || {
    labelKey: 'order_pending',
    className: 'bg-gray-500 text-white',
  }
  const date = new Date(order.created_at + 'Z').toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/returns">
            <Button variant="outline" size="lg" className="gap-2">
              <ArrowLeft className="w-5 h-5" /> {t('all_returns')}
            </Button>
          </Link>
          <Button
            size="lg"
            className="gap-2"
            onClick={handleSubmit}
            disabled={submitMutation.isPending || visibleItems.length === 0}
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RotateCcw className="w-5 h-5" />
            )}
            {t('return_submit')}
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Order info + masked recipient/delivery/payment */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold font-mono">
                    {order.order_number || `#${order.id}`}
                  </h1>
                  <Badge className={`${statusInfo.className} border-0 text-sm`}>
                    {t(statusInfo.labelKey)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{date}</p>
              </div>

              <Separator />

              {/* Recipient - masked */}
              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('recipient')}</h3>
                <div className="space-y-1 opacity-40 blur-sm select-none cursor-not-allowed">
                  <p className="font-medium">
                    {order.last_name} {order.first_name}{' '}
                    {order.middle_name || ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPhone(order.phone)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {t('return_data_hidden')}
                </p>
              </div>

              <Separator />

              {/* Delivery - masked */}
              <div className="space-y-2">
                <h3 className="font-semibold text-base">
                  {t('delivery_type')}
                </h3>
                <div className="space-y-1 opacity-40 blur-sm select-none cursor-not-allowed">
                  <p className="font-medium">{order.delivery_type}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.delivery_city || '—'},{' '}
                    {order.delivery_warehouse || '—'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {t('return_data_hidden')}
                </p>
              </div>

              <Separator />

              {/* Payment - masked */}
              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('payment')}</h3>
                <div className="opacity-40 blur-sm select-none cursor-not-allowed">
                  <p className="font-medium text-sm">{order.payment_method}</p>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {t('return_data_hidden')}
                </p>
              </div>
            </div>

            {/* Right: Items with qty controls */}
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{t('return_items')}</h3>
              <div className="space-y-3">
                {visibleItems.map((item: any) => {
                  const qty = quantities[item.part_id] ?? item.quantity
                  const itemTotal = qty * item.price
                  const maxQty = item.quantity
                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {item.brand && (
                            <Badge
                              variant="secondary"
                              className="text-sm px-1.5"
                            >
                              {item.brand}
                            </Badge>
                          )}
                          <span className="text-sm font-mono text-muted-foreground">
                            {item.article}
                          </span>
                        </div>
                        <p className="text-sm font-medium line-clamp-2">
                          {item.part_name}
                        </p>
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-full"
                              onClick={() =>
                                handleQuantityChange(item.part_id, -1)
                              }
                              disabled={qty <= 1}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-8 text-center font-medium tabular-nums">
                              {qty}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-full"
                              onClick={() =>
                                handleQuantityChange(item.part_id, 1)
                              }
                              disabled={qty >= maxQty}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground ml-1">
                              × {fmt(item.price)} ₴
                            </span>
                          </div>
                          <span className="font-semibold text-base">
                            {fmt(itemTotal)} ₴
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="shrink-0"
                              onClick={() => handleRemoveItem(item.part_id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t('delete')}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
                {visibleItems.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    {t('no_items')}
                  </p>
                )}
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-base">
                  {t('return_total')}:
                </span>
                <span className="font-bold text-2xl">{fmt(totalRefund)} ₴</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

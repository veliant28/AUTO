'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMessages, useLocale } from 'next-intl'
import { ArrowLeft, Package, FileText, Loader2, CreditCard } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useAuthStore } from '@/store/authStore'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { useOrderSync } from '@/lib/orderSync'
import { getOrderReceiptLink } from '@/lib/api/checkbox'
import MonopayStandaloneButton from '@/components/ui/MonopayStandaloneButton'
import NovaPayStandaloneButton from '@/components/ui/NovaPayStandaloneButton'
import LiqPayStandaloneButton from '@/components/ui/LiqPayStandaloneButton'

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

const DELIVERY_LABELS: Record<string, string> = {
  warehouse: 'delivery_warehouse',
  parcel_locker: 'delivery_parcel_locker',
  courier: 'delivery_courier',
}

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'payment_cod',
  monobank: 'payment_monobank',
  novapay: 'payment_novapay',
  liqpay: 'payment_liqpay',
}

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

export default function OrderDetailPage() {
  useOrderSync()
  const [mounted, setMounted] = React.useState(false)
  const [receiptLoading, setReceiptLoading] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const handleReceiptClick = async () => {
    setReceiptLoading(true)
    try {
      const link = await getOrderReceiptLink(Number(orderId))
      if (link?.url) {
        window.open(link.url, '_blank', 'noopener,noreferrer')
      } else {
        toast.info(t('receipt_no_link'))
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || ''
      if (msg?.includes('not available') || msg?.includes('недоступн')) {
        toast.info(t('receipt_pending'))
      } else {
        toast.error(msg || t('receipt_error'))
      }
    } finally {
      setReceiptLoading(false)
    }
  }

  const messages = useMessages()
  const msgs = messages as Record<string, any>
  const t = (key: string) => msgs?.common?.[key] ?? key
  const params = useParams()
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

  const { data: payment } = useQuery({
    queryKey: ['order-payment-status', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}/payment`)
      return data
    },
    refetchInterval: 15000,
    enabled: !!orderId && isAuthenticated,
  })

  const locale = LOCALE_MAP[useLocale()] || 'ru-RU'

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

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)
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

  const deliveryLabelKey = DELIVERY_LABELS[order.delivery_type]
  const deliveryLabel = deliveryLabelKey
    ? t(deliveryLabelKey)
    : order.delivery_type

  const paymentLabelKey = PAYMENT_LABELS[order.payment_method]
  const paymentLabel = paymentLabelKey
    ? t(paymentLabelKey)
    : order.payment_method

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <Link href="/orders">
          <Button variant="outline" size="lg" className="gap-2 mb-6">
            <ArrowLeft className="w-5 h-5" /> {t('all_orders')}
          </Button>
        </Link>

        <div className="rounded-lg border bg-card p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Order info + Recipient + Delivery + Payment */}
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold font-mono">
                      {order.order_number || `#${order.id}`}
                    </h1>
                    <Badge
                      className={`${statusInfo.className} border-0 text-sm`}
                    >
                      {t(statusInfo.labelKey)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{date}</p>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={receiptLoading}
                  onClick={handleReceiptClick}
                >
                  {receiptLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                  {t('receipt')}
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('recipient')}</h3>
                <p className="font-medium">
                  {order.last_name} {order.first_name} {order.middle_name || ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatPhone(order.phone)}
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold text-base">
                  {t('delivery_type')}
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{deliveryLabel}</p>
                  {order.delivery_type === 'courier' ? (
                    <>
                      <p className="text-muted-foreground">
                        {order.delivery_city || '—'}
                      </p>
                      <p className="text-muted-foreground">
                        {[
                          order.delivery_street_label,
                          order.delivery_house,
                          order.delivery_apartment,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {[order.delivery_city, order.delivery_warehouse]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">{t('payment')}</h3>
                  <PaymentBadge
                    payment={payment}
                    paymentMethod={order.payment_method}
                    paymentLabel={paymentLabel}
                    t={t}
                  />
                </div>
                <PaymentActions
                  orderId={order.id}
                  payment={payment}
                  paymentMethod={order.payment_method}
                  paymentLabel={paymentLabel}
                  t={t}
                />
              </div>
            </div>

            {/* Right: Items + Total */}
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{t('order_contents')}</h3>
              <div className="grid grid-cols-[1fr_auto_100px] gap-x-4 items-start">
                {order.items?.map((item: any, index: number) => (
                  <React.Fragment key={item.id}>
                    <div
                      className={`min-w-0 space-y-1 py-3 ${index > 0 ? 'border-t pt-3' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.brand && (
                          <Badge variant="secondary" className="text-sm px-1.5">
                            {item.brand}
                          </Badge>
                        )}
                        <span className="text-sm font-mono text-muted-foreground">
                          {item.article}
                        </span>
                      </div>
                      <p className="font-medium text-sm line-clamp-1">
                        {item.part_name}
                      </p>
                    </div>

                    <div
                      className={`py-3 flex items-start ${index > 0 ? 'border-t pt-3' : ''}`}
                    >
                      {item.sku && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-blue-500 text-white border-0 text-sm px-1.5 cursor-pointer">
                              {item.sku}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{t('sku')}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    <div
                      className={`text-right shrink-0 py-3 ${index > 0 ? 'border-t pt-3' : ''}`}
                    >
                      <span className="text-sm text-muted-foreground">
                        {item.quantity} &times; {fmt(item.price)} ₴
                      </span>
                      <p className="font-semibold text-base">
                        {fmt(item.quantity * item.price)} ₴
                      </p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <Separator />
              {order.discount_amount > 0 && (
                <div className="flex justify-between items-center text-green-600">
                  <span className="font-semibold text-base">
                    {t('discount_label')}
                  </span>
                  <span className="font-bold text-lg">
                    -{fmt(order.discount_amount)} ₴
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="font-semibold text-base">
                  {t('total_label')}:
                </span>
                <span className="font-bold text-2xl">{fmt(order.total)} ₴</span>
              </div>
              {order.promocode_type === 'delivery' && (
                <div className="flex justify-between items-center text-green-600 pt-1">
                  <span className="font-semibold text-base">
                    {t('delivery_label')}:
                  </span>
                  <span className="font-bold text-lg">
                    {t('delivery_free')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ── Payment Display component ─────────────────────────────────────
// ── Payment Badge (shown inline next to "Оплата") ───────────────
const PAYMENT_STATUS_CFG_STORE: Record<
  string,
  { labelKey: string; className: string }
> = {
  paid: { labelKey: 'payment_paid', className: 'bg-green-600 text-white' },
  pending: {
    labelKey: 'payment_pending',
    className: 'bg-yellow-500 text-white',
  },
  failed: { labelKey: 'payment_failed', className: 'bg-red-600 text-white' },
  refunded: {
    labelKey: 'payment_refunded',
    className: 'bg-purple-600 text-white',
  },
  expired: { labelKey: 'payment_expired', className: 'bg-gray-500 text-white' },
}

function PaymentBadge({
  payment,
  paymentMethod,
  paymentLabel,
  t,
}: {
  payment: any
  paymentMethod: string
  paymentLabel: string
  t: (key: string) => string
}) {
  if (paymentMethod === 'cod') {
    return (
      <Badge className="bg-green-600 text-white border-0 text-sm">
        {t('payment_cod')}
      </Badge>
    )
  }

  const status = payment?.status || 'pending'
  const cfg = PAYMENT_STATUS_CFG_STORE[status]
  if (cfg) {
    return (
      <Badge className={`${cfg.className} border-0 text-sm`}>
        {t(cfg.labelKey)}
      </Badge>
    )
  }

  // Unknown status — fallback
  return (
    <Badge className="bg-gray-500 text-white border-0 text-sm">{status}</Badge>
  )
}

// ── Payment Actions (pay button shown below) ─────────────────────
function PaymentActions({
  orderId,
  payment,
  paymentMethod,
  paymentLabel,
  t,
}: {
  orderId: number
  payment: any
  paymentMethod: string
  paymentLabel: string
  t: (key: string) => string
}) {
  const [payLoading, setPayLoading] = React.useState(false)

  if (paymentMethod === 'cod' || payment?.status === 'paid') {
    return null
  }

  if (paymentMethod === 'monobank') {
    return (
      <div className="space-y-1">
        <MonopayStandaloneButton
          onClick={async () => {
            setPayLoading(true)
            try {
              const { data } = await api.post(
                `/orders/${orderId}/pay?method=monobank`,
              )
              if (data?.payment_url) {
                window.open(data.payment_url, '_blank', 'noopener,noreferrer')
              } else {
                toast.info(t('receipt_pending'))
              }
            } catch (err: any) {
              const msg = err?.response?.data?.detail || err?.message || ''
              toast.error(msg || t('receipt_error'))
            } finally {
              setPayLoading(false)
            }
          }}
          loading={payLoading}
        />
      </div>
    )
  }

  if (paymentMethod === 'novapay') {
    return (
      <div className="space-y-1">
        <NovaPayStandaloneButton
          onClick={async () => {
            setPayLoading(true)
            try {
              const { data } = await api.post(
                `/orders/${orderId}/pay?method=novapay`,
              )
              if (data?.payment_url) {
                window.open(data.payment_url, '_blank', 'noopener,noreferrer')
              } else {
                toast.info(t('receipt_pending'))
              }
            } catch (err: any) {
              const msg = err?.response?.data?.detail || err?.message || ''
              toast.error(msg || t('receipt_error'))
            } finally {
              setPayLoading(false)
            }
          }}
          loading={payLoading}
        />
      </div>
    )
  }

  if (paymentMethod === 'liqpay') {
    return (
      <div className="space-y-1">
        <LiqPayStandaloneButton
          onClick={async () => {
            setPayLoading(true)
            try {
              const { data } = await api.post(
                `/orders/${orderId}/pay?method=liqpay`,
              )
              if (data?.payment_url) {
                window.open(data.payment_url, '_blank', 'noopener,noreferrer')
              } else {
                toast.info(t('receipt_pending'))
              }
            } catch (err: any) {
              const msg = err?.response?.data?.detail || err?.message || ''
              toast.error(msg || t('receipt_error'))
            } finally {
              setPayLoading(false)
            }
          }}
          loading={payLoading}
        />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        onClick={async () => {
          setPayLoading(true)
          try {
            const { data } = await api.post(
              `/orders/${orderId}/pay?method=${paymentMethod}`,
            )
            if (data?.payment_url) {
              window.open(data.payment_url, '_blank', 'noopener,noreferrer')
            } else {
              toast.info(t('receipt_pending'))
            }
          } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || ''
            toast.error(msg || t('receipt_error'))
          } finally {
            setPayLoading(false)
          }
        }}
        disabled={payLoading}
      >
        {payLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4" />
        )}
        {t('payment_pay_with', { bank: paymentLabel })}
      </Button>
    </div>
  )
}

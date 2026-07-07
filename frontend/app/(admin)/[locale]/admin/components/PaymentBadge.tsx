'use client'

import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { getTransaction } from '@/lib/api/payments'

const STATUS_CFG: Record<string, { labelKey: string; className: string }> = {
  paid: {
    labelKey: 'payment_status_paid',
    className: 'bg-green-600 text-white',
  },
  pending: {
    labelKey: 'payment_status_pending',
    className: 'bg-yellow-500 text-white',
  },
  failed: {
    labelKey: 'payment_status_failed',
    className: 'bg-red-600 text-white',
  },
  refunded: {
    labelKey: 'payment_status_refunded',
    className: 'bg-purple-600 text-white',
  },
  expired: {
    labelKey: 'payment_status_expired',
    className: 'bg-gray-500 text-white',
  },
}

export default function PaymentBadge({
  orderId,
  paymentMethod,
  t,
}: {
  orderId: number
  paymentMethod: string
  t: (key: string) => string
}) {
  const { data: tx } = useQuery({
    queryKey: ['order-payment-badge', orderId],
    queryFn: () => getTransaction(orderId).catch(() => null),
    refetchInterval: 5000,
  })

  // COD — special green badge
  if (paymentMethod === 'cod') {
    return (
      <Badge className="bg-green-600 text-white border-0 text-sm">
        {t('payment_method_cod')}
      </Badge>
    )
  }

  const status = tx?.status || 'pending'
  const cfg = STATUS_CFG[status]
  if (cfg) {
    return (
      <Badge className={`${cfg.className} border-0 text-sm`}>
        {t(cfg.labelKey)}
      </Badge>
    )
  }

  // fallback for unknown statuses
  return (
    <Badge className="bg-gray-500 text-white border-0 text-sm">{status}</Badge>
  )
}

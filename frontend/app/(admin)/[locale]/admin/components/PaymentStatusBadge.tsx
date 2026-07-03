'use client'

import { Badge } from '@/components/ui/badge'

export default function PaymentStatusBadge({
  status,
  t,
}: {
  status: string
  t: (key: string) => string
}) {
  const config: Record<string, { label: string; className: string }> = {
    paid: {
      label: t('payment_status_paid'),
      className: 'bg-green-600 text-white',
    },
    pending: {
      label: t('payment_status_pending'),
      className: 'bg-yellow-500 text-white',
    },
    failed: {
      label: t('payment_status_failed'),
      className: 'bg-red-600 text-white',
    },
    refunded: {
      label: t('payment_status_refunded'),
      className: 'bg-purple-600 text-white',
    },
    expired: {
      label: t('payment_status_expired'),
      className: 'bg-gray-500 text-white',
    },
  }
  const cfg = config[status] || {
    label: status,
    className: 'bg-gray-500 text-white',
  }
  return (
    <Badge className={`${cfg.className} border-0 text-xs`}>{cfg.label}</Badge>
  )
}

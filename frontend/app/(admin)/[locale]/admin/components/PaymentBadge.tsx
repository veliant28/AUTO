'use client'

import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { getTransaction } from '@/lib/api/payments'
import PaymentStatusBadge from './PaymentStatusBadge'

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

  if (paymentMethod === 'cod') {
    return (
      <Badge className="bg-green-600 text-white border-0 text-sm">
        {t('payment_method_cod')}
      </Badge>
    )
  }

  return <PaymentStatusBadge status={tx?.status || 'pending'} t={t} />
}

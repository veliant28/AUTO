'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Loader2, CreditCard } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getTransaction, initPayment } from '@/lib/api/payments'
import MonopayStandaloneButton from '@/components/ui/MonopayStandaloneButton'
import PaymentStatusBadge from './PaymentStatusBadge'

export default function PaymentBlock({
  orderId,
  paymentMethod,
}: {
  orderId: number
  paymentMethod: string
}) {
  const t = useTranslations('admin')

  const {
    data: tx,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['order-payment', orderId],
    queryFn: () => getTransaction(orderId).catch(() => null),
    refetchInterval: 15000,
  })

  const [initLoading, setInitLoading] = useState<string | null>(null)

  const handleInitPayment = async (method: string) => {
    setInitLoading(method)
    try {
      const result = await initPayment(orderId, method)
      if (result.payment_url) {
        window.open(result.payment_url, '_blank', 'noopener,noreferrer')
        toast.success(t('payment_init_success'))
        refetch()
      } else {
        toast.error(result.message || t('payment_init_error'))
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || t('payment_init_error'))
    } finally {
      setInitLoading(null)
    }
  }

  const methodLabels: Record<string, string> = {
    monobank: 'Monobank',
    novapay: 'NovaPay',
    liqpay: 'LiqPay',
  }
  const label = methodLabels[paymentMethod] || paymentMethod

  // Monobank → use official Monopay widget
  if (paymentMethod === 'monobank') {
    return (
      <div className="space-y-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : tx?.status === 'paid' ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {t('payment_status')}:
              </span>
              <PaymentStatusBadge status={tx.status} t={t} />
            </div>
            {tx.receipt_url && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(tx.receipt_url!, '_blank')}
              >
                {t('payment_receipt')}
              </Button>
            )}
          </div>
        ) : (
          <MonopayStandaloneButton
            onClick={() => handleInitPayment('monobank')}
          />
        )}
      </div>
    )
  }

  // Other banks (NovaPay, LiqPay)
  return (
    <div className="space-y-3">
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : tx ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t('payment_status')}:
            </span>
            <PaymentStatusBadge status={tx.status} t={t} />
          </div>
          {tx.provider_tx_id && (
            <p className="text-muted-foreground text-xs font-mono">
              ID: {tx.provider_tx_id}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            {(tx.status === 'pending' ||
              tx.status === 'failed' ||
              tx.status === 'expired') && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => handleInitPayment(paymentMethod)}
                disabled={initLoading === paymentMethod}
              >
                {initLoading === paymentMethod ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {t('payment_pay_via', { bank: label })}
              </Button>
            )}
            {tx.invoice_url && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(tx.invoice_url!, '_blank')}
              >
                {t('payment_invoice')}
              </Button>
            )}
            {tx.receipt_url && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(tx.receipt_url!, '_blank')}
              >
                {t('payment_receipt')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="gap-1.5"
          onClick={() => handleInitPayment(paymentMethod)}
          disabled={initLoading === paymentMethod}
        >
          {initLoading === paymentMethod ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          {t('payment_pay_via', { bank: label })}
        </Button>
      )}
    </div>
  )
}

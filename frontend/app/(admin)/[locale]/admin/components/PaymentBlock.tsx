'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Loader2, CreditCard, XCircle, FileText } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getTransaction, initPayment, cancelInvoice } from '@/lib/api/payments'
import MonopayStandaloneButton from '@/components/ui/MonopayStandaloneButton'
import NovaPayStandaloneButton from '@/components/ui/NovaPayStandaloneButton'
import LiqPayStandaloneButton from '@/components/ui/LiqPayStandaloneButton'
import DefaultPaymentButton from '@/components/ui/DefaultPaymentButton'

const PAYMENT_STATUS_CFG: Record<
  string,
  { labelKey: string; className: string }
> = {
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
    refetchInterval: 5000,
  })

  const [initLoading, setInitLoading] = useState<string | null>(null)

  const handleCancelInvoice = async () => {
    try {
      await cancelInvoice(orderId)
      toast.success('Инвойс отозван')
      refetch()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || 'Ошибка отмены инвойса')
    }
  }

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
        ) : tx ? (
          <div className="space-y-2 text-sm">
            {tx.provider_tx_id && (
              <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded text-sm font-mono">
                ID: {tx.provider_tx_id}
              </span>
            )}
            <div className="flex gap-2 pt-1">
              {(tx.status === 'pending' ||
                tx.status === 'failed' ||
                tx.status === 'expired') && (
                <MonopayStandaloneButton
                  onClick={() => handleInitPayment('monobank')}
                />
              )}
              {tx.status === 'pending' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={handleCancelInvoice}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Отозвать инвойс</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!tx.receipt_url}
                    onClick={() =>
                      tx.receipt_url && window.open(tx.receipt_url, '_blank')
                    }
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {t('payment_receipt')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          <MonopayStandaloneButton
            onClick={() => handleInitPayment('monobank')}
          />
        )}
      </div>
    )
  }

  // NovaPay → purple button
  if (paymentMethod === 'novapay') {
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
              {(() => {
                const c =
                  PAYMENT_STATUS_CFG[tx.status] || PAYMENT_STATUS_CFG.pending
                return (
                  <Badge className={`${c.className} border-0 text-sm`}>
                    {t(c.labelKey)}
                  </Badge>
                )
              })()}
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
          <NovaPayStandaloneButton
            onClick={() => handleInitPayment('novapay')}
          />
        )}
      </div>
    )
  }

  // LiqPay → branded button
  if (paymentMethod === 'liqpay') {
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
              {(() => {
                const c =
                  PAYMENT_STATUS_CFG[tx.status] || PAYMENT_STATUS_CFG.pending
                return (
                  <Badge className={`${c.className} border-0 text-sm`}>
                    {t(c.labelKey)}
                  </Badge>
                )
              })()}
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
          <LiqPayStandaloneButton onClick={() => handleInitPayment('liqpay')} />
        )}
      </div>
    )
  }

  // Other banks (fallback)
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
            {(() => {
              const c =
                PAYMENT_STATUS_CFG[tx.status] || PAYMENT_STATUS_CFG.pending
              return (
                <Badge className={`${c.className} border-0 text-sm`}>
                  {t(c.labelKey)}
                </Badge>
              )
            })()}
          </div>
          {tx.provider_tx_id && (
            <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded text-sm font-mono">
              ID: {tx.provider_tx_id}
            </span>
          )}
          <div className="flex gap-2 pt-1">
            {(tx.status === 'pending' ||
              tx.status === 'failed' ||
              tx.status === 'expired') && (
              <DefaultPaymentButton
                onClick={() => handleInitPayment(paymentMethod)}
                loading={initLoading === paymentMethod}
                disabled={initLoading === paymentMethod}
                label={t('payment_pay_via', { bank: label })}
              />
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

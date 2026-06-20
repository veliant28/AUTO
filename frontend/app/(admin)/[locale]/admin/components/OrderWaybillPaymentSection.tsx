'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CreditCard, ArrowLeft, AlertCircle, Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type PayerType = 'Sender' | 'Recipient' | 'ThirdPerson'
type PaymentMethod = 'Cash' | 'NonCash'

interface Props {
  payerType: PayerType
  paymentMethod: PaymentMethod
  afterpaymentAmount: string | undefined
  cost: string
  syncError: string
  disabled: boolean
  onChange: (field: string, value: any) => void
}

export default function OrderWaybillPaymentSection({
  payerType,
  paymentMethod,
  afterpaymentAmount,
  cost,
  syncError,
  disabled,
  onChange,
}: Props) {
  const t = useTranslations('admin')
  const [showAdditional, setShowAdditional] = useState(false)

  const payerTypeLabels: Record<PayerType, string> = {
    Sender: t('novaposhta_payer_sender'),
    Recipient: t('novaposhta_payer_recipient'),
    ThirdPerson: t('novaposhta_payer_third_person'),
  }

  const paymentMethodLabels: Record<PaymentMethod, string> = {
    Cash: t('novaposhta_payment_cash'),
    NonCash: t('novaposhta_payment_noncash'),
  }

  const additionalServices = [
    { field: 'saturday_delivery', label: t('novaposhta_saturday_delivery') },
    { field: 'local_express', label: t('novaposhta_local_express') },
    { field: 'delivery_by_hand', label: t('novaposhta_delivery_by_hand') },
    { field: 'special_cargo', label: t('novaposhta_special_cargo') },
  ]

  const handlePayerType = (value: PayerType) => {
    onChange('payer_type', value)
  }

  const handlePaymentMethod = (value: PaymentMethod) => {
    onChange('payment_method', value)
  }

  return (
    <section className="order-4 rounded-md border p-3 xl:h-[460px] xl:overflow-y-auto bg-card">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          {showAdditional
            ? t('novaposhta_additional_services_short')
            : t('novaposhta_payment')}
        </h3>
        {showAdditional && (
          <Button
            type="button"
            variant="outline"
            className="h-9 ml-auto"
            onClick={() => setShowAdditional(false)}
          >
            {t('novaposhta_back')}
          </Button>
        )}
      </div>

      <div className="grid gap-1.5 pt-2">
        {!showAdditional ? (
          <>
            {/* Cost summary */}
            <div className="grid gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {t('novaposhta_to_pay')}
                </span>
                <span className="font-semibold">{cost || '0'} ₴</span>
              </div>
              {afterpaymentAmount && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {t('novaposhta_afterpayment_summary')}
                  </span>
                  <span className="font-semibold">{afterpaymentAmount} ₴</span>
                </div>
              )}
            </div>

            {/* Payer type */}
            <div className="grid gap-0.5">
              <Label className="text-xs text-muted-foreground">
                {t('novaposhta_payer_type')}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(payerTypeLabels) as PayerType[]).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={payerType === value ? 'default' : 'outline'}
                    className="h-9"
                    disabled={disabled}
                    onClick={() => handlePayerType(value)}
                  >
                    {payerTypeLabels[value]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div className="grid gap-0.5">
              <Label className="text-xs text-muted-foreground">
                {t('novaposhta_payment_method_label')}
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(
                  (value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={paymentMethod === value ? 'default' : 'outline'}
                      className="h-9"
                      disabled={disabled}
                      onClick={() => handlePaymentMethod(value)}
                    >
                      {paymentMethodLabels[value]}
                    </Button>
                  ),
                )}
              </div>
            </div>

            {/* Additional services button */}
            <Button
              type="button"
              variant="outline"
              className="mt-2 gap-1.5 h-9"
              disabled={disabled}
              onClick={() => setShowAdditional(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('novaposhta_additional_services')}
            </Button>
          </>
        ) : (
          /* Additional services */
          <div className="grid gap-1.5">
            <div className="grid gap-0.5">
              <Label className="text-xs text-muted-foreground">
                {t('novaposhta_afterpayment_amount')}
              </Label>
              <Input
                value={afterpaymentAmount || ''}
                onChange={(e) =>
                  onChange('afterpayment_amount', e.target.value || undefined)
                }
                disabled={disabled}
                className="h-9"
                placeholder="0.00"
              />
            </div>

            <Label className="text-xs text-muted-foreground mt-1">
              {t('novaposhta_additional')}
            </Label>
            {additionalServices.map(({ field, label }) => (
              <label
                key={field}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm cursor-pointer"
              >
                <Checkbox
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(field, checked === true)
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Sync error banner */}
        {syncError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive mt-2">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="leading-4">{syncError}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

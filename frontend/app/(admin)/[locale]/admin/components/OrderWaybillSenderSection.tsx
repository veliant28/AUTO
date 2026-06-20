'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Building2, MoreHorizontal, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import type { NovaPoshtaSenderProfile } from '@/lib/types/nova-poshta'

interface Props {
  sender: NovaPoshtaSenderProfile | undefined
  senders: NovaPoshtaSenderProfile[]
  senderCounterpartyDisplay: string
  senderCityDisplay: string
  senderAddressDisplay: string
  senderPhone: string
  senderContactName: string
  disabled: boolean
  onSenderChange: (id: number) => void
}

export default function OrderWaybillSenderSection({
  sender,
  senders,
  senderCounterpartyDisplay,
  senderCityDisplay,
  senderAddressDisplay,
  senderPhone,
  senderContactName,
  disabled,
  onSenderChange,
}: Props) {
  const t = useTranslations('admin')

  function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    const normalized = digits.length >= 12 ? digits.slice(-10) : digits
    if (normalized.length === 10) {
      return `+38 (${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8, 10)}`
    }
    return phone
  }

  const displayFields = [
    { label: 'novaposhta_phone', value: formatPhone(senderPhone) },
    { label: 'novaposhta_counterparty', value: senderCounterpartyDisplay },
    { label: 'novaposhta_contact_name', value: senderContactName },
    { label: 'novaposhta_city', value: senderCityDisplay },
    { label: 'novaposhta_address', value: senderAddressDisplay },
  ]

  return (
    <section className="order-1 rounded-md border p-3 xl:h-[460px] xl:overflow-y-auto bg-card">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          {t('novaposhta_sender')}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={disabled || senders.length === 0}
              aria-label={t('novaposhta_select_sender')}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            <DropdownMenuLabel>
              {t('novaposhta_sender_profiles')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {senders.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                {t('novaposhta_no_profiles')}
              </p>
            ) : (
              senders.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onSenderChange(item.id)}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.id === sender?.id && (
                    <Check className="w-3.5 h-3.5 shrink-0 text-primary ml-2" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-1.5 pt-2">
        {displayFields.map((field) => (
          <div key={field.label} className="grid gap-0.5">
            <Label className="text-xs text-muted-foreground">
              {t(field.label)}
            </Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
              <span
                className={
                  field.value ? 'truncate' : 'truncate text-muted-foreground'
                }
              >
                {field.value || '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

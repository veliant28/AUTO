'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Building2, MoreHorizontal, Check, ChevronDown } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  NovaPoshtaSenderProfile,
  NovaPoshtaCounterpartyAddress,
} from '@/lib/types/nova-poshta'

interface Props {
  sender: NovaPoshtaSenderProfile | undefined
  senders: NovaPoshtaSenderProfile[]
  senderCounterpartyDisplay: string
  senderCityDisplay: string
  senderAddressDisplay: string
  senderPhone: string
  senderContactName: string
  /** Available addresses for the selected sender's counterparty */
  senderAddresses: NovaPoshtaCounterpartyAddress[]
  /** Currently selected address ref (may differ from sender.address_ref) */
  selectedAddressRef: string
  disabled: boolean
  onSenderChange: (id: number) => void
  /** Called when user picks a different address from the dropdown */
  onAddressChange: (addressRef: string) => void
}

export default function OrderWaybillSenderSection({
  sender,
  senders,
  senderCounterpartyDisplay,
  senderCityDisplay,
  senderAddressDisplay,
  senderPhone,
  senderContactName,
  senderAddresses,
  selectedAddressRef,
  disabled,
  onSenderChange,
  onAddressChange,
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
  ]

  const currentAddressLabel =
    senderAddresses.find((a) => a.ref === selectedAddressRef)?.description ||
    senderAddressDisplay

  return (
    <section className="order-1 rounded-md border p-3 xl:h-[460px] xl:overflow-y-auto bg-card overflow-x-hidden">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <Building2 className="w-5 h-5" />
          {t('novaposhta_sender')}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
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

      <div className="grid gap-1.5 pt-2 min-w-0">
        {displayFields.map((field) => (
          <div key={field.label} className="grid gap-0.5">
            <Label className="text-sm text-muted-foreground">
              {t(field.label)}
            </Label>
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
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

        {/* Address with dropdown selector */}
        <div className="grid gap-0.5">
          <Label className="text-sm text-muted-foreground">
            {t('novaposhta_address')}
          </Label>
          {senderAddresses.length > 1 ? (
            <Select
              value={selectedAddressRef || sender?.address_ref || ''}
              onValueChange={onAddressChange}
              disabled={disabled}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={currentAddressLabel || '—'} />
              </SelectTrigger>
              <SelectContent>
                {senderAddresses.map((addr) => (
                  <SelectItem key={addr.ref} value={addr.ref}>
                    {addr.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span
                className={
                  currentAddressLabel
                    ? 'truncate'
                    : 'truncate text-muted-foreground'
                }
              >
                {currentAddressLabel || '—'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

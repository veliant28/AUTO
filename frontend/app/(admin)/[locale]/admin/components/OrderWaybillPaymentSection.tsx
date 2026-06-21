'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Search, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type { NovaPoshtaServiceItem } from '@/lib/types/nova-poshta'

type PayerType = 'Sender' | 'Recipient' | 'ThirdPerson'
type PaymentMethod = 'Cash' | 'NonCash'

interface Props {
  payerType: PayerType
  paymentMethod: PaymentMethod
  afterpaymentAmount: string | undefined
  cost: string
  syncError: string
  disabled: boolean
  isServicesMode?: boolean
  onServicesModeChange?: (mode: boolean) => void
  senderProfileId?: number
  onChange: (field: string, value: any) => void
}

export default function OrderWaybillPaymentSection({
  payerType,
  paymentMethod,
  afterpaymentAmount,
  cost,
  syncError,
  disabled,
  isServicesMode = false,
  onServicesModeChange,
  senderProfileId,
  onChange,
}: Props) {
  const t = useTranslations('admin')

  // ── Services mode state ──────────────────────────────────────────────────
  const [servicesQuery, setServicesQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [selectedServices, setSelectedServices] = useState<
    NovaPoshtaServiceItem[]
  >([])
  const [checkedServiceRefs, setCheckedServiceRefs] = useState<Set<string>>(
    new Set(),
  )
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch services from NP API ───────────────────────────────────────────
  const { data: allServices = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ['np-lookup', 'services', senderProfileId],
    queryFn: () =>
      novaPoshtaApi
        .getServices({ sender_profile_id: senderProfileId || undefined })
        .then((r) => r.data),
    enabled: isServicesMode,
  })

  // Filter services by query
  const filteredServices = allServices.filter(
    (s) =>
      s.description.toLowerCase().includes(servicesQuery.toLowerCase()) ||
      s.description_ru.toLowerCase().includes(servicesQuery.toLowerCase()),
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search input when services mode activates
  useEffect(() => {
    if (isServicesMode) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isServicesMode])

  // ── Service selection helpers ────────────────────────────────────────────

  const addService = useCallback((service: NovaPoshtaServiceItem) => {
    setSelectedServices((prev) => {
      if (prev.some((s) => s.ref === service.ref)) return prev
      return [...prev, service]
    })
    setServicesQuery('')
    setIsDropdownOpen(false)
    setHighlightedIdx(-1)
    searchInputRef.current?.focus()
  }, [])

  const toggleServiceCheck = useCallback((ref: string) => {
    setCheckedServiceRefs((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }, [])

  const toggleSelectAllServices = useCallback(() => {
    setCheckedServiceRefs((prev) =>
      prev.size === selectedServices.length
        ? new Set()
        : new Set(selectedServices.map((s) => s.ref)),
    )
  }, [selectedServices])

  const deleteSelectedServices = useCallback(() => {
    setSelectedServices((prev) =>
      prev.filter((s) => !checkedServiceRefs.has(s.ref)),
    )
    setCheckedServiceRefs(new Set())
  }, [checkedServiceRefs])

  // ── Keyboard navigation for search dropdown ──────────────────────────────

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isDropdownOpen || filteredServices.length === 0) {
        if (e.key === 'Enter' && servicesQuery.trim()) {
          setIsDropdownOpen(true)
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIdx((p) => Math.min(p + 1, filteredServices.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIdx((p) => Math.max(p - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIdx >= 0 && highlightedIdx < filteredServices.length) {
            addService(filteredServices[highlightedIdx])
          }
          break
        case 'Escape':
          setIsDropdownOpen(false)
          setHighlightedIdx(-1)
          break
      }
    },
    [
      isDropdownOpen,
      filteredServices,
      highlightedIdx,
      addService,
      servicesQuery,
    ],
  )

  // ── Cancel / Add handlers ────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setSelectedServices([])
    setCheckedServiceRefs(new Set())
    setServicesQuery('')
    setIsDropdownOpen(false)
    setHighlightedIdx(-1)
    onServicesModeChange?.(false)
  }, [onServicesModeChange])

  const handleAdd = useCallback(() => {
    onChange(
      'service_refs',
      selectedServices.map((s) => s.ref),
    )
    onChange(
      'service_names',
      selectedServices.map((s) => s.description),
    )
    setServicesQuery('')
    setIsDropdownOpen(false)
    setHighlightedIdx(-1)
    onServicesModeChange?.(false)
  }, [selectedServices, onChange, onServicesModeChange])

  // ── Normal mode UI ───────────────────────────────────────────────────────

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Services mode
  // ═══════════════════════════════════════════════════════════════════════════

  if (isServicesMode) {
    const allChecked =
      selectedServices.length > 0 &&
      checkedServiceRefs.size === selectedServices.length

    return (
      <section className="order-4 rounded-md border p-3 xl:h-[460px] flex flex-col bg-card">
        {/* Header */}
        <div className="flex min-h-8 items-center gap-2 shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            {t('novaposhta_additional_services_title')}
          </h3>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0 pt-2">
          {/* Search field */}
          <div ref={dropdownRef} className="relative">
            <div className="relative overflow-visible">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={servicesQuery}
                onChange={(e) => {
                  setServicesQuery(e.target.value)
                  setIsDropdownOpen(true)
                  setHighlightedIdx(-1)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('novaposhta_search_services')}
                className="h-9 pl-8"
                disabled={disabled}
              />
              {isLoadingServices && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Dropdown */}
            {isDropdownOpen && (
              <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-lg max-h-[240px] overflow-y-auto py-1">
                {filteredServices.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                    {servicesQuery.trim()
                      ? t('novaposhta_no_services_found')
                      : t('novaposhta_type_to_search_service')}
                  </div>
                ) : (
                  filteredServices.map((item, idx) => (
                    <div
                      key={item.ref}
                      data-index={idx}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        idx === highlightedIdx ? 'bg-accent' : 'hover:bg-muted'
                      }`}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => addService(item)}
                    >
                      <span className="text-sm font-medium">
                        {item.description}
                      </span>
                      {item.price !== '0' && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.price} ₴
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected services table */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 px-0.5">
            {selectedServices.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4 border rounded-md">
                {t('novaposhta_no_services_selected')}
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex items-center justify-between shrink-0">
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'h-9 gap-2 px-3 cursor-pointer',
                    )}
                    onClick={toggleSelectAllServices}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleSelectAllServices()
                      }
                    }}
                  >
                    <Checkbox checked={allChecked} className="cursor-pointer" />
                    {t('novaposhta_services_select_all')}
                  </div>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={checkedServiceRefs.size === 0}
                    onClick={deleteSelectedServices}
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('novaposhta_services_delete_selected')}
                  </Button>
                </div>

                {/* Rows */}
                <div className="border rounded-md divide-y">
                  {selectedServices.map((item) => (
                    <div
                      key={item.ref}
                      className="flex items-center gap-2 px-3 h-9"
                    >
                      <Checkbox
                        checked={checkedServiceRefs.has(item.ref)}
                        onCheckedChange={() => toggleServiceCheck(item.ref)}
                        className="cursor-pointer"
                      />
                      <span
                        className="flex-1 text-sm min-w-0 truncate cursor-pointer"
                        onClick={() => toggleServiceCheck(item.ref)}
                      >
                        {item.description}
                      </span>
                      {item.price !== '0' && (
                        <span className="text-sm font-medium text-foreground shrink-0">
                          {item.price} ₴
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bottom buttons */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={disabled}
              onClick={handleCancel}
            >
              {t('novaposhta_services_cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-9"
              disabled={disabled || selectedServices.length === 0}
              onClick={handleAdd}
            >
              {t('novaposhta_services_add')}
            </Button>
          </div>
        </div>
      </section>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Normal mode
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <section className="order-4 rounded-md border p-3 xl:h-[460px] xl:overflow-y-auto bg-card">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          {t('novaposhta_payment')}
        </h3>
      </div>

      <div className="grid gap-1.5 pt-2">
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
          onClick={() => onServicesModeChange?.(true)}
        >
          <Search className="w-3.5 h-3.5" />
          {t('novaposhta_additional_services')}
        </Button>

        {/* Sync error banner */}
        {syncError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive mt-2">
            <div className="flex items-start gap-1.5">
              <span className="leading-4">{syncError}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

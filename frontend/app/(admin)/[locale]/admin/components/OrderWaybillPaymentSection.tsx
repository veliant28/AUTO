'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Plus, Search, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  /** Sender type from profile: "private_person" | "fop" | "business" */
  senderType?: string
  /** Recipient counterparty type from NP: "PrivatePerson" | "Organization" */
  recipientCounterpartyType?: string
  /** ThirdPerson counterparty ref from counterparty search */
  thirdPersonRef?: string
  onChange: (field: string, value: any) => void
  /** Pre-loaded service refs from the saved waybill */
  initialServiceRefs?: string[]
  /** Pre-loaded service params from the saved waybill */
  initialServiceParams?: Record<string, any>
  /** Called when a parameterized service is added — triggers editor in column 2 */
  onServiceEdit?: (ref: string, name: string) => void
  /** Currently editing service ref — disables this section */
  editingServiceRef?: string | null
  /** When set, remove this ref from the local selection (editor was cancelled) */
  lastCanceledRef?: string | null
}

/** Map of service ref → parameter field name for simple services */
const SERVICE_FIELD_MAP: Record<string, string> = {
  PackingNumber: 'packing_number',
  InfoRegClientBarcodes: 'info_reg_client_barcodes',
  AccompanyingDocuments: 'accompanying_documents',
  AdditionalInformation: 'additional_information',
  NumberOfFloorsLifting: 'number_of_floors_lifting',
  NumberOfFloorsDescent: 'number_of_floors_descent',
  ForwardingCount: 'forwarding_count',
  RedBoxBarcode: 'red_box_barcode',
  LocalExpress: 'local_express',
  PreferredDeliveryDate: 'preferred_delivery_date',
  DeliveryByHand: 'delivery_by_hand',
}

/** Services that require additional parameter editing before they can be saved. */
const PARAM_REQUIRED_SERVICES = new Set([
  'AfterpaymentOnGoodsCost',
  ...Object.keys(SERVICE_FIELD_MAP),
])

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
  senderType = '',
  recipientCounterpartyType = '',
  thirdPersonRef = '',
  onChange,
  initialServiceRefs = [],
  initialServiceParams = {},
  onServiceEdit,
  editingServiceRef = null,
  lastCanceledRef = null,
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
  const dropdownListRef = useRef<HTMLDivElement>(null)
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

  // Don't auto-focus the search input — let the user click on it
  // to open the dropdown only when they want to.

  // Scroll highlighted item into view in the dropdown
  useEffect(() => {
    if (highlightedIdx < 0 || !dropdownListRef.current) return
    const item = dropdownListRef.current.querySelector(
      `[data-index="${highlightedIdx}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIdx])

  // Keep a ref to know which services were already committed (pre-existing)
  const initialRefsRef = useRef<string[]>([])
  useEffect(() => {
    initialRefsRef.current = initialServiceRefs || []
  }, [initialServiceRefs])

  // Restore selected services from initialServiceRefs when entering services mode
  // or when the committed refs change (e.g. after handleAdd commits new refs).
  useEffect(() => {
    if (isServicesMode && allServices.length > 0) {
      const restored = allServices.filter((s) =>
        initialServiceRefs.includes(s.ref),
      )
      setSelectedServices(restored)
      setCheckedServiceRefs(new Set())
    }
  }, [isServicesMode, allServices, initialServiceRefs])

  // When the editor is cancelled, remove only the canceled service from selection.
  // Preserves all other services (both pre-existing and newly-added-but-saved).
  useEffect(() => {
    if (lastCanceledRef) {
      // Only remove if the service was NEWLY added (not in committed refs).
      // If it was pre-existing, the user was editing it and cancelled — keep it.
      if (!initialRefsRef.current.includes(lastCanceledRef)) {
        setSelectedServices((prev) => {
          const filtered = prev.filter((s) => s.ref !== lastCanceledRef)
          if (filtered.length === prev.length) return prev // already removed
          return filtered
        })
      }
    }
  }, [lastCanceledRef])

  // ── Service selection helpers ────────────────────────────────────────────

  const addService = useCallback(
    (service: NovaPoshtaServiceItem) => {
      setSelectedServices((prev) => {
        if (prev.some((s) => s.ref === service.ref)) return prev
        return [...prev, service]
      })
      setServicesQuery('')
      setHighlightedIdx(-1)
      setIsDropdownOpen(false)

      // If this service requires parameter editing, trigger the editor
      if (PARAM_REQUIRED_SERVICES.has(service.ref)) {
        onServiceEdit?.(service.ref, service.description)
      }
    },
    [onServiceEdit],
  )

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

  // ── Payer / Payment validation rules ─────────────────────────────────────
  // Sender:    private person → Cash only;   FOP/Organization → Cash + NonCash
  // Recipient: PrivatePerson  → Cash only;   Organization     → Cash + NonCash
  // ThirdPerson: always NonCash only, requires thirdPersonRef
  const isPayerAllowed = useCallback(
    (payer: PayerType, method: PaymentMethod): boolean => {
      if (payer === 'ThirdPerson')
        return method === 'NonCash' && !!thirdPersonRef
      if (method === 'Cash') return true // Sender & Recipient always allow Cash
      // method === 'NonCash'
      if (payer === 'Sender') {
        // Sender can pay non-cash only if FOP or Organization
        return senderType === 'fop' || senderType === 'business'
      }
      if (payer === 'Recipient') {
        // Recipient can pay non-cash only if Organization (FOP counts as Organization in NP)
        return recipientCounterpartyType === 'Organization'
      }
      return true
    },
    [senderType, recipientCounterpartyType, thirdPersonRef],
  )

  const isPaymentAllowed = useCallback(
    (method: PaymentMethod, payer: PayerType): boolean => {
      if (payer === 'ThirdPerson')
        return method === 'NonCash' && !!thirdPersonRef
      if (method === 'Cash') return true // Sender & Recipient always allow Cash
      // method === 'NonCash'
      if (payer === 'Sender') {
        return senderType === 'fop' || senderType === 'business'
      }
      if (payer === 'Recipient') {
        return recipientCounterpartyType === 'Organization'
      }
      return true
    },
    [senderType, recipientCounterpartyType, thirdPersonRef],
  )

  const handlePayerType = (value: PayerType) => {
    onChange('payer_type', value)
    // Auto-switch payment method if current one is incompatible
    if (!isPaymentAllowed(paymentMethod, value)) {
      // ThirdPerson → NonCash; Recipient or Sender on NonCash → switch to Cash
      const newMethod: PaymentMethod =
        value === 'ThirdPerson' ? 'NonCash' : 'Cash'
      onChange('payment_method', newMethod)
    }
  }

  const handlePaymentMethod = (value: PaymentMethod) => {
    onChange('payment_method', value)
    // Auto-switch payer type if current one is incompatible
    if (!isPayerAllowed(payerType, value)) {
      // NonCash selected but current payer can't use it
      // Try ThirdPerson first (if ref available), fall back to Sender
      if (
        value === 'NonCash' &&
        thirdPersonRef &&
        isPayerAllowed('ThirdPerson', value)
      ) {
        onChange('payer_type', 'ThirdPerson')
      } else {
        // Try Sender or Recipient as fallback
        const fallback: PayerType =
          payerType === 'ThirdPerson' ? 'Sender' : 'Sender'
        onChange('payer_type', fallback)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Services mode
  // ═══════════════════════════════════════════════════════════════════════════

  if (isServicesMode) {
    const allChecked =
      selectedServices.length > 0 &&
      checkedServiceRefs.size === selectedServices.length

    return (
      <section className="order-4 rounded-md border p-3 h-full flex flex-col bg-card overflow-hidden">
        {/* Header */}
        <div className="flex min-h-8 items-center gap-2 shrink-0">
          <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
            <CreditCard className="w-5 h-5" />
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
                className="pl-8"
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
              <div
                ref={dropdownListRef}
                className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-lg max-h-[240px] overflow-y-auto py-1"
              >
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
                      'gap-2 px-3 cursor-pointer',
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

                {/* Rows — grid with columns: checkbox | name | col1 | col2 */}
                <div className="border rounded-md divide-y">
                  {selectedServices.map((item) => {
                    const svcParams = initialServiceParams[item.ref] || {}
                    let col1Label = '—'
                    let col2Label = '—'
                    if (item.ref === 'AfterpaymentOnGoodsCost') {
                      if (svcParams.afterpayment_amount) {
                        col1Label =
                          svcParams.afterpayment_payer === 'Sender'
                            ? t('novaposhta_payer_sender')
                            : t('novaposhta_payer_recipient')
                        const num = Number(svcParams.afterpayment_amount)
                        col2Label = `${num.toLocaleString('uk-UA')} ₴`
                      }
                    } else if (item.ref === 'LocalExpress') {
                      if (svcParams.time_interval) {
                        const d = new Date()
                        col1Label = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
                        col2Label =
                          svcParams.time_interval_label ||
                          svcParams.time_interval
                      }
                    } else if (item.ref === 'PreferredDeliveryDate') {
                      if (svcParams.preferred_delivery_date) {
                        // Convert YYYY-MM-DD → DD.MM.YYYY
                        const parts =
                          svcParams.preferred_delivery_date.split('-')
                        if (parts.length === 3) {
                          col1Label = `${parts[2]}.${parts[1]}.${parts[0]}`
                        } else {
                          col1Label = svcParams.preferred_delivery_date
                        }
                      }
                      if (svcParams.time_interval) {
                        col2Label =
                          svcParams.time_interval_label ||
                          svcParams.time_interval
                      }
                    } else if (item.ref === 'DeliveryByHand') {
                      const isOn =
                        svcParams.delivery_by_hand === true ||
                        svcParams.delivery_by_hand === 'true'
                      col2Label = isOn
                        ? t('novaposhta_enabled')
                        : t('novaposhta_disabled')
                      if (isOn && svcParams.delivery_by_hand_recipients) {
                        col2Label += ` (${svcParams.delivery_by_hand_recipients})`
                      }
                    } else {
                      const fieldName = SERVICE_FIELD_MAP[item.ref]
                      const fieldValue = fieldName
                        ? svcParams[fieldName]
                        : undefined
                      if (fieldValue) {
                        col2Label = fieldValue
                      }
                    }

                    return (
                      <div
                        key={item.ref}
                        className="flex items-center gap-2 px-3"
                        onDoubleClick={() => {
                          if (PARAM_REQUIRED_SERVICES.has(item.ref)) {
                            onServiceEdit?.(item.ref, item.description)
                          }
                        }}
                      >
                        <Checkbox
                          checked={checkedServiceRefs.has(item.ref)}
                          onCheckedChange={() => toggleServiceCheck(item.ref)}
                          className="cursor-pointer shrink-0"
                        />
                        <span className="flex-1 text-sm min-w-0 truncate">
                          {item.description}
                        </span>
                        <span className="w-24 shrink-0 text-center text-sm text-muted-foreground truncate">
                          {col1Label}
                        </span>
                        <span className="w-24 shrink-0 text-right text-sm font-medium truncate">
                          {col2Label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Bottom buttons */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={handleCancel}
            >
              {t('novaposhta_services_cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
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
    <section className="order-4 rounded-md border p-3 h-full flex flex-col bg-card overflow-hidden">
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <CreditCard className="w-5 h-5" />
          {t('novaposhta_payment')}
        </h3>
      </div>

      <div className="grid gap-1.5 pt-2 flex-1 overflow-y-auto overflow-x-hidden content-start">
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
          <Label className="text-sm text-muted-foreground">
            {t('novaposhta_payer_type')}
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(payerTypeLabels) as PayerType[]).map((value) => {
              const btnDisabled =
                disabled || !isPayerAllowed(value, paymentMethod)
              const btn = (
                <Button
                  key={value}
                  type="button"
                  variant={payerType === value ? 'default' : 'outline'}
                  disabled={btnDisabled}
                  onClick={() => handlePayerType(value)}
                >
                  {payerTypeLabels[value]}
                </Button>
              )
              if (btnDisabled && !disabled) {
                let tooltipKey: string
                if (value === 'Sender') {
                  tooltipKey = 'novaposhta_payer_sender_disabled_tooltip'
                } else if (value === 'Recipient') {
                  tooltipKey = 'novaposhta_payer_recipient_disabled_tooltip'
                } else {
                  tooltipKey = 'novaposhta_payer_third_person_disabled_tooltip'
                }
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent>{t(tooltipKey)}</TooltipContent>
                  </Tooltip>
                )
              }
              return btn
            })}
          </div>
        </div>

        {/* Payment method */}
        <div className="grid gap-0.5">
          <Label className="text-sm text-muted-foreground">
            {t('novaposhta_payment_method_label')}
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map(
              (value) => {
                const btnDisabled =
                  disabled || !isPaymentAllowed(value, payerType)
                const btn = (
                  <Button
                    key={value}
                    type="button"
                    variant={paymentMethod === value ? 'default' : 'outline'}
                    disabled={btnDisabled}
                    onClick={() => handlePaymentMethod(value)}
                  >
                    {paymentMethodLabels[value]}
                  </Button>
                )
                // Show tooltip only when disabled by business rule
                if (btnDisabled && !disabled) {
                  // NonCash can be disabled because Sender or Recipient is a private person
                  const tooltipKey =
                    value === 'NonCash'
                      ? payerType === 'Sender'
                        ? 'novaposhta_payer_sender_disabled_tooltip'
                        : 'novaposhta_payer_recipient_disabled_tooltip'
                      : 'novaposhta_payment_cash_disabled_tooltip'
                  return (
                    <Tooltip key={value}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent>{t(tooltipKey)}</TooltipContent>
                    </Tooltip>
                  )
                }
                return btn
              },
            )}
          </div>
        </div>

        {/* Additional services button */}
        <Button
          type="button"
          variant="outline"
          className="mt-2 gap-1.5"
          disabled={disabled}
          onClick={() => onServicesModeChange?.(true)}
        >
          <Plus className="w-3.5 h-3.5" />
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

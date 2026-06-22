'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  CreditCard,
  DollarSign,
  FileText,
  Hash,
  Barcode,
  Package,
  Info,
  ArrowUp,
  ArrowDown,
  CornerDownRight,
  Box,
  Clock,
  UserCheck,
  CalendarIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format, startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type {
  NovaPoshtaLookupTimeInterval,
  NovaPoshtaLookupDeliveryDate,
} from '@/lib/types/nova-poshta'

interface Props {
  serviceRef: string
  serviceName: string
  params: Record<string, any>
  onSave: (params: Record<string, any>) => void
  onCancel: () => void
  senderProfileId?: number
  recipientCityRef?: string
  deliveryType?: string
}

export default function OrderWaybillServiceEditorSection({
  serviceRef,
  serviceName,
  params,
  onSave,
  onCancel,
  senderProfileId,
  recipientCityRef,
  deliveryType,
}: Props) {
  const t = useTranslations('admin')

  // ── Editor state (unconditional hooks) ─────────────────────────────────
  const [amount, setAmount] = useState(params.afterpayment_amount || '0')
  const [payer, setPayer] = useState<'Sender' | 'Recipient'>(
    params.afterpayment_payer || 'Recipient',
  )

  const canSave =
    serviceRef === 'AfterpaymentOnGoodsCost'
      ? parseFloat(amount) > 0 && !!payer
      : true

  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleAmountFocus = () => {
    inputRef.current?.select()
  }

  const handleAmountBlur = () => {
    if (amount === '') {
      setAmount('0')
    }
  }

  const handleSave = () => {
    if (serviceRef === 'AfterpaymentOnGoodsCost') {
      onSave({
        afterpayment_amount: String(Math.round(parseFloat(amount || '0'))),
        afterpayment_payer: payer || 'Recipient',
      })
    }
  }

  // ── Config for simple single-field services ──────────────────────────────
  const SIMPLE_SERVICE_CONFIG: Record<
    string,
    {
      field: string
      type: 'text' | 'number'
      labelKey: string
      icon: React.ReactNode
    }
  > = {
    PackingNumber: {
      field: 'packing_number',
      type: 'text',
      labelKey: 'novaposhta_service_packing_number',
      icon: <Package className="w-5 h-5" />,
    },
    InfoRegClientBarcodes: {
      field: 'info_reg_client_barcodes',
      type: 'text',
      labelKey: 'novaposhta_service_info_reg_client_barcodes',
      icon: <Barcode className="w-5 h-5" />,
    },
    AccompanyingDocuments: {
      field: 'accompanying_documents',
      type: 'text',
      labelKey: 'novaposhta_service_accompanying_documents',
      icon: <FileText className="w-5 h-5" />,
    },
    AdditionalInformation: {
      field: 'additional_information',
      type: 'text',
      labelKey: 'novaposhta_service_additional_information',
      icon: <Info className="w-5 h-5" />,
    },
    NumberOfFloorsLifting: {
      field: 'number_of_floors_lifting',
      type: 'number',
      labelKey: 'novaposhta_service_number_of_floors_lifting',
      icon: <ArrowUp className="w-5 h-5" />,
    },
    NumberOfFloorsDescent: {
      field: 'number_of_floors_descent',
      type: 'number',
      labelKey: 'novaposhta_service_number_of_floors_descent',
      icon: <ArrowDown className="w-5 h-5" />,
    },
    ForwardingCount: {
      field: 'forwarding_count',
      type: 'number',
      labelKey: 'novaposhta_service_forwarding_count',
      icon: <CornerDownRight className="w-5 h-5" />,
    },
    RedBoxBarcode: {
      field: 'red_box_barcode',
      type: 'text',
      labelKey: 'novaposhta_service_red_box_barcode',
      icon: <Box className="w-5 h-5" />,
    },
  }

  // ── Detect editor type ──────────────────────────────────────────────────
  const simpleConfig = SIMPLE_SERVICE_CONFIG[serviceRef]

  // ── State for simple services (unconditional) ───────────────────────────
  const [simpleValue, setSimpleValue] = useState(
    simpleConfig ? params[simpleConfig.field] || '' : '',
  )

  // ── Route to the correct editor ──────────────────────────────────────────
  // NOTE: AfterpaymentOnGoodsCost and simpleConfig use hooks declared above,
  // so we render them inline. All other editors are extracted into separate
  // sub-components to avoid conditional hooks (Rules of Hooks).

  if (serviceRef === 'AfterpaymentOnGoodsCost') {
    return (
      <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
        {/* Header */}
        <div className="flex min-h-8 items-center gap-2 shrink-0">
          <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
            <CreditCard className="w-5 h-5" />
            {serviceName}
          </h3>
        </div>

        <div className="flex flex-col gap-4 flex-1 min-h-0 pt-2 px-1.5">
          {/* Amount field */}
          <div className="grid gap-1.5">
            <Label className="text-sm text-muted-foreground">
              {t('novaposhta_service_amount')}
            </Label>
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9]/g, ''))
                }
                onFocus={handleAmountFocus}
                onBlur={handleAmountBlur}
                placeholder={t('novaposhta_money_transfer')}
                className="pr-8"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-sm text-muted-foreground">
                ₴
              </div>
            </div>
          </div>

          {/* Payer radio tiles */}
          <div className="grid gap-1.5">
            <Label className="text-sm text-muted-foreground">
              {t('novaposhta_afterpayment_payer')}
            </Label>
            <RadioGroup
              value={payer}
              onValueChange={(v: 'Sender' | 'Recipient') => setPayer(v)}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-3 cursor-pointer transition-colors hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="Sender" className="cursor-pointer" />
                <span className="text-sm cursor-pointer leading-tight font-medium">
                  {t('novaposhta_payer_sender')}
                </span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-3 cursor-pointer transition-colors hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="Recipient" className="cursor-pointer" />
                <span className="text-sm cursor-pointer leading-tight font-medium">
                  {t('novaposhta_payer_recipient')}
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('novaposhta_services_cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={!canSave}
              onClick={handleSave}
            >
              {t('novaposhta_services_add')}
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (serviceRef === 'LocalExpress') {
    return (
      <LocalExpressEditor
        senderProfileId={senderProfileId}
        recipientCityRef={recipientCityRef}
        params={params}
        serviceName={serviceName}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
  }

  if (serviceRef === 'PreferredDeliveryDate') {
    return (
      <PreferredDeliveryDateEditor
        senderProfileId={senderProfileId}
        recipientCityRef={recipientCityRef}
        params={params}
        serviceName={serviceName}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
  }

  if (serviceRef === 'DeliveryByHand') {
    return (
      <DeliveryByHandEditor
        params={params}
        serviceName={serviceName}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
  }

  // ── Generic editor for simple single-field services ─────────────────────
  if (simpleConfig) {
    return (
      <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
        {/* Header */}
        <div className="flex min-h-8 items-center gap-2 shrink-0">
          <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
            {simpleConfig.icon}
            {serviceName}
          </h3>
        </div>

        <div className="flex flex-col gap-4 flex-1 min-h-0 pt-2 px-1.5">
          {/* Single value field */}
          <div className="grid gap-1.5">
            <Label className="text-sm text-muted-foreground">
              {t(simpleConfig.labelKey)}
            </Label>
            <Input
              type={simpleConfig.type}
              min={simpleConfig.type === 'number' ? '0' : undefined}
              value={simpleValue}
              onChange={(e) => setSimpleValue(e.target.value)}
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('novaposhta_services_cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() =>
                onSave({
                  [simpleConfig.field]: simpleValue,
                })
              }
            >
              {t('novaposhta_services_add')}
            </Button>
          </div>
        </div>
      </section>
    )
  }

  // Fallback for services without a specific editor
  return (
    <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <CreditCard className="w-5 h-5" />
          {serviceName}
        </h3>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-h-0 pt-2 items-center justify-center text-muted-foreground text-sm">
        {t('novaposhta_service_no_params')}
      </div>
      <div className="flex justify-end gap-2 pt-1 shrink-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('novaposhta_services_cancel')}
        </Button>
        <Button type="button" variant="default" onClick={() => onSave({})}>
          {t('novaposhta_services_add')}
        </Button>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Extracted sub-components (each has its own hooks, no conditional hook issue)
// ═══════════════════════════════════════════════════════════════════════════

interface EditorProps {
  senderProfileId?: number
  recipientCityRef?: string
  params: Record<string, any>
  serviceName: string
  onSave: (params: Record<string, any>) => void
  onCancel: () => void
}

// ── LocalExpress editor — TimeInterval selection ───────────────────────────

function LocalExpressEditor({
  senderProfileId,
  recipientCityRef,
  params,
  serviceName,
  onSave,
  onCancel,
}: EditorProps) {
  const t = useTranslations('admin')

  const { data: timeIntervals = [], isLoading: loadingIntervals } = useQuery({
    queryKey: ['np-time-intervals', senderProfileId, recipientCityRef],
    queryFn: () =>
      novaPoshtaApi
        .getTimeIntervals({
          sender_profile_id: senderProfileId || undefined,
          recipient_city_ref: recipientCityRef || '',
          date_time: '',
        })
        .then((r) => r.data),
    enabled: !!senderProfileId && !!recipientCityRef,
  })

  // Filter out past time intervals (LocalExpress always uses today)
  const availableIntervals = useMemo(() => {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    return timeIntervals.filter((ti) => {
      if (!ti.end) return true
      const [h, m] = ti.end.split(':').map(Number)
      const endMinutes = h * 60 + m
      return endMinutes > currentMinutes
    })
  }, [timeIntervals])

  const [selectedInterval, setSelectedInterval] = useState(
    params.time_interval || '',
  )

  // Clear selected interval if no longer available
  useEffect(() => {
    if (
      selectedInterval &&
      !availableIntervals.some((ti) => ti.number === selectedInterval)
    ) {
      setSelectedInterval('')
    }
  }, [availableIntervals, selectedInterval])

  return (
    <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <Clock className="w-5 h-5" />
          {serviceName}
        </h3>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0 pt-2 px-1.5">
        {!senderProfileId || !recipientCityRef ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            {t('novaposhta_service_select_city_first')}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label className="text-sm text-muted-foreground">
              {t('novaposhta_service_time_interval')}
            </Label>
            <Select
              value={selectedInterval}
              onValueChange={setSelectedInterval}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t('novaposhta_service_select_interval')}
                />
              </SelectTrigger>
              <SelectContent>
                {loadingIntervals ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('novaposhta_service_loading')}
                  </div>
                ) : availableIntervals.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('novaposhta_no_results')}
                  </div>
                ) : (
                  availableIntervals.map((ti) => (
                    <SelectItem key={ti.number} value={ti.number}>
                      {ti.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex justify-end gap-2 pt-1 shrink-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('novaposhta_services_cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!selectedInterval}
            onClick={() => {
              const label =
                availableIntervals.find((ti) => ti.number === selectedInterval)
                  ?.label || selectedInterval
              onSave({
                time_interval: selectedInterval,
                time_interval_label: label,
                local_express: true,
              })
            }}
          >
            {t('novaposhta_services_add')}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ── PreferredDeliveryDate editor — Date + TimeInterval ────────────────────

function PreferredDeliveryDateEditor({
  senderProfileId,
  recipientCityRef,
  params,
  serviceName,
  onSave,
  onCancel,
}: EditorProps) {
  const t = useTranslations('admin')

  const [selectedDate, setSelectedDate] = useState(
    params.preferred_delivery_date || '',
  )
  const [selectedInterval, setSelectedInterval] = useState(
    params.time_interval || '',
  )
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const { data: timeIntervals = [], isLoading: loadingIntervals } = useQuery({
    queryKey: [
      'np-time-intervals',
      senderProfileId,
      recipientCityRef,
      selectedDate,
    ],
    queryFn: () =>
      novaPoshtaApi
        .getTimeIntervals({
          sender_profile_id: senderProfileId || undefined,
          recipient_city_ref: recipientCityRef || '',
          date_time: selectedDate || '',
        })
        .then((r) => r.data),
    enabled: !!senderProfileId && !!recipientCityRef && !!selectedDate,
  })

  // Filter out past time intervals for today
  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd')
  const availableIntervals = useMemo(() => {
    if (!isToday) return timeIntervals
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    return timeIntervals.filter((ti) => {
      if (!ti.end) return true
      const [h, m] = ti.end.split(':').map(Number)
      const endMinutes = h * 60 + m
      return endMinutes > currentMinutes
    })
  }, [timeIntervals, isToday])

  // Clear selected interval if it's no longer available
  useEffect(() => {
    if (
      selectedInterval &&
      !availableIntervals.some((ti) => ti.number === selectedInterval)
    ) {
      setSelectedInterval('')
    }
  }, [availableIntervals, selectedInterval])

  const canSave =
    !!selectedDate && (availableIntervals.length === 0 || !!selectedInterval)

  const selectedDateObj = selectedDate
    ? new Date(selectedDate + 'T00:00:00')
    : undefined

  return (
    <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <CalendarIcon className="w-5 h-5" />
          {serviceName}
        </h3>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0 pt-2 px-1.5">
        {!senderProfileId || !recipientCityRef ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            {t('novaposhta_service_select_city_first')}
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_service_delivery_date')}
              </Label>
              <Popover
                open={datePickerOpen}
                onOpenChange={setDatePickerOpen}
                modal={false}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {selectedDate
                      ? format(selectedDateObj!, 'dd.MM.yyyy')
                      : t('novaposhta_service_select_date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div style={{ pointerEvents: 'auto' }}>
                    <Calendar
                      mode="single"
                      className="rounded-md"
                      navLayout="around"
                      selected={selectedDateObj}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(format(date, 'yyyy-MM-dd'))
                          setSelectedInterval('')
                          setDatePickerOpen(false)
                        }
                      }}
                      disabled={{ before: startOfDay(new Date()) }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {selectedDate && (
              <div className="grid gap-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('novaposhta_service_time_interval')}
                </Label>
                {loadingIntervals ? (
                  <div className="text-xs text-muted-foreground py-2">
                    {t('novaposhta_service_loading')}
                  </div>
                ) : availableIntervals.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    {t('novaposhta_service_no_intervals')}
                  </div>
                ) : (
                  <Select
                    value={selectedInterval}
                    onValueChange={setSelectedInterval}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('novaposhta_service_select_interval')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableIntervals.map((ti) => (
                        <SelectItem key={ti.number} value={ti.number}>
                          {ti.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex-1" />

        <div className="flex justify-end gap-2 pt-1 shrink-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('novaposhta_services_cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!canSave}
            onClick={() => {
              const label =
                availableIntervals.find((ti) => ti.number === selectedInterval)
                  ?.label || selectedInterval
              onSave({
                preferred_delivery_date: selectedDate,
                time_interval: selectedInterval,
                time_interval_label: label,
              })
            }}
          >
            {t('novaposhta_services_add')}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ── DeliveryByHand editor — Toggle + recipients ──────────────────────────

interface DeliveryByHandEditorProps {
  params: Record<string, any>
  serviceName: string
  onSave: (params: Record<string, any>) => void
  onCancel: () => void
}

function DeliveryByHandEditor({
  params,
  serviceName,
  onSave,
  onCancel,
}: DeliveryByHandEditorProps) {
  const t = useTranslations('admin')

  const [enabled, setEnabled] = useState(params.delivery_by_hand ?? true)
  const [recipients, setRecipients] = useState(
    params.delivery_by_hand_recipients || '',
  )

  return (
    <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <UserCheck className="w-5 h-5" />
          {serviceName}
        </h3>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0 pt-2 px-1.5">
        <div className="flex items-center gap-3">
          <Checkbox
            id="dbh-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(!!v)}
            className="cursor-pointer"
          />
          <Label htmlFor="dbh-enabled" className="text-sm cursor-pointer">
            {t('novaposhta_service_delivery_by_hand_enable')}
          </Label>
        </div>

        {enabled && (
          <div className="grid gap-1.5">
            <Label className="text-sm text-muted-foreground">
              {t('novaposhta_service_delivery_by_hand_recipients')}
            </Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder={t('novaposhta_service_delivery_by_hand_placeholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('novaposhta_service_delivery_by_hand_hint')}
            </p>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex justify-end gap-2 pt-1 shrink-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('novaposhta_services_cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() =>
              onSave({
                delivery_by_hand: enabled,
                delivery_by_hand_recipients: enabled ? recipients : '',
              })
            }
          >
            {t('novaposhta_services_add')}
          </Button>
        </div>
      </div>
    </section>
  )
}

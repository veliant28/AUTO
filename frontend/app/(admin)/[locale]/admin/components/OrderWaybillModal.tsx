'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Truck, BadgeCheck, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type {
  OrderNovaPoshtaWaybillUpsert,
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
} from '@/lib/types/nova-poshta'

// ── Section components ──────────────────────────────────────────────────────
import OrderWaybillSenderSection from './OrderWaybillSenderSection'
import OrderWaybillShipmentSection from './OrderWaybillShipmentSection'
import OrderWaybillRecipientSection from './OrderWaybillRecipientSection'
import OrderWaybillPaymentSection from './OrderWaybillPaymentSection'
import OrderWaybillFooter from './OrderWaybillFooter'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  orderId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function OrderWaybillModal({
  orderId,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const formInitialized = React.useRef(false)

  // ── Fetch waybill if exists ──────────────────────────────────────────────
  const { data: detail, isLoading: loadingWaybill } = useQuery({
    queryKey: ['np-waybill', orderId],
    queryFn: () =>
      novaPoshtaApi.getOrderWaybillDetail(orderId).then((r) => r.data),
    enabled: open,
  })

  const waybill = detail?.waybill
  const summary = detail?.summary
  const isEdit = !!waybill && !waybill.is_deleted

  // ── Senders ──────────────────────────────────────────────────────────────
  const { data: senders = [] } = useQuery({
    queryKey: ['nova-poshta', 'senders'],
    queryFn: () => novaPoshtaApi.listSenders().then((r) => r.data),
    enabled: open,
  })

  // ── Form state ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<OrderNovaPoshtaWaybillUpsert>({
    sender_profile_id: 0,
    delivery_type: 'warehouse',
    payer_type: 'Recipient',
    payment_method: 'Cash',
    cargo_type: 'Parcel',
    description: '',
    recipient_city_ref: '',
    recipient_city_label: '',
    recipient_address_ref: '',
    recipient_address_label: '',
    recipient_name: '',
    recipient_phone: '',
    weight: '0.1',
    seats_amount: 1,
    cost: '0',
  })
  const [isPackagingMode, setIsPackagingMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activePlaceIndex, setActivePlaceIndex] = useState(0)
  const [isPlacesListMode, setIsPlacesListMode] = useState(false)

  // ── Derived sender data ─────────────────────────────────────────────────
  const selectedSender = senders.find((s) => s.id === form.sender_profile_id)
  const senderCounterpartyDisplay = selectedSender
    ? selectedSender.organization_name ||
      selectedSender.contact_name ||
      selectedSender.name
    : ''
  const senderCityDisplay = selectedSender?.city_ref || ''
  const senderAddressDisplay = selectedSender?.address_ref || ''
  const senderPhone = selectedSender?.phone || ''
  const senderContactName = selectedSender?.contact_name || ''

  // ── Active seat values (for multi-place mode) ──────────────────────────
  const activeSeat = useMemo(() => {
    if (
      form.seats_amount &&
      form.seats_amount > 1 &&
      form.options_seat?.[activePlaceIndex]
    ) {
      return form.options_seat[activePlaceIndex]
    }
    return null
  }, [form.seats_amount, form.options_seat, activePlaceIndex])

  // Reset form when waybill loads
  useEffect(() => {
    if (open) {
      formInitialized.current = false
    }
  }, [open])

  useEffect(() => {
    if (waybill && !waybill.is_deleted) {
      setForm({
        sender_profile_id: waybill.sender_profile_id,
        delivery_type: 'warehouse',
        payer_type: (waybill.payer_type as any) || 'Recipient',
        payment_method: (waybill.payment_method as any) || 'Cash',
        cargo_type: (waybill.cargo_type as any) || 'Parcel',
        description: waybill.description_snapshot || '',
        recipient_city_ref: waybill.recipient_city_ref,
        recipient_city_label: waybill.recipient_city_label,
        recipient_address_ref: waybill.recipient_address_ref,
        recipient_address_label: waybill.recipient_address_label,
        recipient_name: waybill.recipient_name,
        recipient_phone: waybill.recipient_phone,
        weight: waybill.weight || '1.000',
        seats_amount: waybill.seats_amount || 1,
        cost: waybill.cost || '0',
        afterpayment_amount: waybill.afterpayment_amount || undefined,
        options_seat:
          (waybill.options_seat?.map((s) => ({
            description: s.description,
            weight: s.weight,
            cost: s.cost,
            volumetric_width: s.volumetric_width,
            volumetric_length: s.volumetric_length,
            volumetric_height: s.volumetric_height,
            pack_refs: s.pack_refs,
            cargo_type: s.cargo_type,
          })) as any) || undefined,
      })
      formInitialized.current = true
    } else if (!waybill && !formInitialized.current && senders.length > 0) {
      // Set default sender only on first load
      const defaultSender = senders.find((s) => s.is_default) || senders[0]
      setForm((prev) => ({
        ...prev,
        sender_profile_id: defaultSender?.id || 0,
      }))
      formInitialized.current = true
    }
    return () => {}
  }, [waybill, senders])

  // ── Lookups ──────────────────────────────────────────────────────────────
  const [cityQuery, setCityQuery] = useState('')
  const [warehouseQuery, setWarehouseQuery] = useState('')

  const { data: settlements = [], isLoading: settlementsLoading } = useQuery({
    queryKey: ['np-lookup', 'settlements', form.sender_profile_id, cityQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchSettlements({
          sender_profile_id: form.sender_profile_id,
          query: cityQuery,
        })
        .then((r) => r.data),
    enabled: cityQuery.length >= 2 && form.sender_profile_id > 0,
    staleTime: 60000,
  })

  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
    queryKey: [
      'np-lookup',
      'warehouses',
      form.sender_profile_id,
      form.recipient_city_ref,
      warehouseQuery,
    ],
    queryFn: () =>
      novaPoshtaApi
        .searchWarehouses({
          sender_profile_id: form.sender_profile_id,
          city_ref: form.recipient_city_ref,
          query: warehouseQuery,
        })
        .then((r) => r.data),
    enabled: !!form.recipient_city_ref && form.sender_profile_id > 0,
    staleTime: 60000,
  })

  // ── Selected lookup items (for SearchableSelect value) ──────────────────
  const selectedSettlement =
    settlements.find((s) => s.delivery_city_ref === form.recipient_city_ref) ||
    null

  const selectedWarehouse =
    warehouses.find((w) => w.ref === form.recipient_address_ref) || null

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: OrderNovaPoshtaWaybillUpsert) =>
      novaPoshtaApi.createWaybill(orderId, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] })
      toast.success(t('novaposhta_waybill_updated'))
      onOpenChange(false)
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: OrderNovaPoshtaWaybillUpsert
    }) => novaPoshtaApi.updateWaybill(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] })
      toast.success(t('novaposhta_waybill_updated'))
      onOpenChange(false)
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => novaPoshtaApi.deleteWaybill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] })
      toast.success(t('novaposhta_waybill_deleted'))
      onOpenChange(false)
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const syncMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.syncWaybillStatus(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] })
      toast.success(t('novaposhta_waybill_sync'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const printHtmlMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.printWaybill(id, 'html').then((r) => r.data),
    onSuccess: (res) => {
      if (res.url) window.open(res.url, '_blank')
      else toast.error(t('novaposhta_print_no_url'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const printPdfMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.printWaybill(id, 'pdf').then((r) => r.data),
    onSuccess: (res) => {
      if (res.url) window.open(res.url, '_blank')
      else toast.error(t('novaposhta_print_no_url'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  // ── Form change handler ─────────────────────────────────────────────────
  const handleFormChange = useCallback((field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  // ── Place-aware change handler ──────────────────────────────────────────
  const handlePlaceFormChange = useCallback(
    (field: string, value: any) => {
      setForm((prev) => {
        if (prev.seats_amount && prev.seats_amount > 1) {
          const newOptions = [...(prev.options_seat || [])]
          if (!newOptions[activePlaceIndex]) {
            newOptions[activePlaceIndex] = {} as any
          }
          newOptions[activePlaceIndex] = {
            ...newOptions[activePlaceIndex],
            [field]: value,
          }
          return { ...prev, options_seat: newOptions }
        }
        return { ...prev, [field]: value }
      })
    },
    [activePlaceIndex],
  )

  // ── City/Warehouse selection handlers ───────────────────────────────────
  const handleCitySelect = useCallback((item: NovaPoshtaLookupSettlement) => {
    setForm((prev) => ({
      ...prev,
      recipient_city_ref: item.delivery_city_ref,
      recipient_city_label: item.label,
    }))
    setCityQuery(item.label)
  }, [])

  const handleWarehouseSelect = useCallback(
    (item: NovaPoshtaLookupWarehouse) => {
      setForm((prev) => ({
        ...prev,
        recipient_address_ref: item.ref,
        recipient_address_label: item.label,
      }))
      setWarehouseQuery(item.label)
    },
    [],
  )

  const handleSenderChange = useCallback((id: number) => {
    setForm((prev) => ({ ...prev, sender_profile_id: id }))
  }, [])

  const handleDeliveryTypeChange = useCallback(
    (type: 'warehouse' | 'postomat' | 'address') => {
      setForm((prev) => ({ ...prev, delivery_type: type }))
    },
    [],
  )

  // ── Place management handlers ───────────────────────────────────────────
  const handleAddPlace = useCallback(() => {
    setForm((prev) => {
      const currentSeats = prev.seats_amount || 1
      const newSeats = currentSeats + 1
      const newOptions = [...(prev.options_seat || [])]
      // If going from single-place (no options_seat) to multi-place,
      // migrate the top-level data into options_seat[0]
      if (!prev.options_seat && currentSeats === 1) {
        newOptions[0] = {
          description: prev.description || '',
          weight: prev.weight || '0.1',
          cost: prev.cost || '0',
          volumetric_width: prev.volumetric_width || '',
          volumetric_length: prev.volumetric_length || '',
          volumetric_height: prev.volumetric_height || '',
          cargo_type: prev.cargo_type || 'Parcel',
          pack_refs: prev.pack_refs || [],
          pack_items: (prev as any).pack_items || [],
        } as any
      }
      // Fill missing entries up to newSeats
      while (newOptions.length < newSeats) {
        newOptions.push({})
      }
      return { ...prev, seats_amount: newSeats, options_seat: newOptions }
    })
    setActivePlaceIndex((prev) => prev + 1)
    setIsPlacesListMode(false)
  }, [])

  const handleSwitchPlace = useCallback((index: number) => {
    setActivePlaceIndex(index)
    setIsPlacesListMode(false)
  }, [])

  const handleDeletePlaces = useCallback(
    (indices: number[]) => {
      // Never delete the main place (index 0)
      const safeIndices = indices.filter((i) => i > 0)
      if (safeIndices.length === 0) return
      setForm((prev) => {
        const newOptions = (prev.options_seat || []).filter(
          (_, i) => !safeIndices.includes(i),
        )
        const newSeats = newOptions.length
        // Don't allow deleting all places — at least 1 must remain
        if (newSeats === 0) return prev
        // If going back to 1 seat, migrate data to top-level fields and exit list mode
        if (newSeats === 1 && newOptions[0]) {
          const s = newOptions[0]
          setIsPlacesListMode(false)
          return {
            ...prev,
            seats_amount: 1,
            options_seat: undefined,
            description: s.description || prev.description,
            weight: s.weight || prev.weight,
            cost: s.cost || prev.cost,
            volumetric_width: s.volumetric_width || prev.volumetric_width,
            volumetric_length: s.volumetric_length || prev.volumetric_length,
            volumetric_height: s.volumetric_height || prev.volumetric_height,
            cargo_type: (s.cargo_type as any) || prev.cargo_type,
            pack_refs: s.pack_refs || prev.pack_refs,
            pack_items: (s as any).pack_items || (prev as any).pack_items || [],
          }
        }
        return { ...prev, seats_amount: newSeats, options_seat: newOptions }
      })
      setActivePlaceIndex(0)
    },
    [setIsPlacesListMode],
  )

  // ── Submit handler ──────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (form.sender_profile_id === 0) {
      toast.error(t('novaposhta_sender_not_selected'))
      return
    }
    if (!form.recipient_name || !form.recipient_phone) {
      toast.error(t('novaposhta_validation_recipient_required'))
      return
    }

    if (isEdit && waybill) {
      updateMutation.mutate({ id: waybill.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }, [form, isEdit, waybill, t, createMutation, updateMutation])

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[1550px] w-[96vw] max-h-[90vh] overflow-hidden flex flex-col !gap-0 !p-0"
        aria-describedby={undefined}
        hideClose
      >
        {/* Visually hidden title for a11y (Radix requirement) */}
        <DialogTitle className="sr-only">
          {isEdit
            ? `${t('novaposhta_waybill_edit')} — ${waybill?.np_number}`
            : t('novaposhta_waybill_create')}
        </DialogTitle>
        {/* Header — explicit visual bar */}
        <header className="relative flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3 flex-shrink-0 min-h-[60px]">
          <div className="flex items-center gap-3 min-w-0 pr-8">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-muted-foreground shrink-0" />
              <h2 className="text-base font-semibold truncate">
                {isEdit
                  ? `${t('novaposhta_waybill_edit')} — ${waybill?.np_number}`
                  : t('novaposhta_waybill_create')}
              </h2>
            </div>
            {summary?.exists && !summary.is_deleted && (
              <Badge
                variant={summary.has_sync_error ? 'destructive' : 'secondary'}
                className="text-xs gap-1 shrink-0"
              >
                <BadgeCheck className="w-3 h-3" />
                {summary.status_text || t('novaposhta_waybill_status')}:{' '}
                {summary.status_code}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-4 top-4 h-8 w-8"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* Scrollable content with 4-column grid */}
        {loadingWaybill ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid items-stretch gap-3 xl:grid-cols-4">
              {/* Column 1: Sender (read-only) */}
              <OrderWaybillSenderSection
                sender={selectedSender}
                senders={senders}
                senderCounterpartyDisplay={senderCounterpartyDisplay}
                senderCityDisplay={senderCityDisplay}
                senderAddressDisplay={senderAddressDisplay}
                senderPhone={senderPhone}
                senderContactName={senderContactName}
                disabled={isPending}
                onSenderChange={handleSenderChange}
              />

              {/* Column 2: Shipment (spans columns 2-3 when in packaging mode) */}
              <div
                className={
                  isPackagingMode ? 'order-2 xl:col-span-2' : 'order-2'
                }
              >
                <OrderWaybillShipmentSection
                  description={activeSeat?.description ?? form.description}
                  cargoType={(activeSeat?.cargo_type ?? form.cargo_type) as any}
                  weight={activeSeat?.weight ?? form.weight}
                  cost={activeSeat?.cost ?? form.cost}
                  volumetricWidth={
                    activeSeat?.volumetric_width ?? form.volumetric_width
                  }
                  volumetricLength={
                    activeSeat?.volumetric_length ?? form.volumetric_length
                  }
                  volumetricHeight={
                    activeSeat?.volumetric_height ?? form.volumetric_height
                  }
                  senderProfileId={form.sender_profile_id}
                  isPackagingMode={isPackagingMode}
                  onPackagingModeChange={setIsPackagingMode}
                  isPlacesListMode={isPlacesListMode}
                  activePlaceIndex={activePlaceIndex}
                  onAddPlace={handleAddPlace}
                  onSwitchPlace={handleSwitchPlace}
                  onDeletePlaces={handleDeletePlaces}
                  onPlaceChange={handlePlaceFormChange}
                  onPlacesListModeChange={setIsPlacesListMode}
                  onCancel={handleCancel}
                  onSave={handleSave}
                  disabled={isPending}
                  isEdit={isEdit}
                  waybill={waybill}
                  form={form}
                  onChange={handlePlaceFormChange}
                />
              </div>

              {/* Column 3: Recipient (hidden in packaging mode) */}
              {!isPackagingMode && (
                <OrderWaybillRecipientSection
                  deliveryType={form.delivery_type}
                  recipientName={form.recipient_name}
                  recipientPhone={form.recipient_phone}
                  recipientCityRef={form.recipient_city_ref}
                  recipientCityLabel={form.recipient_city_label}
                  recipientAddressRef={form.recipient_address_ref}
                  recipientAddressLabel={form.recipient_address_label}
                  recipientHouse={form.recipient_house}
                  recipientApartment={form.recipient_apartment}
                  cityQuery={cityQuery}
                  settlements={settlements}
                  settlementsLoading={settlementsLoading}
                  selectedSettlement={selectedSettlement}
                  warehouseQuery={warehouseQuery}
                  warehouses={warehouses}
                  warehousesLoading={warehousesLoading}
                  selectedWarehouse={selectedWarehouse}
                  disabled={isPending}
                  onFieldChange={handleFormChange}
                  onCityQueryChange={setCityQuery}
                  onCitySelect={handleCitySelect}
                  onWarehouseQueryChange={setWarehouseQuery}
                  onWarehouseSelect={handleWarehouseSelect}
                  onDeliveryTypeChange={handleDeliveryTypeChange}
                />
              )}
              {/* Column 4: Payment & Additional Services */}
              <OrderWaybillPaymentSection
                payerType={form.payer_type as any}
                paymentMethod={form.payment_method as any}
                afterpaymentAmount={form.afterpayment_amount}
                cost={form.cost}
                syncError={waybill?.last_sync_error || ''}
                disabled={isPending}
                onChange={handleFormChange}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        {!loadingWaybill && (
          <OrderWaybillFooter
            isEdit={isEdit}
            canEdit={waybill?.can_edit ?? false}
            isPending={isPending}
            isSyncing={syncMutation.isPending}
            isDeleting={deleteMutation.isPending}
            isPrinting={
              printHtmlMutation.isPending || printPdfMutation.isPending
            }
            onSave={handleSave}
            onDelete={() => setShowDeleteConfirm(true)}
            onSync={() => {
              if (waybill) syncMutation.mutate(waybill.id)
            }}
            onPrintHtml={() => {
              if (waybill) printHtmlMutation.mutate(waybill.id)
            }}
            onPrintPdf={() => {
              if (waybill) printPdfMutation.mutate(waybill.id)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('novaposhta_waybill_delete')}</DialogTitle>
            <DialogDescription>
              {t('novaposhta_confirm_delete')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (waybill) deleteMutation.mutate(waybill.id)
                setShowDeleteConfirm(false)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

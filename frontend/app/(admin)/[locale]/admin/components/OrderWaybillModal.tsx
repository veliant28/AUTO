'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { Loader2, Clock, AlertTriangle, Trash2 } from 'lucide-react'
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
import { NpWaybillBadge } from '@/components/ui/NpWaybillBadge'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/lib/toast'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type {
  OrderNovaPoshtaWaybillUpsert,
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupCounterparty,
  NovaPoshtaLookupStreet,
  NovaPoshtaCounterpartyAddress,
} from '@/lib/types/nova-poshta'
import type { WaybillTrackingEvent } from '@/lib/types/nova-poshta'

// ── Section components ──────────────────────────────────────────────────────
import OrderWaybillSenderSection from './OrderWaybillSenderSection'
import OrderWaybillShipmentSection from './OrderWaybillShipmentSection'
import OrderWaybillRecipientSection from './OrderWaybillRecipientSection'
import OrderWaybillPaymentSection from './OrderWaybillPaymentSection'
import OrderWaybillServiceEditorSection from './OrderWaybillServiceEditorSection'
import OrderWaybillFooter from './OrderWaybillFooter'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Show NP API error with severity-based toast color */
function showNpError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail || fallback
  const severity = err?.response?.data?.severity || 'info'
  if (severity === 'error') toast.error(detail)
  else if (severity === 'warning') toast.warning(detail)
  else toast.info(detail)
}
function formatNpNumber(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length !== 14) return num
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers for packaging restore
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converts a waybill seat's packaging data (cm) → PackagingTableEntry (mm)
 * so the packaging button and table can display saved items on re-open.
 */
function buildPackItemsFromSeat(seat: any): any[] {
  if (!seat?.pack_ref) return []
  return [
    {
      ref: seat.pack_ref,
      label: seat.pack_label || seat.pack_ref,
      description: '',
      // Waybill stores dimensions in cm; packaging table expects mm
      width_mm: seat.volumetric_width
        ? String(parseFloat(seat.volumetric_width) * 10)
        : '',
      length_mm: seat.volumetric_length
        ? String(parseFloat(seat.volumetric_length) * 10)
        : '',
      height_mm: seat.volumetric_height
        ? String(parseFloat(seat.volumetric_height) * 10)
        : '',
      cost: seat.pack_cost || '0',
    },
  ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tracking helpers
// ═══════════════════════════════════════════════════════════════════════════════

function renderTrackingTimeline(
  t: (key: string) => string,
  events: WaybillTrackingEvent[],
): React.ReactNode {
  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        {t('novaposhta_tracking_empty')}
      </div>
    )
  }

  return (
    <div className="relative pl-12 space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[22px] top-2 bottom-2 w-[3px] bg-border" />
      {events.map((event, index) => {
        const isFirst = index === 0
        return (
          <div key={index} className="relative pb-6">
            {/* Dot */}
            <div
              className={`absolute -left-[34px] top-1.5 w-5 h-5 rounded-full border-[3px] border-background ${
                isFirst ? 'bg-green-500' : 'bg-blue-500'
              }`}
            />

            {/* Content */}
            <div className="mb-1">
              <div className="font-medium">
                {t(`novaposhta_status_${event.status_code}`) ||
                  event.status_text ||
                  `Код ${event.status_code}`}
              </div>
              {event.event_at && (
                <div className="text-sm text-muted-foreground">
                  {new Date(event.event_at).toLocaleString()}
                </div>
              )}
            </div>
            {event.location && (
              <p className="text-muted-foreground pl-1 text-sm">
                {event.location}
                {event.warehouse ? ` — ${event.warehouse}` : ''}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

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
  const isPrinted = waybill?.is_printed ?? false
  const summary = detail?.summary
  const isEdit = !!waybill && !waybill.is_deleted

  // ── Saved packaging data from waybill (ref — no re-renders) ────────────
  const savedPackRef = useRef({
    pack_ref: '',
    pack_refs: [] as string[],
    volumetric_width: '',
    volumetric_length: '',
    volumetric_height: '',
    pack_label: '',
    pack_cost: '',
  })
  useEffect(() => {
    const seat = waybill?.options_seat?.[0]
    if (seat) {
      savedPackRef.current = {
        pack_ref: seat.pack_ref || '',
        pack_refs: seat.pack_ref ? [seat.pack_ref] : [],
        volumetric_width: seat.volumetric_width || '',
        volumetric_length: seat.volumetric_length || '',
        volumetric_height: seat.volumetric_height || '',
        pack_label: seat.pack_label || '',
        pack_cost: seat.pack_cost || '',
      }
    }
  }, [waybill])

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
    sender_address_ref: '',

    recipient_city_ref: '',
    recipient_city_label: '',
    recipient_address_ref: '',
    recipient_address_label: '',
    recipient_name: '',
    recipient_first_name: '',
    recipient_last_name: '',
    recipient_middle_name: '',
    recipient_phone: '',
    recipient_counterparty_ref: '',
    recipient_contact_ref: '',
    third_person_ref: '',
    recipient_street_ref: '',
    recipient_street_label: '',
    recipient_house: '',
    recipient_apartment: '',
    weight: '0.1',
    seats_amount: 1,
    cost: '0',
    service_refs: [],
    service_params: {},
    packing_number: '',
    additional_information: '',
    info_reg_client_barcodes: '',
    accompanying_documents: '',
    red_box_barcode: '',
    number_of_floors_lifting: '',
    number_of_floors_descent: '',
    forwarding_count: '',
    time_interval: '',
    preferred_delivery_date: '',
    delivery_by_hand: false,
    delivery_by_hand_recipients: '',
    local_express: false,
    saturday_delivery: false,
    special_cargo: false,
  })
  const [isPackagingMode, setIsPackagingMode] = useState(false)
  const [isServicesMode, setIsServicesMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activePlaceIndex, setActivePlaceIndex] = useState(0)
  const [isPlacesListMode, setIsPlacesListMode] = useState(false)
  const [isTrackingMode, setIsTrackingMode] = useState(false)
  const [editingServiceRef, setEditingServiceRef] = useState<string | null>(
    null,
  )
  const [editingServiceName, setEditingServiceName] = useState<string>('')
  const [editingServiceParams, setEditingServiceParams] = useState<
    Record<string, any>
  >({})
  /** Set to the canceled service ref — PaymentSection removes it from selection */
  const [lastCanceledRef, setLastCanceledRef] = useState<string | null>(null)
  /** Tracks last validated cost value — prevents duplicate toasts on blur */
  const lastValidatedCost = useRef<string>('0')
  /** Recipient counterparty type from NP ("PrivatePerson" / "Organization") */
  const [recipientCounterpartyType, setRecipientCounterpartyType] =
    useState<string>('')
  const [thirdPersonRef, setThirdPersonRef] = useState<string>('')

  // ── Derived sender data ─────────────────────────────────────────────────
  const selectedSender = senders.find((s) => s.id === form.sender_profile_id)
  const senderCounterpartyDisplay = selectedSender
    ? selectedSender.organization_name ||
      selectedSender.contact_name ||
      selectedSender.name
    : ''
  const senderCityDisplay =
    selectedSender?.city_label || selectedSender?.city_ref || ''
  const senderAddressDisplay =
    selectedSender?.address_label || selectedSender?.address_ref || ''
  const senderPhone = selectedSender?.phone || ''
  const senderContactName = selectedSender?.contact_name || ''

  // Sync sender_address_ref when sender changes (reset to the sender's default address)
  useEffect(() => {
    if (selectedSender) {
      setForm((prev) => {
        const defaultRef = selectedSender.address_ref || ''
        if (prev.sender_address_ref === defaultRef && defaultRef) {
          return prev // already set, avoid unnecessary update
        }
        return { ...prev, sender_address_ref: defaultRef }
      })
    }
  }, [form.sender_profile_id, selectedSender])

  // ── Sender addresses (available when a sender is selected) ───────────────
  const { data: senderAddresses = [] } = useQuery({
    queryKey: ['nova-poshta', 'sender-addresses', form.sender_profile_id],
    queryFn: () =>
      novaPoshtaApi
        .getSenderAddresses(form.sender_profile_id)
        .then((r) => r.data),
    enabled: form.sender_profile_id > 0 && open,
    staleTime: 60000,
  })

  // ── Delivery type → ServiceType mapping ─────────────────────────────────
  const deliveryServiceType = useMemo(() => {
    const map: Record<string, string> = {
      warehouse: 'WarehouseWarehouse',
      postomat: 'WarehousePostomat',
      address: 'WarehouseDoors',
    }
    return map[form.delivery_type] || 'WarehouseWarehouse'
  }, [form.delivery_type])

  // ── Price calculation ───────────────────────────────────────────────────
  const priceQueryEnabled =
    open &&
    (form.sender_profile_id ?? 0) > 0 &&
    !!selectedSender?.city_ref &&
    !!form.recipient_city_ref &&
    !!form.weight

  // Compute local packaging cost from selected pack_items
  const localPackagingCost = useMemo(() => {
    const items: any[] = (form as any).pack_items || []
    return items.reduce(
      (sum: number, item: any) => sum + Number(item.cost || 0),
      0,
    )
  }, [(form as any).pack_items])

  const {
    data: priceData,
    isLoading: priceLoading,
    isError: priceError,
  } = useQuery({
    queryKey: [
      'nova-poshta',
      'calculate-price',
      form.sender_profile_id,
      selectedSender?.city_ref,
      form.recipient_city_ref,
      form.weight,
      form.cargo_type,
      form.cost,
      form.seats_amount,
      form.afterpayment_amount,
      form.pack_ref ?? form.pack_refs?.[0],
      form.volumetric_width,
      form.volumetric_length,
      form.volumetric_height,
      form.delivery_type,
    ],
    queryFn: () =>
      novaPoshtaApi
        .calculatePrice({
          sender_profile_id: form.sender_profile_id,
          city_sender_ref: selectedSender?.city_ref || '',
          city_recipient_ref: form.recipient_city_ref,
          weight: form.weight || '0.1',
          service_type: deliveryServiceType,
          cost: form.cost || '0',
          cargo_type: form.cargo_type || 'Parcel',
          seats_amount: form.seats_amount || 1,
          afterpayment_amount: form.afterpayment_amount || undefined,
          pack_ref: form.pack_ref ?? form.pack_refs?.[0] ?? undefined,
          volumetric_width: form.volumetric_width || undefined,
          volumetric_length: form.volumetric_length || undefined,
          volumetric_height: form.volumetric_height || undefined,
        })
        .then((r) => r.data),
    enabled: priceQueryEnabled,
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })

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
      setIsTrackingMode(false)
      // Reset city/address queries so SearchableSelect shows saved label on next render
      setCityQuery('')
      setAddressQuery('')
    }
  }, [open])

  useEffect(() => {
    if (waybill && !waybill.is_deleted) {
      // When afterpayment_amount is set, sync cost to match (COD always overrides cost)
      const hasAfterpayment =
        waybill.afterpayment_amount && Number(waybill.afterpayment_amount) > 0
      const syncedCost = hasAfterpayment
        ? String(Math.round(Number(waybill.afterpayment_amount)))
        : String(Number(waybill.cost)) || '0'
      const seats = waybill.seats_amount || 1
      const perSeatCost =
        hasAfterpayment && seats > 1
          ? String(Math.round(Number(syncedCost) / seats))
          : undefined

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
        recipient_first_name: waybill.recipient_first_name,
        recipient_last_name: waybill.recipient_last_name,
        recipient_middle_name: waybill.recipient_middle_name,
        recipient_phone: waybill.recipient_phone,
        recipient_counterparty_ref: waybill.recipient_counterparty_ref || '',
        recipient_contact_ref: waybill.recipient_contact_ref || '',
        third_person_ref: waybill.third_person_ref || '',
        recipient_street_ref: waybill.recipient_street_ref || '',
        recipient_street_label: waybill.recipient_street_label || '',
        recipient_house: waybill.recipient_house || '',
        recipient_apartment: waybill.recipient_apartment || '',
        weight: waybill.weight || '1.000',
        seats_amount: seats,
        cost: syncedCost,
        afterpayment_amount: waybill.afterpayment_amount || undefined,
        packing_number: waybill.packing_number || '',
        additional_information: waybill.additional_information || '',
        info_reg_client_barcodes: waybill.info_reg_client_barcodes || '',
        accompanying_documents: waybill.accompanying_documents || '',
        red_box_barcode: waybill.red_box_barcode || '',
        number_of_floors_lifting: waybill.number_of_floors_lifting || '',
        number_of_floors_descent: waybill.number_of_floors_descent || '',
        forwarding_count: waybill.forwarding_count || '',
        time_interval: waybill.time_interval || '',
        preferred_delivery_date: waybill.preferred_delivery_date || '',
        delivery_by_hand: waybill.delivery_by_hand ?? false,
        delivery_by_hand_recipients: waybill.delivery_by_hand_recipients || '',
        local_express: waybill.local_express ?? false,
        saturday_delivery: waybill.saturday_delivery ?? false,
        special_cargo: waybill.special_cargo ?? false,
        pack_ref: waybill.options_seat?.[0]?.pack_ref || '',
        pack_refs: waybill.options_seat?.[0]?.pack_ref
          ? [waybill.options_seat[0].pack_ref]
          : [],
        volumetric_width: waybill.options_seat?.[0]?.volumetric_width || '',
        volumetric_length: waybill.options_seat?.[0]?.volumetric_length || '',
	        volumetric_height: waybill.options_seat?.[0]?.volumetric_height || '',
	        pack_label: waybill.options_seat?.[0]?.pack_label || '',
	        pack_cost: waybill.options_seat?.[0]?.pack_cost || '',
	        pack_items: buildPackItemsFromSeat(waybill.options_seat?.[0]),
	        options_seat:
          hasAfterpayment && seats > 1
            ? (Array.from({ length: seats }, (_, i) => ({
                ...(waybill.options_seat?.[i]
                  ? {
                      description: waybill.options_seat[i].description,
                      weight: waybill.options_seat[i].weight,
                      volumetric_width:
                        waybill.options_seat[i].volumetric_width,
                      volumetric_length:
                        waybill.options_seat[i].volumetric_length,
                      volumetric_height:
                        waybill.options_seat[i].volumetric_height,
                      pack_refs: waybill.options_seat[i].pack_refs,
                      cargo_type: waybill.options_seat[i].cargo_type,
                    }
                  : {}),
                cost: perSeatCost,
              })) as any)
            : (waybill.options_seat?.map((s) => ({
                description: s.description,
                weight: s.weight,
                cost: s.cost,
                volumetric_width: s.volumetric_width,
                volumetric_length: s.volumetric_length,
                volumetric_height: s.volumetric_height,
                pack_refs: s.pack_refs,
                cargo_type: s.cargo_type,
              })) as any) || undefined,
        service_refs: waybill.service_refs || [],
        service_params: (waybill.service_params as any) || {},
      })
      setThirdPersonRef(waybill.third_person_ref || '')
      formInitialized.current = true
      lastValidatedCost.current = syncedCost
      // Restore city/address display (queries were reset in open-effect)
      setCityQuery(waybill.recipient_city_label || '')
      setAddressQuery(waybill.recipient_address_label || '')
    } else if (
      !waybill &&
      !formInitialized.current &&
      senders.length > 0 &&
      detail
    ) {
      // Set default sender and pre-fill recipient from order data
      const defaultSender = senders.find((s) => s.is_default) || senders[0]
      const orderData = detail.recipient_from_order
      setForm((prev) => ({
        ...prev,
        sender_profile_id: defaultSender?.id || 0,
        recipient_name: orderData?.full_name || prev.recipient_name,
        recipient_phone: orderData?.phone || prev.recipient_phone,
        recipient_first_name:
          orderData?.first_name || prev.recipient_first_name,
        recipient_last_name: orderData?.last_name || prev.recipient_last_name,
        recipient_middle_name:
          orderData?.middle_name || prev.recipient_middle_name,
        // Auto-fill for new TTNs
        ...(orderData?.order_number
          ? { info_reg_client_barcodes: orderData.order_number }
          : {}),
        ...(orderData?.order_total
          ? { cost: String(Math.round(Number(orderData.order_total))) }
          : {}),
      }))
      formInitialized.current = true
    } else if (
      !waybill &&
      !formInitialized.current &&
      senders.length > 0 &&
      !detail
    ) {
      // detail not loaded yet — set sender only, recipient will come in next run
      const defaultSender = senders.find((s) => s.is_default) || senders[0]
      setForm((prev) => ({
        ...prev,
        sender_profile_id: defaultSender?.id || 0,
      }))
    }
    return () => {}
  }, [waybill, senders, detail])

  // ── Lookups ──────────────────────────────────────────────────────────────
  const [cityQuery, setCityQuery] = useState('')
  const [addressQuery, setAddressQuery] = useState('')

  const startsWithDigit = /^\d/.test(addressQuery)
  const startsWithLetter = /^[a-zа-яіїєґ']/i.test(addressQuery)

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
    retry: false,
    placeholderData: keepPreviousData,
  })

  // Warehouse search (digits → warehouse/postomat mode)
  const warehouseQuery = startsWithDigit ? addressQuery : ''
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
    enabled:
      startsWithDigit &&
      !!form.recipient_city_ref &&
      form.sender_profile_id > 0,
    staleTime: 60000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  // ── Selected lookup items (for SearchableSelect value) ──────────────────
  const selectedSettlement =
    settlements.find((s) => s.delivery_city_ref === form.recipient_city_ref) ||
    null

  // Street search (letters → street mode)
  const streetQuery = startsWithLetter ? addressQuery : ''
  // Use settlement_ref (Ref from getSettlements), NOT delivery_city_ref
  const settlementRefForStreet =
    selectedSettlement?.settlement_ref ||
    selectedSettlement?.ref ||
    form.recipient_city_ref
  const { data: streets = [], isLoading: streetsLoading } = useQuery({
    queryKey: [
      'np-lookup',
      'streets',
      form.sender_profile_id,
      settlementRefForStreet,
      streetQuery,
    ],
    queryFn: () =>
      novaPoshtaApi
        .searchStreets({
          sender_profile_id: form.sender_profile_id,
          settlement_ref: settlementRefForStreet,
          query: streetQuery,
        })
        .then((r) => r.data),
    enabled:
      startsWithLetter &&
      !!settlementRefForStreet &&
      addressQuery.length >= 2 &&
      form.sender_profile_id > 0,
    staleTime: 30000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  // ── Counterparty lookup ──────────────────────────────────────────────────
  const [counterpartyQuery, setCounterpartyQuery] = useState('')

  const { data: counterparties = [], isLoading: counterpartiesLoading } =
    useQuery({
      queryKey: [
        'np-lookup',
        'counterparties',
        form.sender_profile_id,
        counterpartyQuery,
      ],
      queryFn: () =>
        novaPoshtaApi
          .searchCounterparties({
            sender_profile_id: form.sender_profile_id,
            query: counterpartyQuery,
            counterparty_property: 'Recipient,ThirdPerson',
          })
          .then((r) => r.data),
      enabled: counterpartyQuery.length >= 2 && form.sender_profile_id > 0,
      staleTime: 30000,
      retry: false,
      placeholderData: keepPreviousData,
    })

  const selectedCounterparty =
    counterparties.find(
      (c) => c.counterparty_ref === form.recipient_counterparty_ref,
    ) || null

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
      showNpError(err, t('novaposhta_error_api')),
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
      showNpError(err, t('novaposhta_error_api')),
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
      showNpError(err, t('novaposhta_error_api')),
  })

  const syncMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.syncWaybillStatus(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
      queryClient.invalidateQueries({ queryKey: ['np-summary', orderId] })
      if (waybill?.np_number) {
        toast.info(
          t('novaposhta_waybill_sync', {
            number: formatNpNumber(waybill.np_number),
          }),
        )
      } else {
        toast.info(t('novaposhta_waybill_sync', { number: '' }))
      }
    },
    onError: (err: any) =>
      showNpError(err, t('novaposhta_error_api')),
  })

  const printMarkingsMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.printWaybill(id, 'markings').then((r) => r.data),
    onSuccess: (res) => {
      if (res.url) window.open(res.url, '_blank')
      else toast.error(t('novaposhta_print_no_url'))
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
    },
    onError: (err: any) =>
      showNpError(err, t('novaposhta_error_api')),
  })

  const printTtnMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.printWaybill(id, 'ttn').then((r) => r.data),
    onSuccess: (res) => {
      if (res.url) window.open(res.url, '_blank')
      else toast.error(t('novaposhta_print_no_url'))
      queryClient.invalidateQueries({ queryKey: ['np-waybill', orderId] })
    },
    onError: (err: any) =>
      showNpError(err, t('novaposhta_error_api')),
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

  // ── Blur handler — validates cost against afterpayment_amount ──────────
  const handleFieldBlur = useCallback(
    (field: string, value: any) => {
      if (field !== 'cost') return
      setForm((prev) => {
        const afterpayment = prev.afterpayment_amount
        if (!afterpayment || Number(afterpayment) <= 0) return prev

        if (Number(value) < Number(afterpayment)) {
          toast.warning(t('novaposhta_cost_below_afterpayment'))
          lastValidatedCost.current = afterpayment
          // Reset cost to afterpayment_amount
          if (prev.seats_amount && prev.seats_amount > 1) {
            const perSeatMin = Math.round(
              Number(afterpayment) / prev.seats_amount,
            )
            const newOptions = (prev.options_seat || []).map((s) => ({
              ...s,
              cost: String(perSeatMin),
            }))
            return { ...prev, options_seat: newOptions, cost: afterpayment }
          }
          return { ...prev, cost: afterpayment }
        }

        if (
          Number(value) > Number(afterpayment) &&
          value !== lastValidatedCost.current
        ) {
          toast.info(t('novaposhta_cost_above_afterpayment'))
          lastValidatedCost.current = value
        }
        return prev
      })
    },
    [t],
  )

  // ── City/Warehouse selection handlers ───────────────────────────────────
  const handleCitySelect = useCallback((item: NovaPoshtaLookupSettlement) => {
    setForm((prev) => ({
      ...prev,
      recipient_city_ref: item.delivery_city_ref,
      recipient_city_label: item.label,
      // Reset address when city changes
      recipient_address_ref: '',
      recipient_address_label: '',
      recipient_street_ref: '',
      recipient_street_label: '',
      recipient_house: '',
    }))
    setCityQuery(item.label)
    setAddressQuery('')
  }, [])

  const handleWarehouseSelect = useCallback(
    (item: NovaPoshtaLookupWarehouse) => {
      const deliveryType = item.type === 'Postomat' ? 'postomat' : 'warehouse'
      setForm((prev) => ({
        ...prev,
        delivery_type: deliveryType,
        recipient_address_ref: item.ref,
        recipient_address_label: item.label,
        // Clear street address when warehouse/postomat is selected
        recipient_street_ref: '',
        recipient_street_label: '',
        recipient_house: '',
      }))
      // Reset search query — display is handled by addressDisplay in child
      setAddressQuery('')
    },
    [],
  )

  const handleSenderChange = useCallback((id: number) => {
    setForm((prev) => ({ ...prev, sender_profile_id: id }))
  }, [])

  const handleSenderAddressChange = useCallback((addressRef: string) => {
    setForm((prev) => ({ ...prev, sender_address_ref: addressRef }))
  }, [])

  // ── Counterparty selection handlers ───────────────────────────────────────
  const handleCounterpartyQueryChange = useCallback((query: string) => {
    setCounterpartyQuery(query)
  }, [])

  const handleCounterpartySelect = useCallback(
    (item: NovaPoshtaLookupCounterparty) => {
      setForm((prev) => ({
        ...prev,
        recipient_counterparty_ref: item.counterparty_ref,
        recipient_contact_ref: item.ref,
        // Auto-fill FIO from counterparty data
        recipient_name: item.full_name || item.label,
        recipient_last_name: item.last_name,
        recipient_first_name: item.first_name,
        recipient_middle_name: item.middle_name,
      }))
      setRecipientCounterpartyType(item.counterparty_type)
      setCounterpartyQuery(item.label)
      // Save third_person_ref if a ThirdPerson counterparty was selected
      if (item.counterparty_property === 'ThirdPerson') {
        setThirdPersonRef(item.counterparty_ref)
      } else {
        setThirdPersonRef('')
      }
    },
    [],
  )

  // ── Street selection (for address delivery — comma in address field) ─────
  const handleStreetSelect = useCallback(
    (item: NovaPoshtaLookupStreet, house?: string, apartment?: string) => {
      setForm((prev) => ({
        ...prev,
        delivery_type: 'address',
        recipient_street_ref: item.street_ref,
        recipient_street_label: item.label,
        recipient_house: house || prev.recipient_house || '',
        recipient_apartment: apartment || prev.recipient_apartment || '',
        // Clear warehouse address when street is selected
        recipient_address_ref: '',
        recipient_address_label: '',
      }))
      // Reset search query — display is handled by addressDisplay in child
      setAddressQuery('')
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

      // If AfterpaymentOnGoodsCost is active, redistribute cost across all seats
      const hasAfterpayment =
        prev.afterpayment_amount && Number(prev.afterpayment_amount) > 0
      if (hasAfterpayment) {
        const perSeatCost = String(
          Math.round(Number(prev.afterpayment_amount) / newSeats),
        )
        newOptions.forEach((opt, i) => {
          newOptions[i] = { ...opt, cost: perSeatCost }
        })
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
        // If AfterpaymentOnGoodsCost is active, redistribute cost across remaining seats
        const hasAfterpayment =
          prev.afterpayment_amount && Number(prev.afterpayment_amount) > 0
        if (hasAfterpayment && newSeats > 1) {
          const perSeatCost = String(
            Math.round(Number(prev.afterpayment_amount) / newSeats),
          )
          newOptions.forEach((opt, i) => {
            newOptions[i] = { ...opt, cost: perSeatCost }
          })
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

    // Merge saved packaging from waybill into payload (form may not have it)
    const sp = savedPackRef.current
    const savePayload = {
      ...form,
      ...(sp.pack_ref && !form.pack_ref
        ? {
            pack_ref: sp.pack_ref,
            pack_refs: sp.pack_refs,
            volumetric_width: sp.volumetric_width,
            volumetric_length: sp.volumetric_length,
            volumetric_height: sp.volumetric_height,
          }
        : {}),
    }

    if (isEdit && waybill) {
      updateMutation.mutate({ id: waybill.id, data: savePayload })
    } else {
      createMutation.mutate(savePayload)
    }
  }, [form, isEdit, waybill, t, createMutation, updateMutation])

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // ── Service editor handlers ────────────────────────────────────────────

  const handleServiceEdit = useCallback(
    (serviceRef: string, serviceName: string) => {
      const params = form.service_params?.[serviceRef] || {}
      setEditingServiceParams(params)
      setEditingServiceRef(serviceRef)
      setEditingServiceName(serviceName)
    },
    [form.service_params],
  )

  const SERVICE_SYNC_FIELD_MAP: Record<string, Record<string, string>> = {
    AfterpaymentOnGoodsCost: {
      afterpayment_amount: 'afterpayment_amount',
    },
    PackingNumber: {
      packing_number: 'packing_number',
    },
    InfoRegClientBarcodes: {
      info_reg_client_barcodes: 'info_reg_client_barcodes',
    },
    AccompanyingDocuments: {
      accompanying_documents: 'accompanying_documents',
    },
    AdditionalInformation: {
      additional_information: 'additional_information',
    },
    NumberOfFloorsLifting: {
      number_of_floors_lifting: 'number_of_floors_lifting',
    },
    NumberOfFloorsDescent: {
      number_of_floors_descent: 'number_of_floors_descent',
    },
    ForwardingCount: {
      forwarding_count: 'forwarding_count',
    },
    RedBoxBarcode: {
      red_box_barcode: 'red_box_barcode',
    },
    LocalExpress: {
      time_interval: 'time_interval',
      local_express: 'local_express',
    },
    PreferredDeliveryDate: {
      preferred_delivery_date: 'preferred_delivery_date',
      time_interval: 'time_interval',
    },
    DeliveryByHand: {
      delivery_by_hand: 'delivery_by_hand',
      delivery_by_hand_recipients: 'delivery_by_hand_recipients',
    },
    SaturdayDelivery: {
      saturday_delivery: 'saturday_delivery',
    },
    SpecialCargo: {
      special_cargo: 'special_cargo',
    },
  }

  const handleServiceSave = useCallback(
    (params: Record<string, any>) => {
      if (!editingServiceRef) return
      const fieldMapping = SERVICE_SYNC_FIELD_MAP[editingServiceRef]
      const syncObj: Record<string, any> = {}
      if (fieldMapping) {
        for (const [paramKey, formField] of Object.entries(fieldMapping)) {
          if (paramKey in params) {
            syncObj[formField] = params[paramKey]
          }
        }
      }

      // AfterpaymentOnGoodsCost → always sync afterpayment_amount to cost
      // and distribute equally across seats when multiple places
      if (
        editingServiceRef === 'AfterpaymentOnGoodsCost' &&
        'afterpayment_amount' in params
      ) {
        const paymentAmount = String(
          Math.round(Number(params.afterpayment_amount) || 0),
        )
        syncObj.cost = paymentAmount
        syncObj.afterpayment_amount = paymentAmount
        lastValidatedCost.current = paymentAmount
      }

      setForm((prev) => {
        const base = {
          ...prev,
          service_params: {
            ...prev.service_params,
            [editingServiceRef]: params,
          },
          ...syncObj,
        }

        // Multi-seat distribution for AfterpaymentOnGoodsCost
        if (
          editingServiceRef === 'AfterpaymentOnGoodsCost' &&
          base.cost &&
          (prev.seats_amount ?? 1) > 1
        ) {
          const seatCount = prev.seats_amount ?? 1
          const perSeat = String(Math.round(Number(base.cost) / seatCount))
          const newOptions = [...(prev.options_seat || [])]
          // Ensure all seats exist
          while (newOptions.length < seatCount) {
            newOptions.push({} as any)
          }
          base.options_seat = newOptions.map((s) => ({ ...s, cost: perSeat }))
        }

        return base
      })

      setEditingServiceRef(null)
      setEditingServiceParams({})
      setEditingServiceName('')
    },
    [editingServiceRef],
  )

  const handleServiceCancel = useCallback(() => {
    // Tell PaymentSection which service to remove from its local selection.
    // We do NOT touch form.service_refs — that would delete existing services.
    if (editingServiceRef) {
      setLastCanceledRef(editingServiceRef)
    }
    setEditingServiceRef(null)
    setEditingServiceParams({})
    setEditingServiceName('')
  }, [editingServiceRef])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[98vw] max-w-[1800px] h-[90vh] flex flex-col !gap-0 !p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {isTrackingMode
                ? t('novaposhta_tracking_title')
                : isEdit
                  ? t('novaposhta_waybill_edit')
                  : t('novaposhta_waybill_create')}
            </DialogTitle>

            {/* TTN badge — always visible */}
            <NpWaybillBadge
              npNumber={waybill?.np_number}
              exists={summary?.exists}
              isDeleted={waybill?.is_deleted}
            />
          </div>
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        {/* Scrollable content with 4-column grid */}
        {loadingWaybill ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isTrackingMode ? (
          /* ═══════════════ Tracking mode ═══════════════ */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {/* Timeline */}
              {renderTrackingTimeline(t, waybill?.tracking_events || [])}

              {/* Error state */}
              {waybill?.last_sync_error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {waybill.last_sync_error}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid items-stretch gap-3 xl:grid-cols-4 min-h-full">
              {/* Column 1: Sender */}
              <OrderWaybillSenderSection
                sender={selectedSender}
                senders={senders}
                senderCounterpartyDisplay={senderCounterpartyDisplay}
                senderCityDisplay={senderCityDisplay}
                senderAddressDisplay={senderAddressDisplay}
                senderPhone={senderPhone}
                senderContactName={senderContactName}
                senderAddresses={senderAddresses}
                selectedAddressRef={
                  form.sender_address_ref || selectedSender?.address_ref || ''
                }
                disabled={
                  isPending ||
                  isPackagingMode ||
                  isServicesMode ||
                  isPrinted ||
                  isEdit
                }
                onSenderChange={handleSenderChange}
                onAddressChange={handleSenderAddressChange}
              />

              {/* Column 2: Shipment or Service Editor */}
              <div
                className={
                  isPackagingMode ? 'order-2 xl:col-span-2' : 'order-2'
                }
              >
                {editingServiceRef ? (
                  <OrderWaybillServiceEditorSection
                    serviceRef={editingServiceRef}
                    serviceName={editingServiceName}
                    params={editingServiceParams}
                    onSave={handleServiceSave}
                    onCancel={handleServiceCancel}
                    senderProfileId={form.sender_profile_id}
                    recipientCityRef={form.recipient_city_ref}
                    deliveryType={form.delivery_type}
                  />
                ) : (
                  <OrderWaybillShipmentSection
                    description={activeSeat?.description ?? form.description}
                    cargoType={
                      (activeSeat?.cargo_type ?? form.cargo_type) as any
                    }
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
                    onFieldBlur={handleFieldBlur}
                    disabled={isPending || isServicesMode || isPrinted}
                    isEdit={isEdit}
                    waybill={waybill}
                    form={form}
                    onChange={handlePlaceFormChange}
                  />
                )}
              </div>

              {/* Column 3: Recipient (hidden in packaging/services mode) */}
              {!isPackagingMode && !isServicesMode && (
                <OrderWaybillRecipientSection
                  deliveryType={form.delivery_type}
                  recipientName={form.recipient_name}
                  recipientPhone={form.recipient_phone}
                  recipientCityRef={form.recipient_city_ref}
                  recipientCityLabel={form.recipient_city_label}
                  recipientAddressRef={form.recipient_address_ref}
                  recipientAddressLabel={form.recipient_address_label}
                  recipientStreetRef={form.recipient_street_ref}
                  recipientStreetLabel={form.recipient_street_label}
                  recipientHouse={form.recipient_house}
                  recipientApartment={form.recipient_apartment}
                  recipientCounterpartyRef={form.recipient_counterparty_ref}
                  recipientContactRef={form.recipient_contact_ref}
                  cityQuery={cityQuery}
                  settlements={settlements}
                  settlementsLoading={settlementsLoading}
                  selectedSettlement={selectedSettlement}
                  addressQuery={addressQuery}
                  warehouses={warehouses}
                  warehousesLoading={warehousesLoading}
                  streets={streets}
                  streetsLoading={streetsLoading}
                  counterpartyQuery={counterpartyQuery}
                  counterparties={counterparties}
                  counterpartiesLoading={counterpartiesLoading}
                  selectedCounterparty={selectedCounterparty}
                  disabled={isPending || isPrinted}
                  onFieldChange={handleFormChange}
                  onCityQueryChange={setCityQuery}
                  onCitySelect={handleCitySelect}
                  onAddressQueryChange={setAddressQuery}
                  onWarehouseSelect={handleWarehouseSelect}
                  onStreetSelect={handleStreetSelect}
                  onCounterpartyQueryChange={handleCounterpartyQueryChange}
                  onCounterpartySelect={handleCounterpartySelect}
                />
              )}
              {/* Column 4: Payment & Additional Services */}
              <div
                className={isServicesMode ? 'order-4 xl:col-span-2' : 'order-4'}
              >
                <OrderWaybillPaymentSection
                  payerType={form.payer_type as any}
                  paymentMethod={form.payment_method as any}
                  afterpaymentAmount={form.afterpayment_amount}
                  cost={form.cost}
                  syncError={waybill?.last_sync_error || ''}
                  disabled={
                    isPending ||
                    isPackagingMode ||
                    !!editingServiceRef ||
                    isPrinted
                  }
                  isServicesMode={isServicesMode}
                  onServicesModeChange={setIsServicesMode}
                  senderProfileId={form.sender_profile_id}
                  senderType={selectedSender?.sender_type || ''}
                  recipientCounterpartyType={recipientCounterpartyType}
                  thirdPersonRef={thirdPersonRef}
                  onChange={handleFormChange}
                  initialServiceRefs={form.service_refs}
                  initialServiceParams={form.service_params}
                  onServiceEdit={handleServiceEdit}
                  editingServiceRef={editingServiceRef}
                  lastCanceledRef={lastCanceledRef}
                  priceData={priceData ?? null}
                  priceLoading={priceLoading}
                  priceError={priceError}
                  localPackagingCost={localPackagingCost}
                />
              </div>
            </div>
          </div>
        )}

        <Separator className="flex-shrink-0" />

        {/* Footer */}
        {!loadingWaybill && (
          <OrderWaybillFooter
            isEdit={isEdit}
            canEdit={waybill?.can_edit ?? false}
            isPending={isPending}
            isDeleting={deleteMutation.isPending}
            isPrinting={
              printMarkingsMutation.isPending || printTtnMutation.isPending
            }
            isTrackingView={isTrackingMode}
            onSave={handleSave}
            onDelete={() => setShowDeleteConfirm(true)}
            onPrintMarkings={() => {
              if (waybill) printMarkingsMutation.mutate(waybill.id)
            }}
            onPrintTtn={() => {
              if (waybill) printTtnMutation.mutate(waybill.id)
            }}
            onCancel={() => onOpenChange(false)}
            onTracking={() => {
              if (isTrackingMode) {
                setIsTrackingMode(false)
              } else if (waybill) {
                syncMutation.mutate(waybill.id, {
                  onSuccess: () => setIsTrackingMode(true),
                })
              }
            }}
            disabled={isPackagingMode || isServicesMode}
          />
        )}
      </DialogContent>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('novaposhta_waybill_delete')}</DialogTitle>
                <DialogDescription>
                  {t('novaposhta_confirm_delete')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {waybill && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {waybill.np_number
                    ? formatNpNumber(waybill.np_number)
                    : `ТТН #${waybill.id}`}
                </span>
              </div>
            </div>
          )}
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
              className="gap-2"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

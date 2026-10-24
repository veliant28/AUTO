'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  Search,
  Pencil,
  History,
  X,
  Plus,
  Minus,
  ArrowLeft,
  Loader2,
  Package,
  CreditCard,
  Clock,
  Trash2,
  Save,
  Building2,
  Container,
  Truck,
  MapPin,
  User,
  ScrollText,
  FilePlus,
  Printer,
  RefreshCw,
  AlertTriangle,
  ScanBarcode,
  Gift,
  Laptop,
  Check,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import AnimatedSuccessBadge from './AnimatedSuccessBadge'
import api from '@/lib/api'
import { useTimezoneStore } from '@/store/timezoneStore'
import { formatDateTime } from '@/lib/dates'
import { useNovaPoshtaAddressSearch } from '@/hooks/useNovaPoshtaAddressSearch'
import {
  SettlementItem,
  WarehouseDropdownItem,
} from '@/components/ui/nova-poshta-items'
import {
  getReceipt as getCheckboxReceipt,
  getReceiptLink as getCheckboxReceiptLink,
} from '@/lib/api/checkbox'
import { useAuthStore } from '@/store/authStore'
import { useRequirePerm } from '@/hooks/useRequirePerm'
import { useCopyTtn } from '@/hooks/useCopyTtn'
import { EDIT_LOCKED_STATUSES, ORDER_STATUS_LABELS } from '@/lib/constants'
import { broadcastStatusChange } from '@/lib/orderSync'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import { supplierBadgeClass, supplierBadgeLabel } from '@/lib/suppliers'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import PaymentBlock from './PaymentBlock'
import PaymentBadge from './PaymentBadge'
import { paymentBadgeClass, paymentMethodLabel } from './PaymentHelpers'
import OrderProductSearch, { OrderSearchProduct } from './OrderProductSearch'
import { fetchPaymentMethods } from '@/lib/api/payments'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

interface AdminOrderItemDetail {
  id: number
  part_id: number
  article: string
  part_name: string
  brand: string | null
  quantity: number
  price: number
  sku: string | null
  image_url: string | null
  offers: { supplier_name: string }[]
  supplier_name: string | null
}

interface AdminOrderDetail {
  id: number
  order_number: string
  user_id: number
  status: string
  total: number
  full_name: string
  phone: string | null
  address: string | null
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  delivery_type: string | null
  delivery_city: string | null
  delivery_warehouse: string | null
  delivery_city_ref: string | null
  delivery_settlement_ref: string | null
  delivery_city_label: string | null
  delivery_warehouse_ref: string | null
  delivery_warehouse_label: string | null
  delivery_street_ref: string | null
  delivery_street_label: string | null
  delivery_house: string | null
  delivery_apartment: string | null
  promocode_code: string | null
  discount_amount: number
  original_total: number | null
  payment_method: string | null
  created_at: string
  updated_by_name: string | null
  updated_by_group: string | null
  updated_at: string | null
  items: AdminOrderItemDetail[]
  user_success_index: number
  user_total_orders: number
}

interface UnifiedEvent {
  id: number
  type: 'order' | 'waybill'
  event_type: string
  user_name: string | null
  user_group: string | null
  details: string | null
  np_number: string | null
  created_at: string
}

const statusKeys = Object.keys(ORDER_STATUS_LABELS)

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone
  const d = digits.slice(-10)
  return `+38 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`
}

function formatPhonesInText(text: string): string {
  return text.replace(/(\+\d{10,13})/g, (m) => formatPhone(m))
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
  system: 'bg-black text-white dark:bg-white dark:text-black',
}

interface OrderDetailModalProps {
  orderId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Режим создания заказа (заказ по телефону): товары и получатель вводятся вручную */
  createMode?: boolean
}

type DraftItem = OrderSearchProduct & { quantity: number }

function formatDate(dateStr: string): string {
  return formatDateTime(dateStr, useTimezoneStore.getState().timezone, {
    locale: LOCALE_MAP.ru,
    seconds: false,
  })
}

interface OrderItemCardProps {
  imageUrl: string | null
  brand: string | null
  article: string
  sku: string | null
  partName: string
  supplierName: string | null
  price: number
  quantity: number
  editable: boolean
  onDecrease?: () => void
  onIncrease?: () => void
  onRemove?: () => void
  removeDisabled?: boolean
  deleteLabel: string
  /** Позиция добавлена в редакторе и ещё не сохранена — пунктирная рамка */
  pending?: boolean
}

/** Карточка позиции заказа — общая для просмотра, редактирования и создания. */
function OrderItemCard({
  imageUrl,
  brand,
  article,
  sku,
  partName,
  supplierName,
  price,
  quantity,
  editable,
  onDecrease,
  onIncrease,
  onRemove,
  removeDisabled,
  deleteLabel,
  pending = false,
}: OrderItemCardProps) {
  return (
    <div
      className={`flex gap-3 p-3 rounded-lg border bg-card transition-colors ${pending ? 'border-dashed border-primary/60' : ''}`}
    >
      <div
        className={`w-[80px] h-[80px] shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center ${imageUrl ? '' : `bg-gradient-to-br ${getBrandColor(brand)}`}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl font-bold text-white/40 select-none">
            {getBrandInitial(brand)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {brand && (
                <Badge variant="secondary" className="text-sm px-1.5">
                  {brand}
                </Badge>
              )}
              <span className="text-sm font-mono text-muted-foreground">
                {article}
              </span>
              {supplierName && (
                <Badge
                  className={`${supplierBadgeClass(supplierName)} border-0 text-sm`}
                  title={supplierName}
                >
                  {supplierBadgeLabel(supplierName)}
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium line-clamp-2">{partName}</p>
          </div>
          <div className="flex items-center shrink-0 gap-2">
            {sku && (
              <Badge className="bg-blue-500 text-white border-0 text-sm">
                {sku}
              </Badge>
            )}
            {editable && onRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="shrink-0"
                    onClick={onRemove}
                    disabled={removeDisabled}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{deleteLabel}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          {editable ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={onDecrease}
                disabled={quantity <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center font-medium tabular-nums">
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={onIncrease}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground ml-1">
                × {fmt(price)} ₴
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {quantity} &times; {fmt(price)} ₴
            </span>
          )}
          <span className="font-semibold text-base">
            {fmt(quantity * price)} ₴
          </span>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailModal({
  orderId,
  open,
  onOpenChange,
  createMode = false,
}: OrderDetailModalProps) {
  const t = useTranslations('admin')
  const tc = useTranslations('checkout')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const timezone = useTimezoneStore((s) => s.timezone)
  const { user } = useAuthStore()
  const reqPerm = useRequirePerm()
  const copyTtn = useCopyTtn()

  const [editMode, setEditMode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>(
    {},
  )
  const [editRecipient, setEditRecipient] = useState<Record<string, string>>({})

  const deliveryCityRef = editRecipient.delivery_city_ref || ''
  const deliveryType = editRecipient.delivery_type || ''
  const settlementRef = editRecipient.delivery_settlement_ref || ''

  // Поиск Новой Почты — тот же хук, что на витрине в оформлении заказа
  const {
    cityQuery,
    setCityQuery,
    warehouseQuery,
    setWarehouseQuery,
    streetQuery,
    setStreetQuery,
    settlements,
    citiesLoading,
    warehouses,
    warehousesLoading,
    streets,
    streetsLoading,
  } = useNovaPoshtaAddressSearch({
    prefix: 'admin-order',
    cityRef: deliveryCityRef,
    settlementRef,
    locale,
  })

  const [promoInput, setPromoInput] = useState('')

  // ── Режим создания заказа (заказ по телефону) ──────────────────
  const editable = editMode || createMode
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [draftPromo, setDraftPromo] = useState<{
    code: string
    discount: number
  } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  // Позиции, добавленные в существующий заказ в режиме редактирования
  // (уходят на бэкенд только при сохранении)
  const [newItems, setNewItems] = useState<DraftItem[]>([])

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => fetchPaymentMethods().then((r) => r.methods),
    enabled: createMode && open,
    staleTime: 30000,
  })
  const enabledPaymentMethods = useMemo(
    () => (paymentMethods || []).filter((m) => m.enabled),
    [paymentMethods],
  )

  // Каждое открытие создания — чистая форма
  useEffect(() => {
    if (!createMode || !open) return
    setDraftItems([])
    setDraftPromo(null)
    setPromoInput('')
    setPaymentMethod('')
    setEditRecipient({})
    setCityQuery('')
    setWarehouseQuery('')
    setStreetQuery('')
  }, [createMode, open, setCityQuery, setWarehouseQuery, setStreetQuery])

  const draftTotal = useMemo(
    () =>
      draftItems.reduce(
        (sum, item) => sum + item.quantity * (item.price || 0),
        0,
      ),
    [draftItems],
  )
  const draftDiscount = draftPromo?.discount || 0
  const draftGrandTotal = Math.max(draftTotal - draftDiscount, 0)
  const draftQuantities = useMemo(() => {
    const map: Record<number, number> = {}
    draftItems.forEach((item) => {
      map[item.part_id] = item.quantity
    })
    return map
  }, [draftItems])

  const addDraftItem = (product: OrderSearchProduct) => {
    setDraftItems((prev) => {
      const existing = prev.find((item) => item.part_id === product.part_id)
      if (existing) {
        return prev.map((item) =>
          item.part_id === product.part_id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const changeDraftQuantity = (partId: number, delta: number) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.part_id === partId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    )
  }

  const promoMessageKey = (message: string): string => {
    if (message.includes('not found')) return 'not_found'
    if (message.includes('inactive')) return 'inactive'
    if (message.includes('expired')) return 'expired'
    if (message.includes('already used')) return 'used'
    if (message.includes('another user')) return 'wrong_user'
    return 'error'
  }

  const applyDraftPromo = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post('/loyalty/validate', {
        code,
        phone: editRecipient.phone || undefined,
        items: draftItems.map((item) => ({
          part_id: item.part_id,
          price: item.price || 0,
          quantity: item.quantity,
        })),
      })
      return data
    },
    onSuccess: (resp, code) => {
      if (!resp?.valid) {
        toast.error(t('promo_' + promoMessageKey(resp?.message || 'error')))
        return
      }
      setDraftPromo({ code, discount: resp?.discount_amount || 0 })
      setPromoInput('')
      toast.success(t('promo_applied'))
    },
    onError: () => toast.error(t('promo_error')),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/orders', {
        last_name: editRecipient.last_name || '',
        first_name: editRecipient.first_name || '',
        middle_name: editRecipient.middle_name || '',
        phone: editRecipient.phone || '',
        delivery_type: editRecipient.delivery_type || '',
        delivery_city: editRecipient.delivery_city || '',
        delivery_warehouse: editRecipient.delivery_warehouse || '',
        delivery_city_ref: editRecipient.delivery_city_ref || '',
        delivery_settlement_ref: editRecipient.delivery_settlement_ref || '',
        delivery_city_label: editRecipient.delivery_city_label || '',
        delivery_warehouse_ref: editRecipient.delivery_warehouse_ref || '',
        delivery_warehouse_label: editRecipient.delivery_warehouse_label || '',
        delivery_street_ref: editRecipient.delivery_street_ref || '',
        delivery_street_label: editRecipient.delivery_street_label || '',
        delivery_house: editRecipient.delivery_house || '',
        delivery_apartment: editRecipient.delivery_apartment || '',
        payment_method: paymentMethod,
        promocode: draftPromo?.code || null,
        items: draftItems.map((item) => ({
          part_id: item.part_id,
          quantity: item.quantity,
        })),
      })
      return data as AdminOrderDetail
    },
    onSuccess: (data) => {
      toast.success(t('order_created'))
      // Кэшируем созданный заказ, чтобы модалка сразу показала его без запроса
      queryClient.setQueryData(['admin-order-detail', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      setDraftItems([])
      setDraftPromo(null)
      setPromoInput('')
      setEditRecipient({})
      // После создания просто закрываем модалку: заказ уже в списке
      onOpenChange(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('order_create_error'))
    },
  })

  const handleCreate = () => {
    if (draftItems.length === 0) {
      toast.error(t('items_required'))
      return
    }
    if (!editRecipient.last_name?.trim()) {
      toast.error(t('last_name_required'))
      return
    }
    if (!editRecipient.first_name?.trim()) {
      toast.error(t('first_name_required'))
      return
    }
    const phoneDigits = (editRecipient.phone || '').replace(/\D/g, '')
    if (!phoneDigits) {
      toast.error(t('phone_required'))
      return
    }
    if (!/^380\d{9}$/.test(phoneDigits)) {
      toast.error(t('phone_format'))
      return
    }
    if (!editRecipient.delivery_type) {
      toast.error(t('delivery_required'))
      return
    }
    if (editRecipient.delivery_type === 'warehouse') {
      if (!editRecipient.delivery_city_ref) {
        toast.error(t('city_required'))
        return
      }
      if (!editRecipient.delivery_warehouse_ref) {
        toast.error(t('warehouse_required'))
        return
      }
    }
    if (editRecipient.delivery_type === 'courier') {
      if (!editRecipient.delivery_city_ref) {
        toast.error(t('city_required'))
        return
      }
      if (!editRecipient.delivery_street_ref) {
        toast.error(t('street_required'))
        return
      }
      if (!editRecipient.delivery_house?.trim()) {
        toast.error(t('house_required'))
        return
      }
    }
    if (!paymentMethod) {
      toast.error(t('payment_required'))
      return
    }
    createMutation.mutate()
  }

  const {
    data: orderDetail,
    isLoading: detailLoading,
    refetch: refetchOrderDetail,
  } = useQuery({
    queryKey: ['admin-order-detail', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${orderId}`)
      return data as AdminOrderDetail
    },
    enabled: !!orderId && open,
    refetchInterval: 10000,
  })

  const { data: allEvents } = useQuery({
    queryKey: ['admin-order-all-events', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${orderId}/all-events`)
      return data as UnifiedEvent[]
    },
    enabled: !!orderId && open && showHistory,
    refetchInterval: 10000,
  })

  const editTotal = useMemo(() => {
    if (!orderDetail) return 0
    return orderDetail.items.reduce((sum, item) => {
      const qty = editQuantities[item.id] ?? item.quantity
      return sum + qty * item.price
    }, 0)
  }, [orderDetail, editQuantities])

  useEffect(() => {
    if (orderDetail) {
      setEditRecipient({
        phone: orderDetail.phone || '',
        last_name: orderDetail.last_name || '',
        first_name: orderDetail.first_name || '',
        middle_name: orderDetail.middle_name || '',
        delivery_type: orderDetail.delivery_type || '',
        delivery_city: orderDetail.delivery_city || '',
        delivery_warehouse: orderDetail.delivery_warehouse || '',
        delivery_city_ref: orderDetail.delivery_city_ref || '',
        delivery_settlement_ref: orderDetail.delivery_settlement_ref || '',
        delivery_city_label: orderDetail.delivery_city_label || '',
        delivery_warehouse_ref: orderDetail.delivery_warehouse_ref || '',
        delivery_warehouse_label: orderDetail.delivery_warehouse_label || '',
        delivery_street_ref: orderDetail.delivery_street_ref || '',
        delivery_street_label: orderDetail.delivery_street_label || '',
        delivery_house: orderDetail.delivery_house || '',
        delivery_apartment: orderDetail.delivery_apartment || '',
      })
      if (orderDetail.delivery_city) setCityQuery(orderDetail.delivery_city)
      if (orderDetail.delivery_warehouse)
        setWarehouseQuery(orderDetail.delivery_warehouse)
      if (orderDetail.delivery_street_label)
        setStreetQuery(orderDetail.delivery_street_label)
    }
  }, [orderDetail, setCityQuery, setWarehouseQuery, setStreetQuery])

  const statusMutation = useMutation({
    mutationFn: async ({
      orderId: oid,
      status,
    }: {
      orderId: number
      status: string
    }) => {
      await api.put(`/admin/orders/${oid}/status`, { status })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', orderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', orderId],
      })
      broadcastStatusChange(variables.orderId, variables.status)
      refetchOrderDetail()
      toast.success(t('status_updated'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('error')),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.put(`/admin/orders/${orderId}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', orderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', orderId],
      })
      setEditMode(false)
      setNewItems([])
      refetchOrderDetail()
      toast.success(t('order_updated'))
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const { data } = await api.delete(
        `/admin/orders/${orderId}/items/${itemId}`,
      )
      return data as AdminOrderDetail
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-order-detail', orderId], data)
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', orderId],
      })
      toast.success(t('order_updated'))
    },
    onError: () => toast.error(t('error')),
  })

  const removePromocodeMutation = useMutation({
    mutationFn: async () => {
      const newTotal = orderDetail?.original_total || orderDetail?.total || 0
      await api.put(`/admin/orders/${orderId}`, {
        promocode_code: null,
        discount_amount: 0,
        original_total: null,
        total: newTotal,
      })
    },
    onSuccess: () => {
      toast.success(t('order_updated'))
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', orderId],
      })
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: () => toast.error(t('error')),
  })

  const applyPromo = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post('/loyalty/validate', {
        code,
        phone: editRecipient.phone || undefined,
        items: orderDetail?.items.map((i) => ({
          part_id: i.part_id,
          quantity: editQuantities[i.id] ?? i.quantity,
          price: i.price,
        })),
      })
      return data
    },
    onSuccess: (resp, code) => {
      if (!resp?.valid) {
        toast.error(t('promo_' + promoMessageKey(resp?.message || 'error')))
        return
      }
      setPromoInput('')
      const discount = resp.discount_amount || 0
      const baseTotal = editMode ? editTotal : orderDetail?.total || 0
      updateMutation.mutate({
        promocode_code: code,
        discount_amount: discount,
        original_total: baseTotal,
        total: Math.max(baseTotal - discount, 0),
      })
    },
    onError: () => toast.error(t('promo_error')),
  })

  const addEditItem = (product: OrderSearchProduct) => {
    // Товар уже в заказе — увеличиваем количество существующей позиции
    const existing = orderDetail?.items.find(
      (item) => item.part_id === product.part_id,
    )
    if (existing) {
      setEditQuantities((prev) => ({
        ...prev,
        [existing.id]: (prev[existing.id] ?? existing.quantity) + 1,
      }))
      return
    }
    setNewItems((prev) => {
      const draft = prev.find((item) => item.part_id === product.part_id)
      if (draft) {
        return prev.map((item) =>
          item.part_id === product.part_id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const changeNewItemQuantity = (partId: number, delta: number) => {
    setNewItems((prev) =>
      prev.map((item) =>
        item.part_id === partId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    )
  }

  const cancelEdit = () => {
    setEditMode(false)
    setNewItems([])
    if (orderDetail) {
      setEditRecipient({
        phone: orderDetail.phone || '',
        last_name: orderDetail.last_name || '',
        first_name: orderDetail.first_name || '',
        middle_name: orderDetail.middle_name || '',
        delivery_type: orderDetail.delivery_type || '',
        delivery_city: orderDetail.delivery_city || '',
        delivery_warehouse: orderDetail.delivery_warehouse || '',
        delivery_city_ref: orderDetail.delivery_city_ref || '',
        delivery_settlement_ref: orderDetail.delivery_settlement_ref || '',
        delivery_city_label: orderDetail.delivery_city_label || '',
        delivery_warehouse_ref: orderDetail.delivery_warehouse_ref || '',
        delivery_warehouse_label: orderDetail.delivery_warehouse_label || '',
        delivery_street_ref: orderDetail.delivery_street_ref || '',
        delivery_street_label: orderDetail.delivery_street_label || '',
        delivery_house: orderDetail.delivery_house || '',
        delivery_apartment: orderDetail.delivery_apartment || '',
      })
      if (orderDetail.delivery_city) setCityQuery(orderDetail.delivery_city)
      if (orderDetail.delivery_warehouse)
        setWarehouseQuery(orderDetail.delivery_warehouse)
      if (orderDetail.delivery_street_label)
        setStreetQuery(orderDetail.delivery_street_label)
    }
  }

  const editAddedQuantities = useMemo(() => {
    const map: Record<number, number> = {}
    orderDetail?.items.forEach((item) => {
      map[item.part_id] = editQuantities[item.id] ?? item.quantity
    })
    newItems.forEach((item) => {
      map[item.part_id] = item.quantity
    })
    return map
  }, [orderDetail, editQuantities, newItems])

  const isAdmin = user?.role === 'admin'
  // В финальных статусах заказ правит только администратор
  const canEditOrder =
    isAdmin ||
    !orderDetail ||
    !EDIT_LOCKED_STATUSES.includes(orderDetail.status)

  const enterEditMode = () => {
    if (!orderDetail) return
    if (!canEditOrder) {
      toast.warning(t('edit_locked'))
      return
    }
    setEditMode(true)
    setNewItems([])
    const q: Record<number, number> = {}
    orderDetail.items.forEach((item) => {
      q[item.id] = item.quantity
    })
    setEditQuantities(q)
    toast.info(t('edit_enabled'))
  }

  const handleSave = () => {
    if (!canEditOrder) {
      toast.warning(t('edit_locked'))
      cancelEdit()
      return
    }
    const changes: any = {}
    const itemsChanged = orderDetail?.items.some(
      (item) => editQuantities[item.id] !== item.quantity,
    )
    if (itemsChanged) {
      changes.items = Object.entries(editQuantities).map(([id, qty]) => ({
        id: Number(id),
        quantity: qty,
      }))
    }
    const recipientChanged =
      orderDetail &&
      (editRecipient.phone !== (orderDetail.phone || '') ||
        editRecipient.last_name !== (orderDetail.last_name || '') ||
        editRecipient.first_name !== (orderDetail.first_name || '') ||
        editRecipient.middle_name !== (orderDetail.middle_name || '') ||
        editRecipient.delivery_type !== (orderDetail.delivery_type || '') ||
        editRecipient.delivery_city !== (orderDetail.delivery_city || '') ||
        editRecipient.delivery_warehouse !==
          (orderDetail.delivery_warehouse || '') ||
        editRecipient.delivery_city_ref !==
          (orderDetail.delivery_city_ref || '') ||
        editRecipient.delivery_settlement_ref !==
          (orderDetail.delivery_settlement_ref || '') ||
        editRecipient.delivery_city_label !==
          (orderDetail.delivery_city_label || '') ||
        editRecipient.delivery_warehouse_ref !==
          (orderDetail.delivery_warehouse_ref || '') ||
        editRecipient.delivery_warehouse_label !==
          (orderDetail.delivery_warehouse_label || '') ||
        editRecipient.delivery_street_ref !==
          (orderDetail.delivery_street_ref || '') ||
        editRecipient.delivery_street_label !==
          (orderDetail.delivery_street_label || '') ||
        editRecipient.delivery_house !== (orderDetail.delivery_house || '') ||
        editRecipient.delivery_apartment !==
          (orderDetail.delivery_apartment || ''))
    if (recipientChanged) {
      Object.assign(changes, editRecipient)
    }
    if (newItems.length > 0) {
      changes.add_items = newItems.map((item) => ({
        part_id: item.part_id,
        quantity: item.quantity,
      }))
    }
    if (Object.keys(changes).length === 0) {
      cancelEdit()
      return
    }
    updateMutation.mutate(changes)
  }

  const localeKey = LOCALE_MAP.ru

  if (!orderId && !createMode) return null

  // Значения для правой колонки: в режиме создания считаем по черновику
  const shownPositions = createMode
    ? draftItems.length
    : orderDetail?.items.length || 0
  const shownDiscount = createMode
    ? draftDiscount
    : orderDetail?.discount_amount || 0
  // В редактировании сумму считаем по текущим количествам, вычитая скидку промокода
  const shownTotal = createMode
    ? draftGrandTotal
    : editMode
      ? Math.max(editTotal - shownDiscount, 0)
      : orderDetail?.total || 0

  return (
    <TooltipProvider>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            onOpenChange(false)
            setEditMode(false)
            setShowHistory(false)
          }
        }}
      >
        <DialogContent
          className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
          aria-describedby={undefined}
        >
          {detailLoading && !createMode ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !orderDetail && !createMode ? null : (
            <>
              <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
                {createMode ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <DialogTitle className="text-2xl font-bold tracking-tight">
                        {t('new_order')}
                      </DialogTitle>
                      <AnimatedBadge>
                        <Badge
                          className={`${ORDER_STATUS_LABELS.pending?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                        >
                          {t('order_new')}
                        </Badge>
                      </AnimatedBadge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(new Date().toISOString())}
                    </p>
                  </div>
                ) : !orderDetail ? null : showHistory ? (
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                      {orderDetail.order_number}
                    </DialogTitle>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <DialogTitle className="text-2xl font-bold tracking-tight">
                          {orderDetail.order_number}
                        </DialogTitle>
                        <AnimatedBadge swapKey={orderDetail.status}>
                          <Badge
                            className={`${ORDER_STATUS_LABELS[orderDetail.status]?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t('order_' + orderDetail.status)}
                          </Badge>
                        </AnimatedBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(orderDetail.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={orderDetail.status}
                        onValueChange={(val) => {
                          if (!canEditOrder && val !== orderDetail.status) {
                            toast.warning(t('status_locked'))
                            return
                          }
                          statusMutation.mutate({
                            orderId: orderDetail.id,
                            status: val,
                          })
                        }}
                      >
                        <SelectTrigger className="w-[140px] h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusKeys.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t('order_' + s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(orderDetail.updated_by_name ||
                        orderDetail.updated_by_group === 'system') && (
                        <div className="flex flex-col items-end gap-0.5">
                          {orderDetail.updated_by_group && (
                            <Badge
                              className={`${ROLE_BADGE_COLORS[orderDetail.updated_by_group] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} border-0 text-sm`}
                            >
                              {t(orderDetail.updated_by_group)}
                            </Badge>
                          )}
                          <span className="text-sm font-medium">
                            {orderDetail.updated_by_name || t('system_actor')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogHeader>

              <Separator className="flex-shrink-0" />

              <div
                className={`flex-1 ${showHistory ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'} p-6`}
              >
                {showHistory && !createMode ? (
                  <div className="relative pl-12 space-y-0">
                    <div className="absolute left-[22px] top-2 bottom-2 w-[3px] bg-border" />
                    {!allEvents || allEvents.length === 0 ? (
                      <p className="text-muted-foreground py-8 text-center">
                        —
                      </p>
                    ) : (
                      allEvents.map((ev, idx) => {
                        const isWaybill = ev.type === 'waybill'
                        let dotColor = 'bg-blue-500'
                        if (isWaybill) {
                          if (ev.event_type === 'create')
                            dotColor = 'bg-green-500'
                          else if (ev.event_type === 'delete')
                            dotColor = 'bg-red-500'
                          else if (ev.event_type === 'print')
                            dotColor = 'bg-orange-500'
                          else if (ev.event_type === 'error')
                            dotColor = 'bg-yellow-500'
                          else if (ev.event_type === 'sync')
                            dotColor = 'bg-purple-500'
                          else dotColor = 'bg-blue-500'
                        } else {
                          dotColor = idx === 0 ? 'bg-green-500' : 'bg-blue-500'
                        }
                        let IconComponent = Clock
                        if (isWaybill) {
                          if (ev.event_type === 'create')
                            IconComponent = FilePlus
                          else if (ev.event_type === 'delete')
                            IconComponent = Trash2
                          else if (ev.event_type === 'print')
                            IconComponent = Printer
                          else if (ev.event_type === 'error')
                            IconComponent = AlertTriangle
                          else if (ev.event_type === 'sync')
                            IconComponent = RefreshCw
                          else if (ev.event_type === 'update')
                            IconComponent = Pencil
                        }
                        return (
                          <div
                            key={`${ev.type}-${ev.id}`}
                            className="relative pb-6"
                          >
                            <div
                              className={`absolute -left-[34px] top-1.5 w-5 h-5 rounded-full border-[3px] border-background ${dotColor}`}
                            />
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {ev.user_group && (
                                <Badge
                                  className={`${ROLE_BADGE_COLORS[ev.user_group] || 'bg-orange-500 text-white'} border-0 text-sm`}
                                >
                                  {t(ev.user_group)}
                                </Badge>
                              )}
                              <span className="font-medium">
                                {ev.user_name || t('system_actor')}
                              </span>
                              {!isWaybill && ev.event_type === 'create' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-violet-500 text-white border-0 gap-1 h-6 px-2 text-sm cursor-help">
                                      <Laptop className="w-3.5 h-3.5" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t('order_created_from_admin')}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <span className="text-sm text-muted-foreground">
                                {formatDateTime(ev.created_at, timezone, {
                                  locale: localeKey,
                                  seconds: false,
                                })}
                              </span>
                            </div>
                            <div className="text-muted-foreground pl-1">
                              {!isWaybill &&
                              ev.event_type === 'status_change' ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4 inline" />
                                  {(() => {
                                    const m = ev.details?.match(
                                      /статус:\s*(\w+)\s*→\s*(\w+)/,
                                    )
                                    if (m)
                                      return (
                                        <span>
                                          {t('status_changed')}:{' '}
                                          {t('order_' + m[1])} →{' '}
                                          {t('order_' + m[2])}
                                        </span>
                                      )
                                    return ev.details
                                  })()}
                                </span>
                              ) : isWaybill ? (
                                <span className="flex items-center gap-2">
                                  <IconComponent className="w-4 h-4 inline shrink-0" />
                                  <span>{t('waybill_' + ev.event_type)}</span>
                                  {ev.np_number && (
                                    <Badge
                                      className={`border-0 text-sm font-mono gap-1.5 cursor-pointer ${ev.event_type === 'delete' ? 'bg-red-500 text-white line-through' : ev.event_type === 'create' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}
                                      onClick={() => copyTtn(ev.np_number)}
                                    >
                                      <ScanBarcode className="w-3.5 h-3.5" />
                                      {ev.np_number}
                                    </Badge>
                                  )}
                                </span>
                              ) : (
                                formatPhonesInText(ev.details || ev.event_type)
                                  .replace(
                                    /\b(warehouse|parcel_locker|courier)\b/g,
                                    (m: string) => t(m),
                                  )
                                  .replace(
                                    /\b(cod|monobank|novapay|liqpay)\b/g,
                                    (m: string) => tc(`payment_${m}`),
                                  )
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-[2fr_1fr_1fr] gap-6 h-full min-h-0 grid-rows-[minmax(0,1fr)]">
                    <div className="border rounded-lg p-3 flex flex-col min-h-0">
                      <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                        <Package className="w-5 h-5" /> {t('order_items')}
                        {createMode && draftItems.length > 0 && (
                          <Badge variant="secondary" className="text-sm">
                            {t('items_count_pcs', {
                              count: draftItems.reduce(
                                (sum, item) => sum + item.quantity,
                                0,
                              ),
                            })}
                          </Badge>
                        )}
                      </h4>
                      <div className="space-y-3 flex-1 overflow-y-auto pr-1 mt-3">
                        {createMode ? (
                          draftItems.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center px-6">
                              {t('order_search_items_empty')}
                            </div>
                          ) : (
                            draftItems.map((item) => (
                              <OrderItemCard
                                key={item.part_id}
                                imageUrl={item.image_url}
                                brand={item.brand}
                                article={item.article}
                                sku={item.sku}
                                partName={item.name}
                                supplierName={item.supplier_name}
                                price={item.price || 0}
                                quantity={item.quantity}
                                editable
                                onDecrease={() =>
                                  changeDraftQuantity(item.part_id, -1)
                                }
                                onIncrease={() =>
                                  changeDraftQuantity(item.part_id, 1)
                                }
                                onRemove={() =>
                                  setDraftItems((prev) =>
                                    prev.filter(
                                      (p) => p.part_id !== item.part_id,
                                    ),
                                  )
                                }
                                deleteLabel={t('delete')}
                              />
                            ))
                          )
                        ) : (
                          <>
                            {orderDetail!.items.map((item) => (
                              <OrderItemCard
                                key={item.id}
                                imageUrl={item.image_url}
                                brand={item.brand}
                                article={item.article}
                                sku={item.sku}
                                partName={item.part_name}
                                supplierName={item.supplier_name}
                                price={item.price}
                                quantity={
                                  editQuantities[item.id] ?? item.quantity
                                }
                                editable={editMode}
                                onDecrease={() =>
                                  setEditQuantities((prev) => ({
                                    ...prev,
                                    [item.id]: Math.max(
                                      1,
                                      (prev[item.id] || item.quantity) - 1,
                                    ),
                                  }))
                                }
                                onIncrease={() =>
                                  setEditQuantities((prev) => ({
                                    ...prev,
                                    [item.id]:
                                      (prev[item.id] || item.quantity) + 1,
                                  }))
                                }
                                onRemove={() => {
                                  if (!reqPerm('orders.delete')) return
                                  deleteItemMutation.mutate(item.id)
                                }}
                                removeDisabled={deleteItemMutation.isPending}
                                deleteLabel={t('delete')}
                              />
                            ))}
                            {editMode &&
                              newItems.map((item) => (
                                <OrderItemCard
                                  key={`new-${item.part_id}`}
                                  imageUrl={item.image_url}
                                  brand={item.brand}
                                  article={item.article}
                                  sku={item.sku}
                                  partName={item.name}
                                  supplierName={item.supplier_name}
                                  price={item.price || 0}
                                  quantity={item.quantity}
                                  editable
                                  pending
                                  onDecrease={() =>
                                    changeNewItemQuantity(item.part_id, -1)
                                  }
                                  onIncrease={() =>
                                    changeNewItemQuantity(item.part_id, 1)
                                  }
                                  onRemove={() =>
                                    setNewItems((prev) =>
                                      prev.filter(
                                        (p) => p.part_id !== item.part_id,
                                      ),
                                    )
                                  }
                                  deleteLabel={t('delete')}
                                />
                              ))}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 flex flex-col h-full">
                      <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                        <User className="w-5 h-5" /> {t('recipient_data')}
                        {orderDetail && (
                          <AnimatedSuccessBadge
                            value={orderDetail.user_success_index}
                            totalOrders={orderDetail.user_total_orders}
                          />
                        )}
                      </h4>
                      <div className="flex-1 space-y-3 text-sm overflow-y-auto mt-3 px-1">
                        <div className="grid gap-1">
                          <span className="text-muted-foreground text-sm">
                            {t('phone_label')}
                            {createMode && ' *'}
                          </span>
                          {editable ? (
                            <PhoneInput
                              value={editRecipient.phone || ''}
                              onChange={(v) =>
                                setEditRecipient((p) => ({ ...p, phone: v }))
                              }
                              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          ) : (
                            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                              <span
                                className={
                                  orderDetail!.phone
                                    ? 'truncate'
                                    : 'truncate text-muted-foreground'
                                }
                              >
                                {formatPhone(orderDetail!.phone) || '—'}
                              </span>
                            </div>
                          )}
                        </div>
                        {['last_name', 'first_name', 'middle_name'].map(
                          (field) => (
                            <div key={field} className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t(field)}
                                {createMode && field !== 'middle_name' && ' *'}
                              </span>
                              {editable ? (
                                <Input
                                  className="h-10 w-full text-sm"
                                  value={editRecipient[field] || ''}
                                  maxLength={100}
                                  onChange={(e) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      [field]: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span
                                    className={
                                      (orderDetail as any)[field]
                                        ? 'truncate'
                                        : 'truncate text-muted-foreground'
                                    }
                                  >
                                    {(orderDetail as any)[field] || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                        <Separator />
                        <h5 className="font-semibold text-sm flex items-center gap-2">
                          <MapPin className="w-4 h-4" /> {t('delivery_info')}
                        </h5>
                        <RadioGroup
                          value={editRecipient.delivery_type || ''}
                          onValueChange={(v) =>
                            setEditRecipient((p) => ({
                              ...p,
                              delivery_type: v,
                              delivery_warehouse: '',
                              delivery_warehouse_ref: '',
                              delivery_warehouse_label: '',
                              delivery_street_ref: '',
                              delivery_street_label: '',
                              delivery_house: '',
                              delivery_apartment: '',
                            }))
                          }
                          disabled={!editable}
                          className="grid grid-cols-3 gap-2"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer opacity-50">
                                <RadioGroupItem
                                  value="pickup"
                                  id="dpickup"
                                  className="cursor-pointer"
                                  disabled
                                />
                                <Label
                                  htmlFor="dpickup"
                                  className="cursor-pointer"
                                >
                                  <Package className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('pickup')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                                <RadioGroupItem
                                  value="warehouse"
                                  id="dw"
                                  className="cursor-pointer"
                                />
                                <Label htmlFor="dw" className="cursor-pointer">
                                  <Building2 className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('warehouse')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                                <RadioGroupItem
                                  value="courier"
                                  id="dc"
                                  className="cursor-pointer"
                                />
                                <Label htmlFor="dc" className="cursor-pointer">
                                  <Truck className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('courier')}</TooltipContent>
                          </Tooltip>
                        </RadioGroup>
                        {(deliveryType || !editable) && (
                          <div className="grid gap-1">
                            <span className="text-muted-foreground text-sm">
                              {t('city')}
                            </span>
                            {editable ? (
                              <SearchableSelect<any>
                                items={settlements}
                                isLoading={citiesLoading}
                                value={editRecipient.delivery_city || ''}
                                onChange={(item) =>
                                  setEditRecipient((p) => ({
                                    ...p,
                                    delivery_city: item.label,
                                    delivery_city_ref:
                                      item.delivery_city_ref || item.ref,
                                    delivery_settlement_ref:
                                      item.settlement_ref || '',
                                    delivery_city_label: item.label,
                                    delivery_warehouse: '',
                                    delivery_warehouse_ref: '',
                                    delivery_warehouse_label: '',
                                    delivery_street_ref: '',
                                    delivery_street_label: '',
                                    delivery_house: '',
                                    delivery_apartment: '',
                                  }))
                                }
                                searchQuery={cityQuery}
                                onSearchChange={setCityQuery}
                                getKey={(item: any) => item.ref}
                                getLabel={(item: any) => item.label}
                                renderItem={(item: any) => (
                                  <SettlementItem item={item} />
                                )}
                                dropdownInPopover
                                placeholder={t('city')}
                                minSearchLength={2}
                                noResultsMessage={t('novaposhta_no_results')}
                                typeToSearchMessage={t(
                                  'novaposhta_type_to_search',
                                )}
                                hideSearchIcon
                              />
                            ) : (
                              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                <span
                                  className={
                                    orderDetail!.delivery_city
                                      ? 'truncate'
                                      : 'truncate text-muted-foreground'
                                  }
                                >
                                  {orderDetail!.delivery_city || '—'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {deliveryType === 'warehouse' && (
                          <div className="grid gap-1">
                            <span className="text-muted-foreground text-sm">
                              {t('warehouse')}
                            </span>
                            {editable ? (
                              <SearchableSelect<any>
                                items={warehouses}
                                isLoading={warehousesLoading}
                                value={editRecipient.delivery_warehouse || ''}
                                onChange={(item) =>
                                  setEditRecipient((p) => ({
                                    ...p,
                                    delivery_warehouse: item.label,
                                    delivery_warehouse_ref: item.ref,
                                    delivery_warehouse_label: item.label,
                                  }))
                                }
                                searchQuery={warehouseQuery}
                                onSearchChange={setWarehouseQuery}
                                getKey={(item: any) => item.ref}
                                getLabel={(item: any) => item.label}
                                renderItem={(item: any) => (
                                  <WarehouseDropdownItem
                                    item={item}
                                    postomatLabel={t('novaposhta_postomat')}
                                  />
                                )}
                                placeholder={t('warehouse')}
                                minSearchLength={1}
                                noResultsMessage={t('novaposhta_no_results')}
                                typeToSearchMessage={t(
                                  'novaposhta_type_to_search',
                                )}
                                dropdownInPopover
                                hideSearchIcon
                              />
                            ) : (
                              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                <span
                                  className={
                                    orderDetail!.delivery_warehouse
                                      ? 'truncate'
                                      : 'truncate text-muted-foreground'
                                  }
                                >
                                  {orderDetail!.delivery_warehouse || '—'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {deliveryType === 'courier' && (
                          <>
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('street')}
                              </span>
                              {editable ? (
                                <SearchableSelect<any>
                                  items={streets}
                                  isLoading={streetsLoading}
                                  value={
                                    editRecipient.delivery_street_label || ''
                                  }
                                  onChange={(item) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      delivery_street_ref: item.street_ref,
                                      delivery_street_label: item.label,
                                    }))
                                  }
                                  searchQuery={streetQuery}
                                  onSearchChange={setStreetQuery}
                                  getKey={(item: any) => item.street_ref}
                                  getLabel={(item: any) => item.label}
                                  renderItem={(item: any) => (
                                    <div className="font-medium leading-tight">
                                      {item.street_type &&
                                      item.label &&
                                      !item.label.startsWith(item.street_type)
                                        ? `${item.street_type}. ${item.label}`
                                        : item.label}
                                    </div>
                                  )}
                                  placeholder={t('street')}
                                  minSearchLength={2}
                                  noResultsMessage={t('novaposhta_no_results')}
                                  typeToSearchMessage={t(
                                    'novaposhta_type_to_search',
                                  )}
                                  dropdownInPopover
                                  hideSearchIcon
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span
                                    className={
                                      orderDetail!.delivery_street_label
                                        ? 'truncate'
                                        : 'truncate text-muted-foreground'
                                    }
                                  >
                                    {orderDetail!.delivery_street_label || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="grid gap-1">
                                <span className="text-muted-foreground text-sm">
                                  {t('house')}
                                </span>
                                {editable ? (
                                  <Input
                                    className="h-10 w-full text-sm"
                                    value={editRecipient.delivery_house || ''}
                                    maxLength={20}
                                    onChange={(e) =>
                                      setEditRecipient((p) => ({
                                        ...p,
                                        delivery_house: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm h-10">
                                    {orderDetail!.delivery_house || '—'}
                                  </div>
                                )}
                              </div>
                              <div className="grid gap-1">
                                <span className="text-muted-foreground text-sm">
                                  {t('apartment')}
                                </span>
                                {editable ? (
                                  <Input
                                    className="h-10 w-full text-sm"
                                    value={
                                      editRecipient.delivery_apartment || ''
                                    }
                                    maxLength={20}
                                    onChange={(e) =>
                                      setEditRecipient((p) => ({
                                        ...p,
                                        delivery_apartment: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm h-10">
                                    {orderDetail!.delivery_apartment || '—'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 flex flex-col h-full">
                      <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                        <ScrollText className="w-5 h-5" /> {t('order_summary')}
                      </h4>
                      <div className="mt-3">
                        <div className="grid gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t('total_items')}
                            </span>
                            <span>
                              {t('items_count_pcs', { count: shownPositions })}
                            </span>
                          </div>
                          {shownDiscount > 0 && (
                            <div className="flex justify-between text-green-600 text-sm">
                              <span>{t('discount_label')}</span>
                              <span className="font-semibold">
                                -{fmt(shownDiscount)} ₴
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t('order_total')}:
                            </span>
                            <span className="font-bold text-lg">
                              {fmt(shownTotal)} ₴
                            </span>
                          </div>
                        </div>
                        <Separator className="my-3" />
                        <div className="flex flex-col gap-2">
                          <h4 className="font-semibold text-lg flex items-center gap-2">
                            <Gift className="w-5 h-5" /> {t('promocode')}
                          </h4>
                          {createMode ? (
                            draftPromo ? (
                              <div className="flex gap-2">
                                <div className="flex items-center flex-1 rounded-lg border bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm gap-2 min-w-0">
                                  <Check className="w-4 h-4 text-green-600 shrink-0" />
                                  <span className="font-mono font-bold tracking-wider text-green-700 dark:text-green-300 truncate">
                                    {draftPromo.code}
                                  </span>
                                  {draftPromo.discount > 0 && (
                                    <span className="text-xs text-green-600 ml-auto shrink-0">
                                      -{fmt(draftPromo.discount)} ₴
                                    </span>
                                  )}
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="icon"
                                      className="h-10 w-10 shrink-0"
                                      onClick={() => setDraftPromo(null)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('remove')}</TooltipContent>
                                </Tooltip>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Input
                                  placeholder={t('promocode_placeholder')}
                                  value={promoInput}
                                  maxLength={10}
                                  onChange={(e) =>
                                    setPromoInput(e.target.value.toUpperCase())
                                  }
                                  className="h-10 text-sm uppercase flex-1"
                                />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-10 w-10 shrink-0"
                                      disabled={
                                        promoInput.length < 10 ||
                                        applyDraftPromo.isPending
                                      }
                                      onClick={() =>
                                        applyDraftPromo.mutate(promoInput)
                                      }
                                    >
                                      {applyDraftPromo.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Gift className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('apply')}</TooltipContent>
                                </Tooltip>
                              </div>
                            )
                          ) : editMode && !orderDetail!.promocode_code ? (
                            <div className="flex gap-2">
                              <Input
                                placeholder={t('promocode_placeholder')}
                                value={promoInput}
                                maxLength={10}
                                onChange={(e) =>
                                  setPromoInput(e.target.value.toUpperCase())
                                }
                                className="h-10 text-sm uppercase flex-1"
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    disabled={promoInput.length < 10}
                                    onClick={() =>
                                      applyPromo.mutate(promoInput)
                                    }
                                  >
                                    <Gift className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('apply')}</TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <div className="flex items-center flex-1 rounded-lg border bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm gap-2">
                                <Check className="w-4 h-4 text-green-600 shrink-0" />
                                <span className="font-mono font-bold tracking-wider text-green-700 dark:text-green-300">
                                  {orderDetail!.promocode_code || '—'}
                                </span>
                                {orderDetail!.discount_amount > 0 && (
                                  <span className="text-xs text-green-600 ml-auto">
                                    -{fmt(orderDetail!.discount_amount)} ₴
                                  </span>
                                )}
                              </div>
                              {editMode && orderDetail!.promocode_code ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="icon"
                                      className="h-10 w-10 shrink-0"
                                      onClick={() =>
                                        removePromocodeMutation.mutate()
                                      }
                                      disabled={
                                        removePromocodeMutation.isPending
                                      }
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('remove')}</TooltipContent>
                                </Tooltip>
                              ) : (
                                <div className="w-10 h-10 shrink-0" />
                              )}
                            </div>
                          )}
                        </div>
                        <Separator className="my-3" />
                        <div className="flex flex-col space-y-3">
                          <h4 className="font-semibold text-lg flex items-center gap-2">
                            <CreditCard className="w-5 h-5" />{' '}
                            {t('payment_method')}
                            {!createMode && (
                              <span className="ml-auto">
                                <PaymentBadge
                                  orderId={orderDetail!.id}
                                  paymentMethod={
                                    orderDetail!.payment_method ?? ''
                                  }
                                  t={t}
                                />
                              </span>
                            )}
                          </h4>
                          {createMode ? (
                            enabledPaymentMethods.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                {t('no_payment_methods')}
                              </p>
                            ) : (
                              <RadioGroup
                                value={paymentMethod}
                                onValueChange={setPaymentMethod}
                                className="grid grid-cols-2 gap-2"
                              >
                                {enabledPaymentMethods.map((method) => (
                                  <Label
                                    key={method.code}
                                    htmlFor={`order-pay-${method.code}`}
                                    className="flex h-10 items-center gap-2 rounded-lg border px-2.5 text-sm has-data-[state=checked]:border-primary cursor-pointer min-w-0"
                                  >
                                    <RadioGroupItem
                                      value={method.code}
                                      id={`order-pay-${method.code}`}
                                      className="cursor-pointer shrink-0"
                                    />
                                    <span className="truncate">
                                      {tc(`payment_${method.code}`)}
                                    </span>
                                  </Label>
                                ))}
                              </RadioGroup>
                            )
                          ) : (
                            orderDetail!.payment_method !== 'cod' &&
                            orderDetail!.payment_method && (
                              <PaymentBlock
                                orderId={orderDetail!.id}
                                paymentMethod={orderDetail!.payment_method}
                              />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator className="flex-shrink-0" />
              <div className="flex-shrink-0 p-4 pt-3">
                {createMode ? (
                  <div className="flex items-center gap-2">
                    <OrderProductSearch
                      onAdd={addDraftItem}
                      addedQuantities={draftQuantities}
                    />
                    <Button
                      variant="outline"
                      className="h-10"
                      onClick={() => onOpenChange(false)}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      className="gap-2 h-10"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {t('create')}
                    </Button>
                  </div>
                ) : showHistory ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowHistory(false)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
                  </Button>
                ) : editMode ? (
                  <div className="flex items-center gap-2">
                    <OrderProductSearch
                      onAdd={addEditItem}
                      addedQuantities={editAddedQuantities}
                    />
                    <Button
                      variant="outline"
                      className="h-10"
                      onClick={cancelEdit}
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      className="gap-2 h-10"
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {t('save')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center w-full">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setShowHistory(true)}
                      >
                        <History className="w-4 h-4" /> {t('order_history')}
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-1.5"
                        onClick={enterEditMode}
                      >
                        <Pencil className="w-4 h-4" /> {t('edit_order')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {orderDetail!.payment_method !== 'cod' &&
                        orderDetail!.payment_method && (
                          <AnimatedBadge swapKey={orderDetail!.payment_method}>
                            <Badge
                              className={paymentBadgeClass(
                                orderDetail!.payment_method,
                              )}
                            >
                              {paymentMethodLabel(orderDetail!.payment_method)}
                            </Badge>
                          </AnimatedBadge>
                        )}
                      <Button
                        variant="outline"
                        className="gap-1.5"
                        onClick={async () => {
                          if (!reqPerm('checkbox.view')) return
                          try {
                            const receipt = await getCheckboxReceipt(
                              orderDetail!.id,
                            )
                            if (receipt?.receipt_url) {
                              window.open(
                                receipt.receipt_url,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            } else if (receipt?.status === 'created') {
                              const link = await getCheckboxReceiptLink(
                                orderDetail!.id,
                              )
                              if (link?.url) {
                                window.open(
                                  link.url,
                                  '_blank',
                                  'noopener,noreferrer',
                                )
                              } else {
                                toast.info(t('receipt_no_link'))
                              }
                            } else if (receipt?.status === 'error') {
                              toast.error(
                                receipt.error_message || t('receipt_error'),
                              )
                            } else {
                              toast.info(t('receipt_pending'))
                            }
                          } catch (err: any) {
                            const msg =
                              err?.response?.data?.detail || err?.message || ''
                            toast.error(msg || t('receipt_error'))
                          }
                        }}
                      >
                        <FileText className="w-4 h-4" /> {t('checkbox_receipt')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

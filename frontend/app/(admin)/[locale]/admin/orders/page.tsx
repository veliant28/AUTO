'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
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
  Warehouse,
  Gift,
  Check,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NpWaybillBadge } from '@/components/ui/NpWaybillBadge'
import { Card, CardContent } from '@/components/ui/card'
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import {
  getReceipt as getCheckboxReceipt,
  getReceiptLink as getCheckboxReceiptLink,
} from '@/lib/api/checkbox'
import PaymentBlock from '../components/PaymentBlock'
import PaymentBadge from '../components/PaymentBadge'
import {
  paymentBadgeClass,
  paymentMethodLabel,
} from '../components/PaymentHelpers'
import { useAuthStore } from '@/store/authStore'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { broadcastStatusChange } from '@/lib/orderSync'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import { PhoneInput } from '@/components/ui/PhoneInput'
import OrderWaybillModal from '../components/OrderWaybillModal'
import OrderDetailModal from '../components/OrderDetailModal'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import OrderWaybillTrackingModal from '../components/OrderWaybillTrackingModal'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

interface AdminOrder {
  id: number
  order_number: string
  user_id: number
  status: string
  total: number
  full_name: string
  phone: string | null
  address: string | null
  created_at: string
  items_count: number
}

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
}

interface OrderChangeLogEntry {
  id: number
  user_name: string | null
  user_group: string | null
  action: string
  details: string | null
  created_at: string
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

const columnHelper = createColumnHelper<AdminOrder>()
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
}

export default function AdminOrdersPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [viewOrderId, setViewOrderId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>(
    {},
  )
  const [editRecipient, setEditRecipient] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  // ── NP online search for delivery section ─────────────────────
  const deliveryCityRef = editRecipient.delivery_city_ref || ''
  const deliveryType = editRecipient.delivery_type || ''
  const settlementRef = editRecipient.delivery_settlement_ref || ''

  const [cityQuery, setCityQuery] = useState('')
  const { data: settlements = [], isFetching: citiesLoading } = useQuery({
    queryKey: ['admin-order-np-cities', cityQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchSettlements({ query: cityQuery })
        .then((r) => r.data as any[]),
    enabled: cityQuery.length >= 2,
    staleTime: 30000,
  })

  const [warehouseQuery, setWarehouseQuery] = useState('')
  const { data: warehouses = [], isFetching: warehousesLoading } = useQuery({
    queryKey: ['admin-order-np-warehouses', deliveryCityRef, warehouseQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchWarehouses({ city_ref: deliveryCityRef, query: warehouseQuery })
        .then((r) => r.data as any[]),
    enabled: !!deliveryCityRef && warehouseQuery.length >= 1,
    staleTime: 30000,
  })

  const [streetQuery, setStreetQuery] = useState('')
  const { data: streets = [], isFetching: streetsLoading } = useQuery({
    queryKey: ['admin-order-np-streets', settlementRef, streetQuery],
    queryFn: () =>
      novaPoshtaApi
        .searchStreets({ settlement_ref: settlementRef, query: streetQuery })
        .then((r) => r.data as any[]),
    enabled: !!settlementRef && streetQuery.length >= 2,
    staleTime: 30000,
  })
  // ───────────────────────────────────────────────────────────────
  const [promoInput, setPromoInput] = useState('')
  const applyPromo = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post('/loyalty/validate', {
        code,
        items:
          orderDetail?.items?.map((i: any) => ({
            part_id: i.part_id,
            price: i.price,
            quantity: editQuantities[i.id] ?? i.quantity,
          })) || [],
      })
      return data
    },
    onSuccess: (data: any) => {
      if (data.valid) {
        updateMutation.mutate({
          promocode_code: promoInput,
          discount_amount: data.discount_amount || 0,
          original_total: orderDetail.total,
          total: Math.max(
            (orderDetail.total || 0) - (data.discount_amount || 0),
            0,
          ),
        })
        toast.success(t('order_updated'))
        setPromoInput('')
      } else {
        toast.info(
          t(
            data.message === 'Promocode not found'
              ? 'promo_not_found'
              : data.message === 'Promocode is inactive'
                ? 'promo_inactive'
                : data.message === 'Promocode expired'
                  ? 'promo_expired'
                  : data.message === 'Promocode already used'
                    ? 'promo_used'
                    : data.message === 'Promocode belongs to another user'
                      ? 'promo_wrong_user'
                      : data.message,
          ),
        )
      }
    },
    onError: () => toast.error(t('promo_error')),
  })

  const localeKey = useMemo(() => {
    try {
      const p = window.location.pathname.match(/^\/(ru|ua|en)/)?.[1]
      return LOCALE_MAP[p || 'ru'] || 'ru-RU'
    } catch {
      return 'ru-RU'
    }
  }, [])
  const [selectedNpOrderId, setSelectedNpOrderId] = useState<number | null>(
    null,
  )
  const [waybillModalOpen, setWaybillModalOpen] = useState(false)
  const [trackingModalOpen, setTrackingModalOpen] = useState(false)

  const handleWaybillOpen = useCallback((orderId: number) => {
    setSelectedNpOrderId(orderId)
    setWaybillModalOpen(true)
    setTrackingModalOpen(false)
  }, [])

  const handleTrackingOpen = useCallback((orderId: number) => {
    setSelectedNpOrderId(orderId)
    setTrackingModalOpen(true)
    setWaybillModalOpen(false)
  }, [])

  const handleWaybillClose = useCallback((open: boolean) => {
    setWaybillModalOpen(open)
    if (!open) {
      setTimeout(() => setSelectedNpOrderId(null), 0)
    }
  }, [])

  const handleTrackingClose = useCallback((open: boolean) => {
    setTrackingModalOpen(open)
    if (!open) {
      setTimeout(() => setSelectedNpOrderId(null), 0)
    }
  }, [])

  const formatDate = (d: string) =>
    new Date(d + 'Z').toLocaleString(localeKey, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, page, search],
    queryFn: async () => {
      const params: any = { page: page + 1, page_size: 20 }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      const { data } = await api.get('/admin/orders', { params })
      return data as {
        items: AdminOrder[]
        total: number
        page: number
        page_size: number
      }
    },
    enabled: !!user && ['admin', 'manager', 'operator'].includes(user.role),
  })

  // ── NP waybill summaries for the TTN column ───────────────────────────────
  const orderIds = data?.items?.map((o) => o.id) ?? []
  const npSummaries = useQueries({
    queries: orderIds.map((id) => ({
      queryKey: ['np-summary', id],
      queryFn: () =>
        novaPoshtaApi.getOrderWaybillSummary(id).then((r) => r.data),
      staleTime: 30000,
    })),
    combine: (results) => results.map((r) => r.data ?? null),
  })

  const {
    data: orderDetail,
    isLoading: detailLoading,
    refetch: refetchOrderDetail,
  } = useQuery({
    queryKey: ['admin-order-detail', viewOrderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${viewOrderId}`)
      return data as AdminOrderDetail
    },
    enabled: !!viewOrderId,
    refetchInterval: 10000,
  })

  const { data: allEvents } = useQuery({
    queryKey: ['admin-order-all-events', viewOrderId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/orders/${viewOrderId}/all-events`)
      return data as UnifiedEvent[]
    },
    enabled: !!viewOrderId && showHistory,
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
      // Sync search queries for SearchableSelect display
      if (orderDetail.delivery_city) setCityQuery(orderDetail.delivery_city)
      if (orderDetail.delivery_warehouse)
        setWarehouseQuery(orderDetail.delivery_warehouse)
      if (orderDetail.delivery_street_label)
        setStreetQuery(orderDetail.delivery_street_label)
    }
  }, [orderDetail])

  const statusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: number
      status: string
    }) => {
      await api.put(`/admin/orders/${orderId}/status`, { status })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', viewOrderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', viewOrderId],
      })
      broadcastStatusChange(variables.orderId, variables.status)
      refetchOrderDetail()
      toast.success(t('status_updated'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.put(`/admin/orders/${viewOrderId}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', viewOrderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', viewOrderId],
      })
      setEditMode(false)
      refetchOrderDetail()
      toast.success(t('order_updated'))
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const { data } = await api.delete(
        `/admin/orders/${viewOrderId}/items/${itemId}`,
      )
      return data as AdminOrderDetail
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-order-detail', viewOrderId], data)
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-order-all-events', viewOrderId],
      })
      toast.success(t('order_updated'))
    },
    onError: () => toast.error(t('error')),
  })

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await api.delete(`/admin/orders/${orderId}`)
    },
    onSuccess: () => {
      toast.success(t('order_deleted'))
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      setDeleteTarget(null)
      setViewOrderId(null)
    },
    onError: () => toast.error(t('error')),
  })

  const removePromocodeMutation = useMutation({
    mutationFn: async () => {
      const newTotal = orderDetail.original_total || orderDetail.total
      await api.put(`/admin/orders/${viewOrderId}`, {
        promocode_code: null,
        discount_amount: 0,
        original_total: null,
        total: newTotal,
      })
    },
    onSuccess: () => {
      toast.success(t('order_updated'))
      queryClient.invalidateQueries({
        queryKey: ['admin-order-detail', viewOrderId],
      })
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: () => toast.error(t('error')),
  })

  const openView = useCallback(
    async (orderId: number) => {
      setEditMode(false)
      setShowHistory(false)
      await queryClient.prefetchQuery({
        queryKey: ['admin-order-detail', orderId],
        queryFn: async () => {
          const { data } = await api.get(`/admin/orders/${orderId}`)
          return data as AdminOrderDetail
        },
      })
      setViewOrderId(orderId)
    },
    [queryClient],
  )

  const enterEditMode = () => {
    if (!orderDetail) return
    setEditMode(true)
    const q: Record<number, number> = {}
    orderDetail.items.forEach((item) => {
      q[item.id] = item.quantity
    })
    setEditQuantities(q)
    toast.info(t('edit_enabled'))
  }

  const handleSave = () => {
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
    if (Object.keys(changes).length === 0) {
      setEditMode(false)
      return
    }
    updateMutation.mutate(changes)
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: t('order_id'),
        size: 80,
        cell: (info) => (
          <span className="font-mono">{info.row.original.order_number}</span>
        ),
      }),
      columnHelper.accessor('full_name', {
        header: t('order_customer'),
      }),
      columnHelper.accessor('phone', {
        header: t('order_phone'),
        size: 180,
        cell: (info) => {
          const phone = info.getValue<string>()
          return <span className="font-mono text-sm">{formatPhone(phone)}</span>
        },
      }),
      columnHelper.accessor('status', {
        header: t('filter_status'),
        cell: (info) => {
          const statusInfo = ORDER_STATUS_LABELS[info.getValue()]
          const className = statusInfo?.className || 'bg-gray-500 text-white'
          return (
            <Badge className={`${className} border-0 text-sm`}>
              {t('order_' + info.getValue())}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('total', {
        header: t('order_total'),
        cell: (info) => `${fmt(info.getValue())} ₴`,
      }),
      columnHelper.accessor('items_count', {
        header: t('order_items'),
        size: 60,
      }),
      columnHelper.accessor('created_at', {
        header: t('order_date'),
        cell: (info) => new Date(info.getValue() + 'Z').toLocaleString(),
      }),
      columnHelper.display({
        id: 'ttn',
        header: t('novaposhta_ttn'),
        size: 180,
        cell: ({ row }) => {
          const idx = orderIds.indexOf(row.original.id)
          const summary = idx >= 0 ? npSummaries[idx] : null
          return summary ? (
            <NpWaybillBadge
              npNumber={summary.np_number}
              exists={summary.exists}
              isDeleted={summary.is_deleted}
            />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => openView(row.original.id)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('view_order')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleWaybillOpen(row.original.id)}
                >
                  <Truck className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('novaposhta_waybill')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  disabled={user?.role !== 'admin'}
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('delete_order')}</TooltipContent>
            </Tooltip>
          </div>
        ),
      }),
    ],
    [t, statusMutation, openView, handleWaybillOpen, setDeleteTarget, user],
  )

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page, pageSize: 20 } },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex: page, pageSize: 20 })
        setPage(newState.pageIndex)
      }
    },
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / 20),
  })

  if (!user || !['admin', 'manager', 'operator'].includes(user.role)) {
    return null
  }

  return (
    <TooltipProvider>
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10"
              placeholder={t('search_users')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
            />
          </div>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => {
              setStatusFilter(v === 'all' ? '' : v)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-[140px] h-10">
              <SelectValue placeholder={t('filter_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter_status')}</SelectItem>
              {statusKeys.map((s) => (
                <SelectItem key={s} value={s}>
                  {t('order_' + s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading && !data ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      {table.getHeaderGroups().map((hg) => (
                        <tr key={hg.id} className="border-b bg-muted/50">
                          {hg.headers.map((header) => (
                            <th
                              key={header.id}
                              className="text-left p-3 font-medium text-muted-foreground"
                              style={{ width: header.getSize() }}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="p-3">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data && data.total > 20 && (
                  <div className="flex items-center justify-between p-3 border-t">
                    <span className="text-sm text-muted-foreground">
                      {page * 20 + 1}–{Math.min((page + 1) * 20, data.total)} of{' '}
                      {data.total}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(page + 1) * 20 >= data.total}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <OrderDetailModal
          orderId={viewOrderId}
          open={!!viewOrderId}
          onOpenChange={(open) => {
            if (!open) {
              setViewOrderId(null)
              setEditMode(false)
              setShowHistory(false)
            }
          }}
        />

        {selectedNpOrderId !== null && waybillModalOpen && (
          <OrderWaybillModal
            key={selectedNpOrderId}
            orderId={selectedNpOrderId}
            open={waybillModalOpen}
            onOpenChange={handleWaybillClose}
            promocodeCode={orderDetail?.promocode_code || null}
          />
        )}
        {selectedNpOrderId !== null && trackingModalOpen && (
          <OrderWaybillTrackingModal
            key={selectedNpOrderId}
            orderId={selectedNpOrderId}
            open={trackingModalOpen}
            onOpenChange={handleTrackingClose}
          />
        )}

        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <DialogTitle>{t('delete_order_title')}</DialogTitle>
                  <DialogDescription>
                    {t('delete_order_confirm')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {deleteTarget && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <strong>{deleteTarget.order_number}</strong>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-muted-foreground">
                    {deleteTarget.full_name}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteOrderMutation.mutate(deleteTarget.id)}
                disabled={deleteOrderMutation.isPending}
                className="gap-2"
              >
                {deleteOrderMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {t('delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

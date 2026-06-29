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
import { useAuthStore } from '@/store/authStore'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { broadcastStatusChange } from '@/lib/orderSync'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import { PhoneInput } from '@/components/ui/PhoneInput'
import OrderWaybillModal from '../components/OrderWaybillModal'
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

        <Dialog
          open={!!viewOrderId}
          onOpenChange={(open) => {
            if (!open) {
              setViewOrderId(null)
              setEditMode(false)
              setShowHistory(false)
            }
          }}
        >
          <DialogContent
            className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
            aria-describedby={undefined}
          >
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !orderDetail ? null : (
              <>
                <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
                  {showHistory ? (
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
                          <Badge
                            className={`${ORDER_STATUS_LABELS[orderDetail.status]?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t('order_' + orderDetail.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(orderDetail.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select
                          value={orderDetail.status}
                          onValueChange={(val) =>
                            statusMutation.mutate({
                              orderId: orderDetail.id,
                              status: val,
                            })
                          }
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
                        {orderDetail.updated_by_name && (
                          <div className="flex flex-col items-end gap-0.5">
                            {orderDetail.updated_by_group && (
                              <Badge
                                className={`${ROLE_BADGE_COLORS[orderDetail.updated_by_group] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} border-0 text-sm`}
                              >
                                {t(orderDetail.updated_by_group)}
                              </Badge>
                            )}
                            <span className="text-sm font-medium">
                              {orderDetail.updated_by_name}
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
                  {showHistory ? (
                    <div className="relative pl-12 space-y-0">
                      <div className="absolute left-[22px] top-2 bottom-2 w-[3px] bg-border" />
                      {!allEvents || allEvents.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center">
                          —
                        </p>
                      ) : (
                        allEvents.map((ev, idx) => {
                          const isWaybill = ev.type === 'waybill'
                          // Dot color
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
                            dotColor =
                              idx === 0 ? 'bg-green-500' : 'bg-blue-500'
                          }
                          // Icon
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
                                <span className="text-sm text-muted-foreground">
                                  {new Date(ev.created_at + 'Z').toLocaleString(
                                    localeKey,
                                    {
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    },
                                  )}
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
                                        className={`border-0 text-sm font-mono gap-1.5 ${
                                          ev.event_type === 'delete'
                                            ? 'bg-red-500 text-white line-through'
                                            : ev.event_type === 'create'
                                              ? 'bg-green-500 text-white'
                                              : 'bg-blue-500 text-white'
                                        }`}
                                      >
                                        <ScanBarcode className="w-3.5 h-3.5" />
                                        {ev.np_number}
                                      </Badge>
                                    )}
                                  </span>
                                ) : (
                                  formatPhonesInText(
                                    ev.details || ev.event_type,
                                  ).replace(
                                    /\b(warehouse|parcel_locker|courier)\b/g,
                                    (m) => t(m),
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
                        </h4>
                        <div className="space-y-3 flex-1 overflow-y-auto pr-1 mt-3">
                          {orderDetail.items.map((item) => {
                            const qty = editQuantities[item.id] ?? item.quantity
                            const itemTotal = qty * item.price
                            return (
                              <div
                                key={item.id}
                                className="flex gap-3 p-3 rounded-lg border bg-card transition-colors"
                              >
                                <div
                                  className={`w-[80px] h-[80px] shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center ${item.image_url ? '' : `bg-gradient-to-br ${getBrandColor(item.brand)}`}`}
                                >
                                  {item.image_url ? (
                                    <img
                                      src={item.image_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-3xl font-bold text-white/40 select-none">
                                      {getBrandInitial(item.brand)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        {item.brand && (
                                          <Badge
                                            variant="secondary"
                                            className="text-sm px-1.5"
                                          >
                                            {item.brand}
                                          </Badge>
                                        )}
                                        <span className="text-sm font-mono text-muted-foreground">
                                          {item.article}
                                        </span>
                                      </div>
                                      <p className="text-sm font-medium line-clamp-2">
                                        {item.part_name}
                                      </p>
                                    </div>
                                    <div className="flex items-center shrink-0 gap-2">
                                      {item.sku && (
                                        <Badge className="bg-blue-500 text-white border-0 text-sm">
                                          {item.sku}
                                        </Badge>
                                      )}
                                      {editMode && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="destructive"
                                              size="icon"
                                              className="shrink-0"
                                              onClick={() =>
                                                deleteItemMutation.mutate(
                                                  item.id,
                                                )
                                              }
                                              disabled={
                                                deleteItemMutation.isPending
                                              }
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom">
                                            {t('delete')}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between pt-1">
                                    {editMode ? (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7 rounded-full"
                                          onClick={() =>
                                            setEditQuantities((prev) => ({
                                              ...prev,
                                              [item.id]: Math.max(
                                                1,
                                                (prev[item.id] ||
                                                  item.quantity) - 1,
                                              ),
                                            }))
                                          }
                                          disabled={
                                            (editQuantities[item.id] ??
                                              item.quantity) <= 1
                                          }
                                        >
                                          <Minus className="w-4 h-4" />
                                        </Button>
                                        <span className="w-8 text-center font-medium tabular-nums">
                                          {qty}
                                        </span>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7 rounded-full"
                                          onClick={() =>
                                            setEditQuantities((prev) => ({
                                              ...prev,
                                              [item.id]:
                                                (prev[item.id] ||
                                                  item.quantity) + 1,
                                            }))
                                          }
                                        >
                                          <Plus className="w-4 h-4" />
                                        </Button>
                                        <span className="text-sm text-muted-foreground ml-1">
                                          × {fmt(item.price)} ₴
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">
                                        {item.quantity} &times;{' '}
                                        {fmt(item.price)} ₴
                                      </span>
                                    )}
                                    <span className="font-semibold text-base">
                                      {fmt(itemTotal)} ₴
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="border rounded-lg p-4 flex flex-col h-full">
                        <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                          <User className="w-5 h-5" /> {t('recipient_data')}
                        </h4>
                        <div className="flex-1 space-y-3 text-sm overflow-y-auto mt-3 px-1">
                          {/* ── Phone ── */}
                          <div className="grid gap-1">
                            <span className="text-muted-foreground text-sm">
                              {t('phone_label')}
                            </span>
                            {editMode ? (
                              <PhoneInput
                                value={editRecipient.phone}
                                onChange={(v) =>
                                  setEditRecipient((p) => ({ ...p, phone: v }))
                                }
                                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            ) : (
                              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                <span
                                  className={
                                    orderDetail.phone
                                      ? 'truncate'
                                      : 'truncate text-muted-foreground'
                                  }
                                >
                                  {formatPhone(orderDetail.phone) || '—'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* ── FIO ── */}
                          {['last_name', 'first_name', 'middle_name'].map(
                            (field) => (
                              <div key={field} className="grid gap-1">
                                <span className="text-muted-foreground text-sm">
                                  {t(field)}
                                </span>
                                {editMode ? (
                                  <Input
                                    className="h-10 w-full text-sm"
                                    value={editRecipient[field]}
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
                                // Reset dependent fields
                                delivery_warehouse: '',
                                delivery_warehouse_ref: '',
                                delivery_warehouse_label: '',
                                delivery_street_ref: '',
                                delivery_street_label: '',
                                delivery_house: '',
                                delivery_apartment: '',
                              }))
                            }
                            disabled={!editMode}
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
                                  <Label
                                    htmlFor="dw"
                                    className="cursor-pointer"
                                  >
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
                                  <Label
                                    htmlFor="dc"
                                    className="cursor-pointer"
                                  >
                                    <Truck className="w-5 h-5" />
                                  </Label>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{t('courier')}</TooltipContent>
                            </Tooltip>
                          </RadioGroup>

                          {/* City */}
                          <div className="grid gap-1">
                            <span className="text-muted-foreground text-sm">
                              {t('city')}
                            </span>
                            {editMode ? (
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
                                  <>
                                    <div className="font-medium leading-tight">
                                      {item.label}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {[item.area, item.region]
                                        .filter(Boolean)
                                        .join(' — ')}
                                      {item.warehouses_count &&
                                      item.warehouses_count !== '0' ? (
                                        <span className="ml-2 inline-flex items-center gap-1">
                                          <Warehouse className="w-3 h-3" />×
                                          {item.warehouses_count}
                                        </span>
                                      ) : null}
                                    </div>
                                  </>
                                )}
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
                                    orderDetail.delivery_city
                                      ? 'truncate'
                                      : 'truncate text-muted-foreground'
                                  }
                                >
                                  {orderDetail.delivery_city || '—'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Warehouse / Postomat */}
                          {deliveryType === 'warehouse' && (
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('warehouse')}
                              </span>
                              {editMode ? (
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
                                  renderItem={(item: any) => {
                                    const isPostomat = item.type === 'Postomat'
                                    return (
                                      <div className="font-medium leading-tight flex items-center gap-2">
                                        {isPostomat ? (
                                          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                            {t('novaposhta_postomat')}
                                          </span>
                                        ) : (
                                          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                            №{item.number}
                                          </span>
                                        )}
                                        <span className="truncate">
                                          {item.label.includes(':')
                                            ? item.label.slice(
                                                0,
                                                item.label.indexOf(':'),
                                              )
                                            : item.label}
                                        </span>
                                      </div>
                                    )
                                  }}
                                  placeholder={t('warehouse')}
                                  minSearchLength={1}
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
                                      orderDetail.delivery_warehouse
                                        ? 'truncate'
                                        : 'truncate text-muted-foreground'
                                    }
                                  >
                                    {orderDetail.delivery_warehouse || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Courier: street + house + apartment */}
                          {deliveryType === 'courier' && (
                            <>
                              <div className="grid gap-1">
                                <span className="text-muted-foreground text-sm">
                                  {t('street')}
                                </span>
                                {editMode ? (
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
                                    noResultsMessage={t(
                                      'novaposhta_no_results',
                                    )}
                                    typeToSearchMessage={t(
                                      'novaposhta_type_to_search',
                                    )}
                                    hideSearchIcon
                                  />
                                ) : (
                                  <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                    <span
                                      className={
                                        orderDetail.delivery_street_label
                                          ? 'truncate'
                                          : 'truncate text-muted-foreground'
                                      }
                                    >
                                      {orderDetail.delivery_street_label || '—'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-1">
                                  <span className="text-muted-foreground text-sm">
                                    {t('house')}
                                  </span>
                                  {editMode ? (
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
                                      {orderDetail.delivery_house || '—'}
                                    </div>
                                  )}
                                </div>
                                <div className="grid gap-1">
                                  <span className="text-muted-foreground text-sm">
                                    {t('apartment')}
                                  </span>
                                  {editMode ? (
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
                                      {orderDetail.delivery_apartment || '—'}
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
                          <ScrollText className="w-5 h-5" />{' '}
                          {t('order_summary')}
                        </h4>
                        <div className="mt-3">
                          <div className="grid gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('total_items')}
                              </span>
                              <span>{orderDetail.items.length} шт.</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('order_total')}:
                              </span>
                              <span className="font-bold text-lg">
                                {fmt(editMode ? editTotal : (orderDetail.original_total || orderDetail.total))}{' '}
                                ₴
                                {orderDetail.discount_amount > 0 && (
                                  <span className="text-sm text-green-600 font-normal ml-1">
                                    (-{fmt(orderDetail.discount_amount)} ₴)
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        {orderDetail.promocode_code && (
                          <>
                            <Separator className="my-3" />
                            <div className="flex flex-col">
                              <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Gift className="w-4 h-4" /> {t('promocode')}
                              </h4>
                              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm mt-2">
                                <div className="font-mono font-bold tracking-wider">{orderDetail.promocode_code}</div>
                                {orderDetail.discount_amount > 0 && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {t('discount_label')}: -{fmt(orderDetail.discount_amount)} ₴
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        <Separator className="my-3" />
                        <div className="flex flex-col">
                          <h4 className="font-semibold text-lg flex items-center gap-2">
                            <CreditCard className="w-5 h-5" />{' '}
                            {t('payment_method')}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {t('payment_placeholder')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="flex-shrink-0" />
                <div className="flex-shrink-0 p-4 pt-3">
                  {showHistory ? (
                    <Button
                      variant="outline"
                      onClick={() => setShowHistory(false)}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      {t('back')}
                    </Button>
                  ) : editMode ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditMode(false)
                        }}
                      >
                        {t('cancel')}
                      </Button>
                      <Button
                        className="gap-2"
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
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {selectedNpOrderId !== null && waybillModalOpen && (
          <OrderWaybillModal
            key={selectedNpOrderId}
            orderId={selectedNpOrderId}
            open={waybillModalOpen}
            onOpenChange={handleWaybillClose}
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

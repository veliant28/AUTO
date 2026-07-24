'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  Loader2,
  Package,
  Clock,
  RotateCcw,
  ArrowLeft,
  Save,
  X,
  Plus,
  Minus,
  Trash2,
  Pencil,
  User,
  MapPin,
  Building2,
  Container,
  Truck,
  AlertTriangle,
  ScrollText,
  ScanBarcode,
  ScanLine,
  CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { PhoneInput } from '@/components/ui/PhoneInput'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { RETURN_STATUS_LABELS } from '@/lib/constants'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

interface AdminReturnItem {
  id: number
  part_id: number
  article: string
  part_name: string
  brand: string | null
  sku: string | null
  quantity: number
  max_quantity: number
  price: number
  total: number
}

interface AdminReturn {
  id: number
  return_number: string
  order_id: number
  order_number: string
  user_id: number
  user_name: string
  user_last_name: string | null
  user_first_name: string | null
  phone: string | null
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  delivery_type: string | null
  delivery_city: string | null
  delivery_warehouse: string | null
  sender_name: string | null
  sender_city_label: string | null
  sender_address_label: string | null
  ttn_number: string | null
  status: string
  total_refund: number
  items_count: number
  created_at: string
}

interface AdminReturnDetail {
  id: number
  return_number: string
  order_id: number
  order_number: string
  user_id: number
  user_name: string
  user_last_name: string | null
  user_first_name: string | null
  phone: string | null
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  delivery_type: string | null
  delivery_city: string | null
  delivery_warehouse: string | null
  sender_name: string | null
  sender_city_label: string | null
  sender_address_label: string | null
  return_phone: string | null
  return_last_name: string | null
  return_first_name: string | null
  return_middle_name: string | null
  return_delivery_city: string | null
  return_delivery_warehouse: string | null
  ttn_number: string | null
  status: string
  total_refund: number
  admin_notes: string | null
  created_at: string
  updated_at: string | null
  approved_at: string | null
  completed_at: string | null
  approved_by_user_id: number | null
  approved_by_name: string | null
  updated_by_name: string | null
  updated_by_group: string | null
  change_logs: {
    id: number
    user_name: string | null
    user_group: string | null
    action: string
    details: string | null
    created_at: string
  }[]
  items: AdminReturnItem[]
}

const columnHelper = createColumnHelper<AdminReturn>()
const statusKeys = ['pending', 'approved', 'rejected', 'completed']

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone
  const d = digits.slice(-10)
  return `+38 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`
}

export default function AdminReturnsPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [viewReturnId, setViewReturnId] = useState<number | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>(
    {},
  )
  const [editRecipient, setEditRecipient] = useState<Record<string, string>>({})
  const [editCard, setEditCard] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminReturn | null>(null)

  const localeKey = useMemo(() => {
    try {
      const p = window.location.pathname.match(/^\/(ru|ua|en)/)?.[1]
      return LOCALE_MAP[p || 'ru'] || 'ru-RU'
    } catch {
      return 'ru-RU'
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
    queryKey: ['admin-returns', statusFilter, page, search],
    queryFn: async () => {
      const params: any = { page: page + 1, page_size: 20 }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      const { data } = await api.get('/admin/returns', { params })
      return data as {
        items: AdminReturn[]
        total: number
        page: number
        page_size: number
      }
    },
    enabled: !!user && ['admin', 'manager', 'operator'].includes(user.role),
  })

  const {
    data: returnDetail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['admin-return-detail', viewReturnId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/returns/${viewReturnId}`)
      return data as AdminReturnDetail
    },
    enabled: !!viewReturnId,
    refetchInterval: 10000,
  })

  useEffect(() => {
    if (returnDetail) {
      setAdminNotes(returnDetail.admin_notes || '')
      setEditRecipient({
        phone: returnDetail.return_phone || returnDetail.phone || '',
        full_name:
          [
            returnDetail.return_last_name,
            returnDetail.return_first_name,
            returnDetail.return_middle_name,
          ]
            .filter(Boolean)
            .join(' ') ||
          returnDetail.sender_name ||
          '',
        delivery_city:
          returnDetail.return_delivery_city ||
          returnDetail.sender_city_label ||
          '',
        delivery_warehouse:
          returnDetail.return_delivery_warehouse ||
          returnDetail.sender_address_label ||
          '',
      })
    }
  }, [returnDetail])

  const statusMutation = useMutation({
    mutationFn: async ({
      returnId,
      status,
    }: {
      returnId: number
      status: string
    }) => {
      await api.put(`/admin/returns/${returnId}/status`, { status })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-returns'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-return-detail', viewReturnId],
      })
      // Broadcast status change to store
      try {
        new BroadcastChannel('return-status').postMessage({
          returnId: viewReturnId,
        })
      } catch {}
      refetchDetail()
      toast.success(t('return_status_changed'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ returnId, data }: { returnId: number; data: any }) => {
      await api.put(`/admin/returns/${returnId}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-returns'] })
      queryClient.invalidateQueries({
        queryKey: ['admin-return-detail', viewReturnId],
      })
      try {
        new BroadcastChannel('return-status').postMessage({
          returnId: viewReturnId,
        })
      } catch {}
      refetchDetail()
      setEditMode(false)
      toast.success(t('saved'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (returnId: number) => {
      await api.delete(`/admin/returns/${returnId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-returns'] })
      setDeleteTarget(null)
      toast.success(t('delete_success'))
    },
  })

  const openView = useCallback(
    async (returnId: number) => {
      setEditMode(false)
      setShowHistory(false)
      await queryClient.prefetchQuery({
        queryKey: ['admin-return-detail', returnId],
        queryFn: async () => {
          const { data } = await api.get(`/admin/returns/${returnId}`)
          return data as AdminReturnDetail
        },
      })
      setViewReturnId(returnId)
    },
    [queryClient],
  )

  const handleSaveNotes = () => {
    if (!viewReturnId) return
    updateMutation.mutate({
      returnId: viewReturnId,
      data: { admin_notes: adminNotes },
    })
  }

  const editTotal = useMemo(() => {
    if (!returnDetail) return 0
    return returnDetail.items.reduce((sum, item) => {
      const qty = editQuantities[item.id] ?? item.quantity
      return sum + qty * item.price
    }, 0)
  }, [returnDetail, editQuantities])

  function maskCard(card: string | null | undefined): string {
    if (!card) return '—'
    const digits = card.replace(/\s/g, '')
    if (digits.length < 8) return digits
    return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`
  }

  const handleCardChange = (value: string) => {
    setEditCard(value.replace(/\D/g, '').slice(0, 16))
  }

  const enterEditMode = () => {
    if (!returnDetail) return
    setEditMode(true)
    setShowHistory(false)
    const q: Record<number, number> = {}
    returnDetail.items.forEach((item) => {
      q[item.id] = item.quantity
    })
    setEditQuantities(q)
    setEditCard(returnDetail.bank_card || '')
  }

  const historyEvents = useMemo(() => {
    if (!returnDetail) return []
    const events: {
      id: string
      type: string
      user_name?: string
      user_group?: string
      details: string
      created_at: string
    }[] = []

    // Creation event
    events.push({
      id: 'created',
      type: 'creation',
      details: 'Запрос на возврат создан',
      created_at: returnDetail.created_at,
    })

    // Events from change_logs (status changes, edits)
    if (returnDetail.change_logs) {
      for (const log of returnDetail.change_logs) {
        let eventType = log.action
        let details = log.details || log.action
        if (log.action === 'status_change') {
          eventType = 'status_change'
        } else if (log.action === 'edit') {
          eventType = 'edit'
        }
        events.push({
          id: `log-${log.id}`,
          type: eventType,
          user_name: log.user_name || undefined,
          user_group: log.user_group || undefined,
          details: details,
          created_at: log.created_at,
        })
      }
    }

    // Sort by created_at descending
    events.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    return events
  }, [returnDetail])

  const handleSaveItems = () => {
    if (!viewReturnId || !returnDetail) return
    const payload: any = {}
    const itemsChanged = returnDetail.items.some(
      (item) => (editQuantities[item.id] ?? item.quantity) !== item.quantity,
    )
    if (itemsChanged) {
      const itemsMap = new Map(
        Object.entries(editQuantities).map(([id, qty]) => [Number(id), qty]),
      )
      returnDetail.items.forEach((item) => {
        if (!itemsMap.has(item.id)) {
          itemsMap.set(item.id, 0)
        }
      })
      payload.items = Array.from(itemsMap.entries()).map(([id, qty]) => ({
        id,
        quantity: qty,
      }))
    }
    const currentFullName =
      [
        returnDetail.return_last_name,
        returnDetail.return_first_name,
        returnDetail.return_middle_name,
      ]
        .filter(Boolean)
        .join(' ') ||
      returnDetail.sender_name ||
      ''
    const recipientChanged =
      returnDetail &&
      (editRecipient.full_name !== currentFullName ||
        editRecipient.phone !==
          (returnDetail.return_phone || returnDetail.phone || '') ||
        editRecipient.delivery_city !==
          (returnDetail.return_delivery_city ||
            returnDetail.sender_city_label ||
            '') ||
        editRecipient.delivery_warehouse !==
          (returnDetail.return_delivery_warehouse ||
            returnDetail.sender_address_label ||
            ''))
    if (recipientChanged) {
      const nameParts = (editRecipient.full_name || '').trim().split(/\s+/)
      if (nameParts.length < 2) {
        toast.info('Введите минимум фамилию и имя (2 слова)')
        return
      }
      payload.last_name = nameParts[0]
      payload.first_name = nameParts[1] || ''
      payload.middle_name = nameParts.slice(2).join(' ') || ''
      payload.phone = editRecipient.phone
      payload.delivery_city = editRecipient.delivery_city
      payload.delivery_warehouse = editRecipient.delivery_warehouse
    }
    // Card changed
    const cardChanged =
      editCard.replace(/\s/g, '') !==
      (returnDetail.bank_card || '').replace(/\s/g, '')
    if (cardChanged && editCard.replace(/\s/g, '').length >= 16) {
      payload.bank_card = editCard.replace(/\s/g, '')
    }
    if (Object.keys(payload).length) {
      updateMutation.mutate({ returnId: viewReturnId, data: payload })
    } else {
      toast.info('Нет изменений')
      setEditMode(false)
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('return_number', {
        header: t('return_number') || 'Return #',
        size: 160,
        cell: (info) => (
          <span className="font-mono font-bold">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('order_number', {
        header: t('order_number') || 'Order #',
        size: 160,
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
      }),
      columnHelper.accessor('user_name', {
        header: t('order_customer'),
        cell: (info) => {
          const row = info.row.original
          const parts: string[] = []
          if (row.user_last_name) parts.push(row.user_last_name)
          if (row.user_first_name) parts.push(row.user_first_name)
          return <span>{parts.join(' ') || row.user_name}</span>
        },
      }),
      columnHelper.accessor('phone', {
        header: t('order_phone'),
        size: 180,
        cell: (info) => {
          const phone = info.getValue<string | null>()
          return <span className="font-mono text-sm">{formatPhone(phone)}</span>
        },
      }),
      columnHelper.accessor('status', {
        header: t('filter_status'),
        cell: (info) => {
          const statusInfo = RETURN_STATUS_LABELS[info.getValue()]
          const className = statusInfo?.className || 'bg-gray-500 text-white'
          return (
            <Badge className={`${className} border-0 text-sm`}>
              {t('return_' + info.getValue())}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('total_refund', {
        header: t('return_total') || 'Refund',
        cell: (info) => `${fmt(info.getValue())} ₴`,
      }),
      columnHelper.accessor('created_at', {
        header: t('order_date'),
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor('ttn_number', {
        header: 'ТТН',
        size: 180,
        cell: (info) => {
          const ttn = info.getValue<string | null>()
          if (ttn) {
            const formatted = ttn.replace(
              /(\d{2})(\d{4})(\d{4})(\d{4})/,
              '$1 $2 $3 $4',
            )
            return (
              <Badge className="bg-green-500 text-white border-0 text-sm font-mono gap-1.5">
                <ScanBarcode className="w-3.5 h-3.5" />
                {formatted}
              </Badge>
            )
          }
          return (
            <Badge className="bg-gray-500 text-white border-0 text-sm font-mono gap-1.5">
              <ScanLine className="w-3.5 h-3.5" />
              XX XXXX XXXX XXXX
            </Badge>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 80,
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
              <TooltipContent>{t('return_view')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('delete')}</TooltipContent>
            </Tooltip>
          </div>
        ),
      }),
    ],
    [t, openView],
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

  const currentStatus = returnDetail?.status || ''

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
                  {t('return_' + s)}
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

        {/* Detail Dialog */}
        <Dialog
          open={!!viewReturnId}
          onOpenChange={(open) => {
            if (!open) {
              setViewReturnId(null)
              setShowHistory(false)
              setEditMode(false)
            }
          }}
        >
          <DialogContent
            className="w-[90vw] max-w-[1400px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
            aria-describedby={undefined}
          >
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !returnDetail ? null : (
              <>
                <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
                  {showHistory ? (
                    <div className="flex items-center gap-3">
                      <DialogTitle className="text-2xl font-bold tracking-tight">
                        {returnDetail.return_number}
                      </DialogTitle>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <DialogTitle className="text-2xl font-bold tracking-tight">
                            {returnDetail.return_number}
                          </DialogTitle>
                          <Badge
                            className={`${RETURN_STATUS_LABELS[returnDetail.status]?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t('return_' + returnDetail.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t('return_of_order')}: {returnDetail.order_number}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select
                          value={returnDetail.status}
                          onValueChange={(val) =>
                            statusMutation.mutate({
                              returnId: returnDetail.id,
                              status: val,
                            })
                          }
                        >
                          <SelectTrigger className="w-[160px] h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusKeys.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t('return_' + s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {returnDetail.updated_by_name && (
                          <div className="flex flex-col items-end gap-0.5">
                            {returnDetail.updated_by_group && (
                              <Badge
                                className={`${ROLE_BADGE_COLORS[returnDetail.updated_by_group] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} border-0 text-sm`}
                              >
                                {t(returnDetail.updated_by_group)}
                              </Badge>
                            )}
                            <span className="text-sm font-medium">
                              {returnDetail.updated_by_name}
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
                      {historyEvents.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center">
                          —
                        </p>
                      ) : (
                        historyEvents.map((ev, idx) => {
                          let dotColor = 'bg-blue-500'
                          let IconComponent = Clock
                          if (ev.type === 'creation') {
                            dotColor = 'bg-green-500'
                            IconComponent = RotateCcw
                          } else if (ev.type === 'approval') {
                            dotColor = 'bg-green-500'
                            IconComponent = Clock
                          } else if (ev.type === 'completion') {
                            dotColor = 'bg-blue-500'
                            IconComponent = Clock
                          } else if (ev.type === 'rejection') {
                            dotColor = 'bg-red-500'
                            IconComponent = Clock
                          } else if (ev.type === 'status_change') {
                            dotColor = 'bg-yellow-500'
                            IconComponent = Clock
                          } else if (ev.type === 'edit') {
                            dotColor = 'bg-blue-500'
                            IconComponent = Pencil
                          } else if (ev.type === 'ttn_update') {
                            dotColor = 'bg-green-500'
                            IconComponent = ScanBarcode
                          } else if (ev.type === 'card_update') {
                            dotColor = 'bg-purple-500'
                            IconComponent = CreditCard
                          } else if (ev.type === 'deleted') {
                            dotColor = 'bg-red-500'
                            IconComponent = Trash2
                          }
                          return (
                            <div key={ev.id} className="relative pb-6">
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
                                  {formatDate(ev.created_at)}
                                </span>
                              </div>
                              <div className="text-muted-foreground pl-1">
                                <span className="flex items-center gap-1">
                                  <IconComponent className="w-4 h-4 inline" />
                                  {(() => {
                                    if (
                                      ev.type === 'status_change' &&
                                      ev.details
                                    ) {
                                      const m = ev.details.match(
                                        /статус:\s*(\w+)\s*→\s*(\w+)/,
                                      )
                                      if (m)
                                        return (
                                          <>
                                            {t('status_changed')}:{' '}
                                            {t('return_' + m[1])} →{' '}
                                            {t('return_' + m[2])}
                                          </>
                                        )
                                    }
                                    if (
                                      ev.type === 'ttn_update' &&
                                      ev.details
                                    ) {
                                      const m = ev.details.match(
                                        /ТТН (?:оновлено|обновлен):\s*(\d+)/,
                                      )
                                      if (m)
                                        return (
                                          <>
                                            {t('ttn_updated')}: {m[1]}
                                          </>
                                        )
                                    }
                                    if (ev.type === 'card_update') {
                                      const m = ev.details.match(
                                        /номер карты[^:]*:\s*(.+)$/,
                                      )
                                      if (m)
                                        return (
                                          <>
                                            {t('return_card_updated')}: {m[1]}
                                          </>
                                        )
                                    }
                                    return <>{ev.details}</>
                                  })()}
                                </span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-[2fr_1fr] gap-6 h-full min-h-0 grid-rows-[minmax(0,1fr)]">
                      <div className="border rounded-lg p-3 flex flex-col min-h-0">
                        <h4 className="font-semibold text-lg flex items-center gap-2 mb-3 flex-shrink-0">
                          <Package className="w-5 h-5" />{' '}
                          {t('return_items') || 'Return items'}
                        </h4>
                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                          {returnDetail.items
                            .filter((item) => {
                              if (!editMode) return true
                              return (
                                (editQuantities[item.id] ?? item.quantity) > 0
                              )
                            })
                            .map((item) => {
                              const qty =
                                editQuantities[item.id] ?? item.quantity
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
                                                onClick={() => {
                                                  toast.info(
                                                    'Товар удалён из возврата',
                                                  )
                                                  setEditQuantities((prev) => ({
                                                    ...prev,
                                                    [item.id]: 0,
                                                  }))
                                                }}
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
                                            onClick={() => {
                                              const prev =
                                                editQuantities[item.id] ??
                                                item.quantity
                                              if (prev > 1)
                                                toast.info(
                                                  'Количество уменьшено',
                                                )
                                              setEditQuantities((p) => ({
                                                ...p,
                                                [item.id]: Math.max(
                                                  1,
                                                  (p[item.id] ??
                                                    item.quantity) - 1,
                                                ),
                                              }))
                                            }}
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
                                            onClick={() => {
                                              const prev =
                                                editQuantities[item.id] ??
                                                item.quantity
                                              if (prev < item.max_quantity)
                                                toast.info(
                                                  'Количество увеличено',
                                                )
                                              setEditQuantities((p) => ({
                                                ...p,
                                                [item.id]:
                                                  (p[item.id] ??
                                                    item.quantity) + 1,
                                              }))
                                            }}
                                            disabled={
                                              item.max_quantity <=
                                              (editQuantities[item.id] ??
                                                item.quantity)
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

                      {/* Right: Summary + Recipient data */}
                      <div className="flex flex-col gap-4 min-h-0">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                            <ScrollText className="w-5 h-5" />{' '}
                            {t('order_summary')}
                          </h4>
                          <div className="mt-3 grid gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('total_items')}
                              </span>
                              <span>
                                {editMode
                                  ? Object.values(editQuantities).reduce(
                                      (s, q) => s + q,
                                      0,
                                    )
                                  : returnDetail.items.reduce(
                                      (s: number, i: AdminReturnItem) =>
                                        s + i.quantity,
                                      0,
                                    )}{' '}
                                шт.
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('return_total')}:
                              </span>
                              <span className="font-bold text-lg">
                                {fmt(
                                  editMode
                                    ? editTotal
                                    : returnDetail.total_refund,
                                )}{' '}
                                ₴
                              </span>
                            </div>
                            {/* Bank card */}
                            <div className="flex justify-between items-center pt-1 border-t border-border/50">
                              <span className="text-muted-foreground">
                                {t('return_card')}:
                              </span>
                              <span className="font-mono text-sm">
                                {editMode ? (
                                  <InputOTP
                                    maxLength={16}
                                    value={editCard}
                                    onChange={handleCardChange}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                  >
                                    <InputOTPGroup>
                                      <InputOTPSlot index={0} />
                                      <InputOTPSlot index={1} />
                                      <InputOTPSlot index={2} />
                                      <InputOTPSlot index={3} />
                                    </InputOTPGroup>
                                    <InputOTPSeparator />
                                    <InputOTPGroup>
                                      <InputOTPSlot index={4} />
                                      <InputOTPSlot index={5} />
                                      <InputOTPSlot index={6} />
                                      <InputOTPSlot index={7} />
                                    </InputOTPGroup>
                                    <InputOTPSeparator />
                                    <InputOTPGroup>
                                      <InputOTPSlot index={8} />
                                      <InputOTPSlot index={9} />
                                      <InputOTPSlot index={10} />
                                      <InputOTPSlot index={11} />
                                    </InputOTPGroup>
                                    <InputOTPSeparator />
                                    <InputOTPGroup>
                                      <InputOTPSlot index={12} />
                                      <InputOTPSlot index={13} />
                                      <InputOTPSlot index={14} />
                                      <InputOTPSlot index={15} />
                                    </InputOTPGroup>
                                  </InputOTP>
                                ) : (
                                  maskCard(returnDetail.bank_card)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded-lg p-4 flex-1 flex flex-col min-h-0">
                          <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                            <User className="w-5 h-5" /> {t('recipient_data')}
                          </h4>
                          <div className="space-y-3 text-sm mt-3 flex-1 overflow-y-auto px-1">
                            {/* Phone */}
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('phone_label')}
                              </span>
                              {editMode ? (
                                <PhoneInput
                                  value={editRecipient.phone}
                                  onChange={(v) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      phone: v,
                                    }))
                                  }
                                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span className="truncate">
                                    {formatPhone(
                                      returnDetail.return_phone ||
                                        returnDetail.phone,
                                    ) || '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Full Name */}
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('full_name')}
                              </span>
                              {editMode ? (
                                <Input
                                  className="h-10 w-full text-sm"
                                  value={editRecipient.full_name || ''}
                                  maxLength={200}
                                  placeholder="Фамилия Имя Отчество"
                                  onChange={(e) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      full_name: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span className="truncate">
                                    {[
                                      returnDetail.return_last_name,
                                      returnDetail.return_first_name,
                                      returnDetail.return_middle_name,
                                    ]
                                      .filter(Boolean)
                                      .join(' ') ||
                                      returnDetail.sender_name ||
                                      '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <Separator />
                            <h5 className="font-semibold text-sm flex items-center gap-2">
                              <MapPin className="w-4 h-4" />{' '}
                              {t('delivery_info')}
                            </h5>
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('delivery_city')}
                              </span>
                              {editMode ? (
                                <Input
                                  className="h-10 w-full text-sm"
                                  value={editRecipient.delivery_city || ''}
                                  maxLength={200}
                                  onChange={(e) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      delivery_city: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span className="truncate">
                                    {returnDetail.return_delivery_city ||
                                      returnDetail.sender_city_label ||
                                      '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="grid gap-1">
                              <span className="text-muted-foreground text-sm">
                                {t('delivery_warehouse')}
                              </span>
                              {editMode ? (
                                <Input
                                  className="h-10 w-full text-sm"
                                  value={editRecipient.delivery_warehouse || ''}
                                  maxLength={200}
                                  placeholder="Отделение / Почтомат"
                                  onChange={(e) =>
                                    setEditRecipient((p) => ({
                                      ...p,
                                      delivery_warehouse: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span className="truncate">
                                    {returnDetail.return_delivery_warehouse ||
                                      returnDetail.sender_address_label ||
                                      '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="flex-shrink-0" />
                <div className="flex-shrink-0 p-4 pt-3 flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {showHistory ? (
                      <Button
                        variant="outline"
                        onClick={() => setShowHistory(false)}
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {t('back')}
                      </Button>
                    ) : editMode ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditMode(false)
                            if (returnDetail) {
                              const q: Record<number, number> = {}
                              returnDetail.items.forEach((item) => {
                                q[item.id] = item.quantity
                              })
                              setEditQuantities(q)
                              setEditRecipient({
                                phone:
                                  returnDetail.return_phone ||
                                  returnDetail.phone ||
                                  '',
                                full_name:
                                  [
                                    returnDetail.return_last_name,
                                    returnDetail.return_first_name,
                                    returnDetail.return_middle_name,
                                  ]
                                    .filter(Boolean)
                                    .join(' ') ||
                                  returnDetail.sender_name ||
                                  '',
                                delivery_city:
                                  returnDetail.return_delivery_city ||
                                  returnDetail.sender_city_label ||
                                  '',
                                delivery_warehouse:
                                  returnDetail.return_delivery_warehouse ||
                                  returnDetail.sender_address_label ||
                                  '',
                              })
                            }
                          }}
                        >
                          {t('cancel')}
                        </Button>
                        <Button
                          className="gap-2"
                          onClick={handleSaveItems}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          {t('save')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setShowHistory(true)}
                        >
                          <Clock className="w-4 h-4" /> {t('order_history')}
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={enterEditMode}
                        >
                          <Pencil className="w-4 h-4" /> {t('edit_order')}
                        </Button>
                      </>
                    )}
                  </div>
                  {returnDetail?.ttn_number && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md">
                      <ScanBarcode className="w-4 h-4" />
                      <span className="font-mono">
                        {returnDetail.ttn_number.replace(
                          /(\d{2})(\d{4})(\d{4})(\d{4})/,
                          '$1 $2 $3 $4',
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

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
                  <DialogTitle>{t('delete')}</DialogTitle>
                  <DialogDescription>{t('delete_confirm')}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {deleteTarget && (
              <div className="rounded-lg bg-muted p-3 text-sm min-w-0 space-y-1">
                <span className="font-medium">
                  {deleteTarget.return_number}
                </span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteTarget!.id)}
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
      </div>
    </TooltipProvider>
  )
}

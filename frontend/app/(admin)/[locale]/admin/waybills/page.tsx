'use client'

import React, { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Eye, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NpWaybillBadge } from '@/components/ui/NpWaybillBadge'
import { formatPhone } from '@/components/ui/PhoneInput'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type { WaybillListItem } from '@/lib/types/nova-poshta'
import OrderWaybillModal from '../components/OrderWaybillModal'

const STATUS_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '101',
  '102',
  '103',
  '104',
  '105',
  '106',
  '107',
  '108',
  '109',
  '110',
  '111',
  '112',
  '113',
  '114',
  '115',
  '116',
  '117',
  '118',
  '119',
  '120',
  '121',
  '122',
  '123',
  '124',
  '125',
  '200',
  '201',
]

// ─── Статус → цвет (как бейдж ТТН) ──────────────────────────────────

function statusColor(code: string): string {
  // Серый — создана, но не отправлена
  if (code === '1') return 'bg-gray-500 text-white'
  // Красный — удалена / уничтожена
  if (['2', '120'].includes(code)) return 'bg-red-500 text-white'
  // Оранжевый — проблемы / отказы
  if (['3', '104', '105', '111', '115', '116', '121', '122'].includes(code))
    return 'bg-orange-500 text-white'
  // Чёрный — изъято
  if (code === '117') return 'bg-gray-900 text-white'
  // Зелёный — прибыла / получена
  if (
    [
      '7',
      '8',
      '9',
      '10',
      '106',
      '107',
      '108',
      '110',
      '113',
      '114',
      '201',
    ].includes(code)
  )
    return 'bg-green-500 text-white'
  // Синий — всё остальное (в пути, возврат и т.д.)
  return 'bg-blue-500 text-white'
}

// ─── Формат даты ────────────────────────────────────────────────────

function formatDate(dt: string | null): string {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ═════════════════════════════════════════════════════════════════════
// Page component
// ═════════════════════════════════════════════════════════════════════

export default function WaybillsPage() {
  const t = useTranslations('admin')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [viewWaybillId, setViewWaybillId] = useState<number | null>(null)

  // ── Fetch data ───────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['admin-waybills', statusFilter, page, search],
    queryFn: async () => {
      const params: any = { page: page + 1, per_page: 20 }
      if (statusFilter) params.status_code = statusFilter
      if (search) params.q = search
      const { data } = await novaPoshtaApi.listWaybills(params)
      return data
    },
  })

  // ── Columns ──────────────────────────────────────────────────────
  const columnHelper = createColumnHelper<WaybillListItem>()

  const columns = useMemo(
    () => [
      // ── Badge ТТН ──────────────────────────────────────────────
      columnHelper.accessor('np_number', {
        header: t('novaposhta_ttn'),
        size: 200,
        cell: (info) => {
          const row = info.row.original
          return (
            <NpWaybillBadge
              npNumber={row.np_number}
              exists
              isDeleted={row.is_deleted}
            />
          )
        },
      }),

      // ── Получатель ─────────────────────────────────────────────
      columnHelper.accessor('recipient_name', {
        header: t('novaposhta_recipient'),
        size: 220,
        cell: (info) => {
          const row = info.row.original
          return (
            <div className="leading-tight">
              <div className="font-medium">{row.recipient_name || '—'}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {row.recipient_phone ? formatPhone(row.recipient_phone) : '—'}
              </div>
            </div>
          )
        },
      }),

      // ── Город получателя ───────────────────────────────────────
      columnHelper.accessor('recipient_city_label', {
        header: t('novaposhta_recipient_city'),
        size: 160,
        cell: (info) => info.getValue() || '—',
      }),

      // ── Сумма ──────────────────────────────────────────────────
      columnHelper.accessor('afterpayment_amount', {
        header: 'Сумма',
        size: 120,
        cell: (info) => {
          const val = info.getValue()
          if (!val) return '—'
          return `${Number(val).toLocaleString('ru-RU')} ₴`
        },
      }),

      // ── Статус ─────────────────────────────────────────────────
      columnHelper.accessor('status_code', {
        header: t('novaposhta_status'),
        size: 180,
        cell: (info) => {
          const row = info.row.original
          const label =
            t(`novaposhta_status_${row.status_code}`) ||
            row.status_text ||
            row.status_code ||
            '—'
          return (
            <Badge
              className={`${label.length <= 20 ? 'text-sm' : 'text-xs'} border-0 w-fit ${statusColor(row.status_code)}`}
            >
              {label}
            </Badge>
          )
        },
      }),

      // ── Дата создания ──────────────────────────────────────────
      columnHelper.accessor('created_at', {
        header: t('novaposhta_created_at'),
        size: 170,
        cell: (info) => formatDate(info.getValue()),
      }),

      // ── Дата получения / отказа ────────────────────────────────
      columnHelper.display({
        id: 'last_event_at',
        header: t('order_delivered_date'),
        size: 170,
        cell: ({ row }) => {
          // Show deleted_at for deleted waybills as "rejection date"
          if (row.original.is_deleted && row.original.deleted_at) {
            return (
              <span className="text-red-600">
                {formatDate(row.original.deleted_at)}
              </span>
            )
          }
          // For delivered statuses (7, 10, 111-114) show updated_at as proxy
          const deliveredCodes = ['7', '10', '111', '112', '113', '114']
          if (deliveredCodes.includes(row.original.status_code)) {
            return (
              <span className="text-green-600">
                {formatDate(row.original.updated_at)}
              </span>
            )
          }
          return '—'
        },
      }),

      // ── Действия ───────────────────────────────────────────────
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
                  onClick={() => setViewWaybillId(row.original.id)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('view_order')}</TooltipContent>
            </Tooltip>
          </div>
        ),
      }),
    ],
    [t],
  )

  // ── Table instance ──────────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="p-6">
        {/* ── Search & filters ────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10"
              placeholder={t('search')}
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
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder={t('novaposhta_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter_all')}</SelectItem>
              {STATUS_KEYS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t('novaposhta_status_' + s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Table ────────────────────────────────────────────────── */}
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

                {/* ── Pagination ──────────────────────────────────── */}
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
      </div>

      {/* ── Read-only view modal ──────────────────────────────────── */}
      {viewWaybillId !== null && (
        <OrderWaybillModal
          orderId={0}
          waybillId={viewWaybillId}
          open={viewWaybillId !== null}
          readOnly
          onOpenChange={(open) => {
            if (!open) setViewWaybillId(null)
          }}
        />
      )}
    </TooltipProvider>
  )
}

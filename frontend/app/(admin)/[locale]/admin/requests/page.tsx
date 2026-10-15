'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { can } from '@/lib/permissions'
import {
  actorLabel,
  STATUSES,
  type RequestCategory,
  type RequestListItem,
  type RequestListResponse,
} from './shared'
import { useAuthStore } from '@/store/authStore'
import { useRequirePerm } from '@/hooks/useRequirePerm'
import api from '@/lib/api'
import { DeadlineCell, RequestsStatusBadge } from './RequestsStatusBadge'
import RequestDetailModal from './RequestDetailModal'
import CreateRequestDialog from './CreateRequestDialog'
import CategoriesDialog from './CategoriesDialog'
import { useRequestDate } from './useRequestDate'

const PAGE_SIZE = 20

const columnHelper = createColumnHelper<RequestListItem>()

export default function RequestsPage() {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const reqPerm = useRequirePerm()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fmtDate = useRequestDate()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const canView = !!user && can(user, 'requests.view')
  useEffect(() => {
    if (user && !canView) reqPerm('requests.view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canView])

  // Дебаунс поиска
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [searchInput])

  // Глубина ссылка из колокольчика: ?id=123 открывает заявку
  const openIdParam = searchParams.get('id')
  const [openId, setOpenId] = useState<number | null>(null)
  useEffect(() => {
    const id = Number(openIdParam)
    if (openIdParam && !isNaN(id) && id > 0) setOpenId(id)
  }, [openIdParam])

  const closeModal = () => {
    setOpenId(null)
    if (openIdParam) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('id')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
  }

  const { data: categories = [] } = useQuery<RequestCategory[]>({
    queryKey: ['requests', 'categories'],
    queryFn: async () => {
      const { data } = await api.get('/admin/requests/categories')
      return data || []
    },
    enabled: canView,
  })

  const { data, isLoading } = useQuery<RequestListResponse>({
    queryKey: ['requests', statusFilter, categoryFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('category_id', categoryFilter)
      if (search) params.set('search', search)
      const { data } = await api.get(`/admin/requests?${params.toString()}`)
      return data
    },
    enabled: canView,
    // Страховочный опрос: мгновенные обновления приходят по WebSocket
    refetchInterval: 30000,
  })

  // Стабильная ссылка массива: иначе TanStack пересчитывает строки
  // на каждый рендер и страница крутит лишние перерисовки
  const items = useMemo(() => data?.items || [], [data])
  const total = data?.total || 0
  const progress = data?.progress || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusChips = useMemo(() => {
    const counts = data?.counts || {}
    return [
      {
        key: 'all',
        label: t('requests_filter_all'),
        count: null as number | null,
      },
      ...STATUSES.map((s) => ({
        key: s,
        label: t(`requests_status_${s}`),
        count: counts[s] ?? 0,
      })),
    ]
  }, [t, data?.counts])

  // Колонки журнала — те же дефиниции и рендер, что в таблице заказов
  const columns = useMemo(
    () => [
      columnHelper.accessor('number', {
        header: t('requests_col_number'),
        size: 160,
        cell: (info) => (
          <span className="font-mono whitespace-nowrap">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('category_name', {
        header: t('requests_col_category'),
        size: 180,
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor('title', {
        header: t('requests_col_title'),
        size: 260,
        cell: (info) => (
          <span className="text-sm block max-w-[280px] truncate">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'author',
        header: t('requests_col_author'),
        size: 160,
        cell: ({ row }) =>
          row.original.created_by ? (
            <span className="text-sm">
              {actorLabel(row.original.created_by)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('requests_source_storefront')}
            </span>
          ),
      }),
      columnHelper.display({
        id: 'assignee',
        header: t('requests_col_assignee'),
        size: 160,
        cell: ({ row }) =>
          row.original.assignee ? (
            <span className="text-sm">{actorLabel(row.original.assignee)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('requests_assignee_none')}
            </span>
          ),
      }),
      columnHelper.display({
        id: 'deadline',
        header: t('requests_col_deadline'),
        size: 170,
        cell: ({ row }) => (
          <DeadlineCell
            deadline={row.original.deadline}
            state={row.original.deadline_state}
            minutesLeft={row.original.minutes_left}
            minutesLate={row.original.minutes_late}
            closed={
              row.original.status === 'resolved' ||
              row.original.status === 'rejected'
            }
          />
        ),
      }),
      columnHelper.display({
        id: 'status',
        header: t('requests_col_status'),
        size: 130,
        cell: ({ row }) => (
          <RequestsStatusBadge
            status={row.original.status}
            className="text-sm"
          />
        ),
      }),
      columnHelper.accessor('created_at', {
        header: t('requests_col_created'),
        size: 150,
        cell: (info) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {fmtDate(info.getValue())}
          </span>
        ),
      }),
    ],
    [t, fmtDate],
  )

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE })
          : updater
      setPage(next.pageIndex + 1)
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  return (
    <div className="p-6 space-y-4">
      {/* Действия: название страницы показывает топ-бар */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex items-center gap-2">
          {can(user, 'requests.manage') && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                reqPerm('requests.manage') && setCategoriesOpen(true)
              }
            >
              <Settings2 className="w-4 h-4" />
              {t('requests_categories_btn')}
            </Button>
          )}
          {can(user, 'requests.create') && (
            <Button
              className="gap-1.5"
              onClick={() => reqPerm('requests.create') && setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" />
              {t('requests_new_btn')}
            </Button>
          )}
        </div>
      </div>

      {/* Счётчики статусов + полоса выполнения */}
      <div className="flex flex-wrap items-center gap-2">
        {statusChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => {
              setStatusFilter(chip.key)
              setPage(1)
            }}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${
              statusFilter === chip.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent'
            }`}
          >
            {chip.label}
            {chip.count != null && (
              <span className="ml-1.5 opacity-80 tabular-nums">
                {chip.count}
              </span>
            )}
          </button>
        ))}

        <div className="flex items-center gap-3 ml-auto min-w-[240px]">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {t('requests_progress_label')}
          </span>
          <Progress value={progress} className="w-40" />
          <span className="text-sm font-medium tabular-nums">{progress}%</span>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('requests_search_placeholder')}
            className="pl-9 h-10"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[240px] h-10">
            <SelectValue placeholder={t('requests_filter_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('requests_filter_all')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Таблица */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
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
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-b last:border-0">
                      <td colSpan={columns.length} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && items.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="p-3 text-center text-muted-foreground py-10"
                    >
                      {t('requests_empty')}
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setOpenId(row.original.id)}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/30 ${
                        row.original.deadline_state === 'overdue'
                          ? 'bg-red-500/5'
                          : ''
                      }`}
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

          {!isLoading && total > PAGE_SIZE && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {t('page_of', { page, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('pagination_prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('pagination_next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {openId != null && (
        <RequestDetailModal
          requestId={openId}
          categories={categories}
          onClose={closeModal}
        />
      )}

      <CreateRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories}
        onCreated={(id) => setOpenId(id)}
      />

      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
    </div>
  )
}

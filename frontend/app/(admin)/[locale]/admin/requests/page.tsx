'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { AlertTriangle, Eye, Loader2, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { categoryName } from '@/lib/requestCategories'
import { useAuthStore } from '@/store/authStore'
import { useRequirePerm } from '@/hooks/useRequirePerm'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { DeadlineCell, RequestsStatusCell } from './RequestsStatusBadge'
import RequestDetailModal from './RequestDetailModal'
import CategoriesDialog from './CategoriesDialog'
import { useRequestDate } from './useRequestDate'
import { TablePagination } from '@/components/admin/TablePagination'
import { PageSizeSelect } from '@/components/admin/PageSizeSelect'

const columnHelper = createColumnHelper<RequestListItem>()

export default function RequestsPage() {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const reqPerm = useRequirePerm()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fmtDate = useRequestDate()
  const qc = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [createOpen, setCreateOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RequestListItem | null>(null)

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
    setCreateOpen(false)
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

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/requests/${id}`)
    },
    onSuccess: () => {
      toast.success(t('requests_deleted_ok'))
      qc.invalidateQueries({ queryKey: ['requests'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const { data, isLoading } = useQuery<RequestListResponse>({
    queryKey: [
      'requests',
      statusFilter,
      categoryFilter,
      search,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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
        size: 130,
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: 'category',
        header: t('requests_col_category'),
        size: 130,
        cell: ({ row }) => (
          <span className="text-sm">
            {categoryName(
              t,
              row.original.category_code,
              row.original.category_name,
            )}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'author',
        header: t('requests_col_author'),
        size: 120,
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
        size: 120,
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
        size: 140,
        cell: ({ row }) => (
          <DeadlineCell
            deadline={row.original.deadline}
            state={row.original.deadline_state}
            minutesLeft={row.original.minutes_left}
            minutesLate={row.original.minutes_late}
            closed={
              row.original.status === 'resolved' ||
              row.original.status === 'rejected' ||
              row.original.status === 'closed'
            }
            overdueBadge={false}
          />
        ),
      }),
      columnHelper.display({
        id: 'status',
        header: t('requests_col_status'),
        size: 110,
        // Просрочка — это состояние статуса: она заменяет статус
        cell: ({ row }) => (
          <RequestsStatusCell
            status={row.original.status}
            deadlineState={row.original.deadline_state}
            minutesLate={row.original.minutes_late}
          />
        ),
      }),
      columnHelper.accessor('created_at', {
        header: t('requests_col_created'),
        size: 130,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {fmtDate(info.getValue())}
          </span>
        ),
      }),
      // Действия — как в таблице заказов: просмотр и удаление
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {/* Просмотр — по праву «Просмотр журнала заявок» (доступно всем ролям журнала) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setOpenId(row.original.id)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('requests_view')}</TooltipContent>
            </Tooltip>
            {/* Удаление — по праву «Удаление заявок» (по умолчанию только админ) */}
            {can(user, 'requests.delete') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      if (!reqPerm('requests.delete')) return
                      setDeleteTarget(row.original)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('requests_delete')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      }),
    ],
    [t, fmtDate, reqPerm, user],
  )

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: page - 1, pageSize })
          : updater
      setPage(next.pageIndex + 1)
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  // Кнопки «Категории» и «Новая заявка» живут в топ-баре админки
  useEffect(() => {
    ;(window as any).__openRequestCategories = () => {
      if (!reqPerm('requests.manage')) return
      setCategoriesOpen(true)
    }
    ;(window as any).__openCreateRequest = () => {
      if (!reqPerm('requests.create')) return
      setCreateOpen(true)
    }
    return () => {
      delete (window as any).__openRequestCategories
      delete (window as any).__openCreateRequest
    }
  }, [reqPerm])

  // Полоса «Выполнено» перенесена в топ-бар: сообщаем прогресс событием
  useEffect(() => {
    if (data == null) return
    ;(window as any).__requestsProgress = data.progress
    window.dispatchEvent(
      new CustomEvent('requests-progress', { detail: data.progress }),
    )
    return () => {
      delete (window as any).__requestsProgress
    }
  }, [data])

  return (
    <div className="p-6 space-y-4">
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('requests_search_placeholder')}
            className="pl-9 h-10"
          />
        </div>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px] h-10">
            <SelectValue placeholder={t('requests_filter_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('requests_filter_all')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {categoryName(t, c.code, c.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Фильтр статусов — тем же визуалом, что поиск и селект */}
        {statusChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => {
              setStatusFilter(chip.key)
              setPage(1)
            }}
            className={`h-10 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === chip.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input shadow-sm hover:bg-accent hover:text-accent-foreground'
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

          <TablePagination table={table} />
        </CardContent>
      </Card>

      {(openId != null || createOpen) && (
        <RequestDetailModal
          requestId={openId}
          categories={categories}
          onClose={closeModal}
          onCreated={(id) => {
            setCreateOpen(false)
            setOpenId(id)
          }}
        />
      )}

      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />

      {/* Подтверждение удаления заявки — как в заказах */}
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
                <DialogTitle>{t('requests_delete')}</DialogTitle>
                <DialogDescription>
                  {t('requests_delete_confirm')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <strong className="font-mono">{deleteTarget.number}</strong>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground truncate">
                  {categoryName(
                    t,
                    deleteTarget.category_code,
                    deleteTarget.category_name,
                  )}
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
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
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
  )
}

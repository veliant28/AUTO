'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Plus, Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  const items = data?.items || []
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

  return (
    <div className="p-6 space-y-4">
      {/* Заголовок + действия */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" />
          {t('requests_title')}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {can(user, 'requests.manage') && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
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
              size="sm"
              className="gap-2"
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
          <span className="text-xs text-muted-foreground whitespace-nowrap">
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
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[240px]">
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
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('requests_col_number')}</TableHead>
                <TableHead>{t('requests_col_category')}</TableHead>
                <TableHead>{t('requests_col_title')}</TableHead>
                <TableHead>{t('requests_col_author')}</TableHead>
                <TableHead>{t('requests_col_assignee')}</TableHead>
                <TableHead>{t('requests_col_deadline')}</TableHead>
                <TableHead>{t('requests_col_status')}</TableHead>
                <TableHead>{t('requests_col_created')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-10"
                  >
                    {t('requests_empty')}
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  onClick={() => setOpenId(item.id)}
                  className={`cursor-pointer ${
                    item.deadline_state === 'overdue' ? 'bg-red-500/5' : ''
                  }`}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {item.number}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.category_name}
                  </TableCell>
                  <TableCell className="text-sm max-w-[280px] truncate">
                    {item.title}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.created_by ? (
                      actorLabel(item.created_by)
                    ) : (
                      <span className="text-muted-foreground">
                        {t('requests_source_storefront')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.assignee ? (
                      actorLabel(item.assignee)
                    ) : (
                      <span className="text-muted-foreground">
                        {t('requests_assignee_none')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DeadlineCell
                      deadline={item.deadline}
                      state={item.deadline_state}
                      minutesLeft={item.minutes_left}
                      minutesLate={item.minutes_late}
                      closed={
                        item.status === 'resolved' || item.status === 'rejected'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <RequestsStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(item.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      )}

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

'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Play,
  Square,
  Minus,
  Plus,
  CheckSquare,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { ArticleItem } from './tecdocHelpers'

export default function BatchTab({ t }: { t: (k: string) => string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchSize, setBatchSize] = useState(25)

  const statuses = [
    { value: 'all', label: t('tecdoc_filter_all') },
    { value: 'matched_app', label: t('tecdoc_matched_app') },
    { value: 'matched', label: t('tecdoc_matched') },
    { value: 'unmatched', label: t('tecdoc_unmatched') },
    { value: 'not_found', label: t('tecdoc_not_found') },
    { value: 'pending', label: t('tecdoc_pending') },
  ]

  const statusIcons: Record<string, React.ReactNode> = {
    matched_app: <CheckCircle2 className="w-3.5 h-3.5 text-white" />,
    matched: <CheckCircle2 className="w-3.5 h-3.5 text-white" />,
    unmatched: <AlertTriangle className="w-3.5 h-3.5 text-white" />,
    not_found: <XCircle className="w-3.5 h-3.5 text-white" />,
    pending: <Clock className="w-3.5 h-3.5 text-white" />,
  }

  const { data } = useQuery({
    queryKey: ['tecdoc-articles', page, pageSize, status, search, brand],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (status) params.status = status
      if (search) params.search = search
      if (brand) params.brand = brand
      const { data } = await api.get('/admin/tecdoc/articles', { params })
      return data as { items: ArticleItem[]; total: number }
    },
  })

  const { data: brandsList } = useQuery({
    queryKey: ['tecdoc-brand-names'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/brands')
      return data || []
    },
    staleTime: 300000,
  })

  const refreshAfterBatch = () => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['tecdoc-articles'] })
      queryClient.invalidateQueries({ queryKey: ['tecdoc-batch-status'] })
    }, 1000)
  }

  const batchStart = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/batch/start', {
        size: batchSize,
      })
      return data
    },
    onSuccess: (res: any) => {
      toast.success(`${t('tecdoc_batch_started')}`)
      refreshAfterBatch()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('save_error')),
  })

  const batchStartSelected = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/batch/start-selected', {
        ids: Array.from(selected),
      })
      return data
    },
    onSuccess: (res: any) => {
      toast.success(`${t('tecdoc_batch_started')}`)
      setSelected(new Set())
      refreshAfterBatch()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('save_error')),
  })

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!data?.items) return
    const allIds = data.items.map((a) => a.id)
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    )
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('search_users')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={brand || 'all'}
          onValueChange={(v) => setBrand(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('products_brand')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tecdoc_filter_all')}</SelectItem>
            {(brandsList || []).map((b: any) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || 'all'}
          onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => batchStart.mutate()}
                disabled={batchStart.isPending}
              >
                {batchStart.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tecdoc_batch_start')}</TooltipContent>
          </Tooltip>

          <Button variant="ghost" size="icon" disabled>
            <Square className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setBatchSize(Math.max(1, batchSize - 1))}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium w-8 text-center">
            {batchSize}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setBatchSize(batchSize + 1)}
          >
            <Plus className="w-4 h-4" />
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => batchStartSelected.mutate()}
                disabled={batchStartSelected.isPending || selected.size === 0}
              >
                {batchStartSelected.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckSquare className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tecdoc_batch_start_selected')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 whitespace-nowrap">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={
                        data?.items &&
                        data.items.length > 0 &&
                        selected.size === data.items.length
                      }
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_article')}
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_name')}
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_brand')}
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_status')}
                  </th>
                  <th className="text-center p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_attempts')}
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {t('tecdoc_col_last')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selected.has(a.id)}
                        onCheckedChange={() => toggleSelect(a.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-mono text-sm">{a.article}</td>
                    <td className="p-3 text-sm max-w-[200px] truncate">
                      {a.name || '—'}
                    </td>
                    <td className="p-3 text-sm font-semibold">
                      {a.brand || '—'}
                    </td>
                    <td className="p-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            className={`border-0 gap-1.5 px-3 h-7 w-fit flex items-center cursor-pointer text-sm font-normal whitespace-nowrap ${
                              a.match_status === 'matched_app'
                                ? 'bg-green-500 text-white'
                                : a.match_status === 'matched'
                                  ? 'bg-blue-500 text-white'
                                  : a.match_status === 'unmatched'
                                    ? 'bg-yellow-500 text-white'
                                    : a.match_status === 'not_found'
                                      ? 'bg-red-500 text-white'
                                      : 'bg-gray-400 text-white'
                            }`}
                          >
                            {statusIcons[a.match_status]}
                            {t('tecdoc_' + a.match_status) || a.match_status}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('tecdoc_' + a.match_status) || a.match_status}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="p-3 text-center text-sm">{a.attempts}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {a.last_attempt_at
                        ? new Date(a.last_attempt_at + 'Z').toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-muted-foreground text-sm"
                    >
                      {t('tecdoc_articles_empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {t('page_of', { page, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('prev_page')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next_page')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from '@wrksz/themes/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database,
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
  Save,
  Plug,
  Copy,
  Search,
  BarChart3,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/lib/toast'
import { toast as sonnerToast } from 'sonner'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import api from '@/lib/api'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

type Tab = 'dashboard' | 'batch' | 'manual' | 'settings'

interface DashboardData {
  used: number
  remaining: number
  limit: number
  exhausted: boolean
  hourly: { hour: string; count: number }[]
}

interface BrandItem {
  id: number
  name: string
  total: number
  matched: number
  unmatched: number
  with_applicability: number
}

interface ArticleItem {
  id: number
  supplier: string
  article: string
  brand: string | null
  name: string | null
  price: number | null
  currency: string | null
  stock_total: number
  match_status: string
  attempts: number
  last_attempt_at: string | null
}

type PieLabelLayoutParams = {
  dataIndex?: number
  viewRect?: { x: number; y: number; width: number; height: number }
  labelRect?: { x: number; y: number; width: number; height: number }
  rect?: { x: number; y: number; width: number; height: number }
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2
  let n = angle % twoPi
  if (n <= -Math.PI) n += twoPi
  else if (n > Math.PI) n -= twoPi
  return n
}

function shiftPieLabelAlongArcNearEdge(
  params: PieLabelLayoutParams,
  sliceValues: number[],
) {
  const labelRect = params.labelRect
  const pieRect = params.rect
  const viewRect = params.viewRect || params.rect
  if (!labelRect || !pieRect || !viewRect) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const }
  }

  const minX = viewRect.x + 6
  const maxX = Math.max(
    viewRect.x + viewRect.width - 6,
    minX + labelRect.width + 4,
  )
  const leftOverflow = Math.max(minX - labelRect.x, 0)
  const rightOverflow = Math.max(labelRect.x + labelRect.width - maxX, 0)
  if (leftOverflow <= 0 && rightOverflow <= 0) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const }
  }

  const centerX = pieRect.x + pieRect.width / 2
  const centerY = pieRect.y + pieRect.height / 2
  const labelCenterX = labelRect.x + labelRect.width / 2
  const labelCenterY = labelRect.y + labelRect.height / 2
  const dx = labelCenterX - centerX
  const dy = labelCenterY - centerY
  const radius = Math.max(Math.hypot(dx, dy), 1)
  const sourceAngle = Math.atan2(dy, dx)

  const total = Math.max(
    sliceValues.reduce((acc, v) => acc + Math.max(v, 0), 0),
    1,
  )
  const dataIndex = Math.max(
    0,
    Math.min(Number(params.dataIndex ?? 0), sliceValues.length - 1),
  )
  const currentSliceValue = Math.max(sliceValues[dataIndex] ?? 0, 0)
  const beforeSliceValue = sliceValues
    .slice(0, dataIndex)
    .reduce((acc, v) => acc + Math.max(v, 0), 0)
  const fullCircle = Math.PI * 2
  const sliceStart = -Math.PI / 2 + (beforeSliceValue / total) * fullCircle
  const sliceSpan = (currentSliceValue / total) * fullCircle
  const sliceEnd = sliceStart + sliceSpan
  const sliceCenter = sliceStart + sliceSpan / 2
  const sourceAngleUnwrapped =
    sourceAngle +
    Math.round((sliceCenter - sourceAngle) / fullCircle) * fullCircle
  const slicePad = Math.min(0.14, Math.max(0.02, sliceSpan * 0.2))
  const lowerBound = sliceStart + slicePad
  const upperBound = sliceEnd - slicePad
  const boundedSource =
    sliceSpan > slicePad * 2
      ? Math.max(lowerBound, Math.min(upperBound, sourceAngleUnwrapped))
      : sliceCenter

  const evaluateOverflow = (angleUnwrapped: number) => {
    const nx = centerX + Math.cos(angleUnwrapped) * radius - labelRect.width / 2
    const left = Math.max(minX - nx, 0)
    const right = Math.max(nx + labelRect.width - maxX, 0)
    return {
      total: left + right,
      x: nx,
      y: centerY + Math.sin(angleUnwrapped) * radius - labelRect.height / 2,
    }
  }

  const sourceOverflow = evaluateOverflow(boundedSource)
  let bestAngle = boundedSource
  let best = sourceOverflow
  if (sourceOverflow.total > 0 && sliceSpan > slicePad * 2) {
    const steps = 32
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps
      const probe = lowerBound + (upperBound - lowerBound) * ratio
      const evaluated = evaluateOverflow(probe)
      if (evaluated.total < best.total) {
        best = evaluated
        bestAngle = probe
      } else if (evaluated.total === best.total) {
        const currentDistance = Math.abs(probe - boundedSource)
        const bestDistance = Math.abs(bestAngle - boundedSource)
        if (currentDistance < bestDistance) {
          best = evaluated
          bestAngle = probe
        }
      }
    }
  }

  const normalizedBestAngle = normalizeAngle(bestAngle)
  const nextCenterX = centerX + Math.cos(normalizedBestAngle) * radius
  const nextCenterY = centerY + Math.sin(normalizedBestAngle) * radius

  return {
    x: nextCenterX - labelRect.width / 2,
    y: nextCenterY - labelRect.height / 2,
    hideOverlap: false as const,
    moveOverlap: 'shiftY' as const,
  }
}

function ResetTimer({ exhausted }: { exhausted: boolean }) {
  const computeMs = React.useCallback(() => {
    const next = Math.ceil(Date.now() / 3600000) * 3600000
    return Math.max(0, next - Date.now())
  }, [])

  const [ms, setMs] = useState(exhausted ? computeMs() : 0)

  useEffect(() => {
    if (!exhausted) return
    setMs(computeMs())
    const tick = () => setMs(computeMs())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [exhausted, computeMs])

  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (exhausted) {
    return (
      <Badge className="bg-red-500 text-white animate-pulse gap-1.5 hover:bg-red-500 border-0 text-sm font-mono min-w-[85px] justify-center">
        <Clock className="w-3.5 h-3.5" />
        {pad(h)}:{pad(m)}:{pad(s)}
      </Badge>
    )
  }

  return (
    <Badge className="bg-blue-500 text-white gap-1.5 hover:bg-blue-500 border-0 text-sm font-mono min-w-[85px] justify-center">
      <Clock className="w-3.5 h-3.5" />
      00:00:00
    </Badge>
  )
}

function DashboardTab({ t }: { t: (k: string) => string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const { data, isLoading } = useQuery({
    queryKey: ['tecdoc-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/dashboard')
      return data as DashboardData
    },
    refetchInterval: 10000,
  })

  const { data: brandData } = useQuery({
    queryKey: ['tecdoc-brands-coverage'],
    queryFn: async () => {
      const { data } = await api.get('/admin/brands', {
        params: { page: 1, page_size: 30 },
      })
      return data as { items: BrandItem[]; total: number }
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  const sliceValues = [data.used, Math.max(0, data.remaining)]
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280'
  const chartBg = isDark ? 'transparent' : '#fff'
  const borderColor = isDark ? '#374151' : '#e5e7eb'

  const donutOption = {
    backgroundColor: chartBg,
    tooltip: { trigger: 'item' as const },
    series: [
      {
        type: 'pie' as const,
        radius: ['50%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: borderColor,
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'outside' as const,
          alignTo: 'labelLine' as const,
          margin: 2,
          bleedMargin: 4,
          formatter: '{d}%',
          fontSize: 12,
          color: axisTextColor,
          fontWeight: 500,
        },
        labelLine: {
          show: true,
          length: 18,
          length2: 14,
          smooth: false,
          lineStyle: { color: axisTextColor },
        },
        labelLayout: (params: PieLabelLayoutParams) =>
          shiftPieLabelAlongArcNearEdge(params, sliceValues),
        emphasis: { label: { fontSize: 16, fontWeight: 'bold' as const } },
        data: [
          {
            value: data.used,
            name: t('tecdoc_used'),
            itemStyle: { color: '#0ea5e9' },
          },
          {
            value: Math.max(0, data.remaining),
            name: t('tecdoc_remaining'),
            itemStyle: { color: '#22c55e' },
          },
        ],
      },
    ],
    graphic: [
      {
        type: 'text' as const,
        left: 'center',
        top: 'center',
        style: {
          text: `${data.used} / ${data.limit}`,
          textAlign: 'center' as const,
          fill: isDark ? '#e5e7eb' : '#374151',
          fontSize: 20,
          fontWeight: 'bold' as const,
        },
      },
    ],
  }

  const lineOption = {
    backgroundColor: chartBg,
    xAxis: {
      type: 'category' as const,
      data: data.hourly.map((h) => h.hour),
      axisLabel: { color: axisTextColor },
      axisLine: { lineStyle: { color: borderColor } },
    },
    yAxis: {
      type: 'value' as const,
      max: data.limit,
      axisLabel: { color: axisTextColor },
      splitLine: { lineStyle: { color: borderColor } },
    },
    series: [
      {
        data: data.hourly.map((h) => h.count),
        type: 'line' as const,
        smooth: true,
        areaStyle: { opacity: 0.15, color: '#0ea5e9' },
        lineStyle: { color: '#0ea5e9', width: 2 },
        itemStyle: { color: '#0ea5e9' },
      },
    ],
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
  }

  const brandBarOption = brandData?.items
    ? (() => {
        const sorted = [...brandData.items].sort(
          (a, b) => b.with_applicability - a.with_applicability,
        )
        return {
          backgroundColor: chartBg,
          tooltip: {
            trigger: 'axis' as const,
            axisPointer: { type: 'none' as const },
          },
          xAxis: {
            type: 'category' as const,
            data: sorted.map((b) => b.name),
            axisLabel: {
              color: axisTextColor,
              rotate: 45,
              fontSize: 10,
              interval: 0,
            },
            axisLine: { lineStyle: { color: borderColor } },
          },
          yAxis: {
            type: 'value' as const,
            axisLabel: { color: axisTextColor },
            splitLine: { lineStyle: { color: borderColor } },
          },
          series: [
            {
              name: t('brands_matched'),
              type: 'bar' as const,
              data: sorted.map((b) => b.with_applicability),
              itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
            },
          ],
          grid: { top: 20, right: 20, bottom: 100, left: 50 },
        }
      })()
    : {}

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-2">
            <ReactECharts
              option={donutOption}
              style={{ width: '100%', height: 370 }}
            />
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              {t('tecdoc_hourly_usage')}
            </CardTitle>
            <ResetTimer exhausted={data.exhausted} />
          </CardHeader>
          <CardContent className="p-2">
            <ReactECharts option={lineOption} style={{ height: 310 }} />
          </CardContent>
        </Card>
      </div>
      {brandData?.items && brandData.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {t('brands_coverage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ReactECharts
              option={brandBarOption}
              style={{ width: '100%', height: 400 }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BatchTab({ t }: { t: (k: string) => string }) {
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
                size="sm"
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

          <Button variant="ghost" size="sm" disabled>
            <Square className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setBatchSize(Math.max(1, batchSize - 1))}
          >
            <Minus className="w-3 h-3" />
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
            <Plus className="w-3 h-3" />
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
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
                            className={`border-0 h-6 w-6 p-0 flex items-center justify-center cursor-pointer ${
                              a.match_status === 'matched_app'
                                ? 'bg-green-500'
                                : a.match_status === 'matched'
                                  ? 'bg-blue-500'
                                  : a.match_status === 'unmatched'
                                    ? 'bg-yellow-500'
                                    : a.match_status === 'not_found'
                                      ? 'bg-red-500'
                                      : 'bg-gray-400'
                            }`}
                          >
                            {statusIcons[a.match_status]}
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
                {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, data?.total || 0)} of{' '}
                {data?.total || 0}
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
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number
                  if (totalPages <= 7) {
                    p = i + 1
                  } else if (page <= 4) {
                    p = i + 1
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i
                  } else {
                    p = page - 3 + i
                  }
                  return (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
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

function ManualTab({ t }: { t: (k: string) => string }) {
  const [article, setArticle] = useState('')
  const [candidates, setCandidates] = useState<any[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null)
  const [details, setDetails] = useState<any>(null)
  const [sku, setSku] = useState('')
  const [skuResults, setSkuResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [binding, setBinding] = useState(false)
  const [searchMode, setSearchMode] = useState<'local' | 'remote' | 'both'>(
    'local',
  )
  const [brandFilter, setBrandFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')

  const doSearch = async () => {
    if (!article.trim()) return
    setSearching(true)
    try {
      const localPromise =
        searchMode === 'local' || searchMode === 'both'
          ? api
              .post('/admin/tecdoc/manual/search', { article: article.trim() })
              .then((r) => r.data || [])
          : Promise.resolve([])

      const remotePromise =
        searchMode === 'remote' || searchMode === 'both'
          ? api
              .post('/admin/tecdoc/manual/search-remote', {
                article: article.trim(),
              })
              .then((r) => r.data || [])
          : Promise.resolve([])

      const [localRes, remoteRes] = await Promise.all([
        localPromise,
        remotePromise,
      ])

      if (searchMode === 'both') {
        const seen = new Set<string>()
        const merged: any[] = []
        for (const c of [...localRes, ...remoteRes]) {
          const key = `${c.brand || ''}|${c.article}`
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(c)
          }
        }
        setCandidates(merged)
      } else {
        setCandidates(searchMode === 'local' ? localRes : remoteRes)
      }
      setSelectedCandidate(null)
      setDetails(null)
    } catch {
      toast.error(t('save_error'))
    } finally {
      setSearching(false)
    }
  }

  const loadDetails = async (cand: any) => {
    setSelectedCandidate(cand)
    try {
      const { data } = await api.post('/admin/tecdoc/manual/details', {
        article: cand.article,
      })
      setDetails(data)
    } catch {
      setDetails(null)
    }
  }

  const doBind = async (spId: number) => {
    if (!selectedCandidate) return
    setBinding(true)
    try {
      await api.post('/admin/tecdoc/manual/bind', {
        supplier_price_id: spId,
        tecdoc_article: selectedCandidate.article,
        tecdoc_brand_id: selectedCandidate.brand_id,
        supplier_name: selectedCandidate.brand,
      })
      toast.success(t('tecdoc_bind_ok'))
    } catch {
      toast.error(t('save_error'))
    } finally {
      setBinding(false)
    }
  }

  const searchSku = async (q: string) => {
    setSku(q)
    if (q.length < 2) {
      setSkuResults([])
      return
    }
    try {
      const { data } = await api.get('/admin/tecdoc/articles', {
        params: { search: q, page_size: 10 },
      })
      setSkuResults(data?.items || [])
    } catch {
      setSkuResults([])
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-[calc(100vh-140px)]">
      <div className="space-y-4 flex flex-col h-full min-h-0">
        <div className="flex gap-2 items-center flex-shrink-0">
          <Button
            variant={searchMode === 'local' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('local')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'local' ? 'bg-green-500 hover:bg-green-600' : ''
            }
          >
            Л
          </Button>
          <Button
            variant={searchMode === 'remote' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('remote')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'remote' ? 'bg-red-500 hover:bg-red-600' : ''
            }
          >
            У
          </Button>
          <Button
            variant={searchMode === 'both' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('both')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'both' ? 'bg-orange-500 hover:bg-orange-600' : ''
            }
          >
            2
          </Button>
          <Input
            placeholder={t('tecdoc_manual_placeholder')}
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <Button onClick={doSearch} disabled={searching || !article.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        <Card className="overflow-hidden flex-1 min-h-0">
          <CardContent className="p-0 h-full overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium text-muted-foreground">
                    {t('products_brand')}
                  </th>
                  <th className="text-left p-2 font-medium text-muted-foreground">
                    {t('products_article')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.length > 0 ? (
                  candidates.map((c, i) => (
                    <tr
                      key={i}
                      className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${selectedCandidate?.brand === c.brand && selectedCandidate?.article === c.article ? 'bg-muted' : ''}`}
                      onClick={() => loadDetails(c)}
                    >
                      <td className="p-2 text-sm font-semibold">{c.brand}</td>
                      <td className="p-2 font-mono text-sm">{c.article}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="p-6 text-center text-muted-foreground text-sm"
                    >
                      {t('tecdoc_manual_hint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 flex flex-col h-full min-h-0">
        {selectedCandidate ? (
          <Card className="flex-1 min-h-0 overflow-y-auto">
            <CardContent className="pt-6 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('tecdoc_manual_bind_title')}
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder={t('products_search')}
                    value={sku}
                    onChange={(e) => searchSku(e.target.value)}
                    className="text-xs"
                  />
                </div>
                {skuResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
                    {skuResults.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 hover:bg-muted/30 border-b last:border-0 text-xs cursor-pointer"
                        onClick={() => doBind(item.id)}
                      >
                        <span>
                          {item.article} · {item.brand || '—'} ·{' '}
                          {item.name || ''}
                        </span>
                        <Button size="sm" variant="outline" disabled={binding}>
                          {binding ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            t('tecdoc_manual_bind')
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr />
              <div className="text-lg font-bold">
                {selectedCandidate.brand} · {selectedCandidate.article}
              </div>

              {details?.info?.text && (
                <div className="text-sm text-muted-foreground">
                  {details.info.text.substring(0, 300)}
                </div>
              )}

              {details?.images?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('tecdoc_manual_images')}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {details.images.map((img: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-sm">
                        {img.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {details?.crosses?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('tecdoc_manual_crosses')} ({details.crosses.length})
                  </p>
                  <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
                    {details.crosses.map((c: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-sm">
                        {c.oem || c.article}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {details?.vehicles?.length > 0 &&
                (() => {
                  const vehicles = details.vehicles as any[]
                  const brands = [
                    ...new Set(
                      vehicles.map((v: any) => v.brand).filter(Boolean),
                    ),
                  ].sort()
                  const models = [
                    ...new Set(
                      vehicles
                        .filter(
                          (v: any) => !brandFilter || v.brand === brandFilter,
                        )
                        .map((v: any) => v.model)
                        .filter(Boolean),
                    ),
                  ].sort()
                  const filtered = vehicles.filter(
                    (v: any) =>
                      (!brandFilter || v.brand === brandFilter) &&
                      (!modelFilter || v.model === modelFilter),
                  )
                  return (
                    <div className="flex-1 flex flex-col min-h-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex-shrink-0">
                        {t('tecdoc_manual_vehicles')} ({filtered.length})
                      </p>
                      <div className="flex gap-2 mb-2 flex-shrink-0">
                        <Select
                          value={brandFilter}
                          onValueChange={(v) => {
                            setBrandFilter(v === 'all' ? '' : v)
                            setModelFilter('')
                          }}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Марка" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            {brands.map((b: string) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={modelFilter}
                          onValueChange={(v) =>
                            setModelFilter(v === 'all' ? '' : v)
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Модель" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            {models.map((m: string) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 sticky top-0">
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Марка
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground">
                                Модель
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Модификация
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Годы
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((v: any, i: number) => (
                              <tr
                                key={i}
                                className="border-b last:border-0 hover:bg-muted/30"
                              >
                                <td className="p-1.5 font-semibold">
                                  {v.brand || '—'}
                                </td>
                                <td className="p-1.5 text-muted-foreground">
                                  {v.model || '—'}
                                </td>
                                <td className="p-1.5">{v.mod || '—'}</td>
                                <td className="p-1.5 text-muted-foreground text-sm">
                                  {v.years || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed flex-1 min-h-0">
            <CardContent className="pt-6 flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {t('tecdoc_manual_hint')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function SettingsTab({ t }: { t: (k: string) => string }) {
  const queryClient = useQueryClient()
  const [apiUrl, setApiUrl] = useState('')
  const [dbHost, setDbHost] = useState('')
  const [dbName, setDbName] = useState('')
  const [dbUser, setDbUser] = useState('')
  const [dbPass, setDbPass] = useState('')
  const [dbHasPass, setDbHasPass] = useState(false)
  const [dbPassLen, setDbPassLen] = useState(0)

  const { data } = useQuery({
    queryKey: ['tecdoc-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/settings')
      return data
    },
  })

  useEffect(() => {
    if (data) {
      setApiUrl(data.api_url || '')
      setDbHost(data.db_host || '')
      setDbName(data.db_name || '')
      setDbUser(data.db_user || '')
      setDbPass('')
      setDbHasPass(data.db_has_pass || false)
      setDbPassLen(data.db_pass_length || 0)
    }
  }, [data])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success(t('copied') || 'Copied')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        api_url: apiUrl,
        db_host: dbHost,
        db_name: dbName,
        db_user: dbUser,
      }
      if (dbPass) payload.db_pass = dbPass
      await api.put('/admin/tecdoc/settings', payload)
    },
    onSuccess: () => {
      toast.success(t('tecdoc_settings_saved'))
      queryClient.invalidateQueries({ queryKey: ['tecdoc-settings'] })
    },
    onError: () => toast.error(t('save_error')),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/settings/test')
      return data
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(
          `${t('tecdoc_test_ok')}${res.latency_ms ? ` (${res.latency_ms}ms)` : ''}`,
        )
      } else if (
        res.message?.includes('403') ||
        res.message?.includes('Forbidden')
      ) {
        toast.error(t('tecdoc_test_403'))
      } else {
        toast.error(t('tecdoc_test_fail'))
      }
    },
    onError: () => toast.error(t('tecdoc_test_fail')),
  })

  const Field = ({
    label,
    value,
    onChange,
    type = 'text',
    passLen,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    type?: string
    passLen?: number
  }) => (
    <div>
      <label className="text-sm text-muted-foreground mb-1 block">
        {label}
      </label>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={passLen ? '•'.repeat(passLen) : undefined}
          className="pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => copyToClipboard(value)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('copy') || 'Copy'}
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Card className="max-w-md">
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tecdoc_api_title')}
        </p>
        <Field
          label={t('tecdoc_settings_url')}
          value={apiUrl}
          onChange={setApiUrl}
        />

        <hr />
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('tecdoc_settings_db_title')}
        </p>
        <Field
          label={t('tecdoc_settings_db_host')}
          value={dbHost}
          onChange={setDbHost}
        />
        <Field
          label={t('tecdoc_settings_db_name')}
          value={dbName}
          onChange={setDbName}
        />
        <Field
          label={t('tecdoc_settings_db_user')}
          value={dbUser}
          onChange={setDbUser}
        />
        <Field
          label={t('tecdoc_settings_db_pass')}
          value={dbPass}
          onChange={setDbPass}
          type="password"
          passLen={dbPassLen}
        />

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="gap-2"
          >
            {testMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            {t('tecdoc_settings_test')}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('tecdoc_settings_save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TecDocPageInner() {
  const t = useTranslations('admin')
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') || 'dashboard') as Tab
  const prevRunning = React.useRef(false)

  const { data: batchState } = useQuery({
    queryKey: ['tecdoc-batch-status'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/batch/status')
      return data as {
        running: boolean
        task_id: string | null
        processed: number
        total: number
        size: number
      }
    },
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  })

  useEffect(() => {
    if (!batchState) return
    if (batchState.running && !prevRunning.current) {
      sonnerToast.loading(t('tecdoc_batch_progress'), { id: 'tecdoc-batch' })
    } else if (batchState.running) {
      sonnerToast.loading(
        `${t('tecdoc_batch_progress')}: ${batchState.processed} / ${batchState.total}`,
        { id: 'tecdoc-batch' },
      )
    } else if (!batchState.running && prevRunning.current) {
      sonnerToast.success(t('tecdoc_batch_completed'), {
        id: 'tecdoc-batch',
        duration: 5000,
      })
    }
    prevRunning.current = batchState.running
  }, [batchState, t])

  return (
    <div className="p-6">
      {tab === 'dashboard' && <DashboardTab t={t} />}
      {tab === 'batch' && <BatchTab t={t} />}
      {tab === 'manual' && <ManualTab t={t} />}
      {tab === 'settings' && <SettingsTab t={t} />}
    </div>
  )
}

export default function TecDocPage() {
  return <TecDocPageInner />
}

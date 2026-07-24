'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Save,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Minus,
  Plus,
  LineChart,
  SlidersHorizontal,
  Percent,
  Search,
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { CardInput } from '@/components/ui/input-otp'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useTheme } from '@wrksz/themes/client'
import * as echarts from 'echarts'

interface CategoryRule {
  category_id: number
  category_name: string
  margin_percent: number | null
  is_active: boolean
}

interface HistoryItem {
  id: number
  price_rule_id: number
  old_percent: number
  new_percent: number
  changed_at: string
}

interface GeneralRule {
  id: number
  type: string
  margin_percent: number
  is_active: boolean
}

function EChart({
  option,
  style,
}: {
  option: any
  style: React.CSSProperties
}) {
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!divRef.current) return
    const instance = echarts.init(divRef.current)
    instance.setOption(option)
    return () => {
      instance.dispose()
    }
  }, [])

  useEffect(() => {
    const dom = divRef.current
    if (!dom) return
    const instance = echarts.getInstanceByDom(dom)
    if (instance) instance.setOption(option)
  }, [option])

  return <div ref={divRef} style={style} />
}

export default function PricingPageClient() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [generalMargin, setGeneralMargin] = useState<number>(0)
  const [otpDigits, setOtpDigits] = useState<string[]>(['0', '0', '0'])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([null, null, null])
  const [categoryMargins, setCategoryMargins] = useState<
    Record<number, number | null>
  >({})
  const [categoryOtp, setCategoryOtp] = useState<Record<number, string[]>>({})
  const [taskStatus, setTaskStatus] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [chartType, setChartType] = useState<'general' | number>('general')
  const [catPage, setCatPage] = useState(1)
  const [catPageSize, setCatPageSize] = useState(25)
  const [catSearch, setCatSearch] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: generalRule, isLoading: generalLoading } =
    useQuery<GeneralRule>({
      queryKey: ['pricing-general'],
      queryFn: async () => {
        const res = await api.get('/admin/pricing/general')
        return res.data
      },
    })

  const { data: catData, isLoading: categoriesLoading } = useQuery<{
    items: CategoryRule[]
    total: number
  }>({
    queryKey: ['pricing-categories', catPage, catPageSize, catSearch],
    queryFn: async () => {
      const params: any = { page: catPage, page_size: catPageSize }
      if (catSearch) params.search = catSearch
      const res = await api.get('/admin/pricing/categories', { params })
      return res.data
    },
  })
  const categoryRules = useMemo(() => catData?.items ?? [], [catData])
  const catTotal = catData?.total ?? 0
  const catTotalPages = Math.ceil(catTotal / catPageSize)

  interface AppliedSnapshot {
    id: number
    applied_at: string
    general_margin: number | null
    category_margins: Record<string, number> | null
  }

  const { data: appliedHistory } = useQuery<AppliedSnapshot[]>({
    queryKey: ['pricing-applied-history'],
    queryFn: async () => {
      const res = await api.get('/admin/pricing/applied-history')
      return res.data
    },
    enabled: !!generalRule,
  })

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ['pricing-history', chartType],
    queryFn: async () => {
      const params =
        chartType === 'general'
          ? { type: 'general' }
          : { type: 'category', category_id: chartType }
      const res = await api.get('/admin/pricing/history', { params })
      return res.data
    },
    enabled: !!generalRule,
  })

  useEffect(() => {
    if (generalRule) {
      setGeneralMargin(generalRule.margin_percent || 0)
    }
  }, [generalRule])

  useEffect(() => {
    const str = String(Math.min(100, Math.max(0, generalMargin))).padStart(
      3,
      '0',
    )
    setOtpDigits(str.split(''))
  }, [generalMargin])

  useEffect(() => {
    if (!categoryRules.length) return
    const map: Record<number, number | null> = {}
    const otpMap: Record<number, string[]> = {}
    categoryRules.forEach((c) => {
      map[c.category_id] = c.margin_percent ?? null
      const num = Math.min(100, Math.max(0, c.margin_percent ?? 0))
      otpMap[c.category_id] = String(num).padStart(3, '0').split('')
    })
    setCategoryMargins((prev) => ({ ...prev, ...map }))
    setCategoryOtp((prev) => ({ ...prev, ...otpMap }))
  }, [categoryRules])

  useEffect(() => {
    if (!taskId) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/admin/pricing/task-status/${taskId}`)
        setTaskStatus(res.data.status)
        if (res.data.status === 'SUCCESS' || res.data.status === 'FAILURE') {
          clearInterval(interval)
          if (res.data.status === 'SUCCESS') {
            toast.success(t('pricing_applied_success'))
          } else {
            toast.error(t('pricing_applied_error'))
          }
        }
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [taskId])

  const saveAll = useMutation({
    mutationFn: async () => {
      await api.put('/admin/pricing/general', { margin_percent: generalMargin })
      const rules = Object.entries(categoryMargins)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([category_id, margin_percent]) => ({
          category_id: Number(category_id),
          margin_percent,
        }))
      await api.post('/admin/pricing/categories/bulk', { rules })
    },
    onSuccess: () => {
      toast.success(t('pricing_saved'))
      queryClient.invalidateQueries({ queryKey: ['pricing-general'] })
      queryClient.invalidateQueries({ queryKey: ['pricing-categories'] })
      queryClient.invalidateQueries({ queryKey: ['pricing-history'] })
    },
    onError: () => toast.error(t('pricing_save_error')),
  })

  const applyMargins = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/pricing/apply')
      return res.data
    },
    onSuccess: (data) => {
      setTaskId(data.task_id)
      setTaskStatus('PENDING')
      queryClient.invalidateQueries({ queryKey: ['pricing-applied-history'] })
      toast.success(t('pricing_queued'))
    },
    onError: () => toast.error(t('pricing_apply_error')),
  })

  useEffect(() => {
    ;(window as any).__applyPricing = () => applyMargins.mutate()
    ;(window as any).__savePricing = () => saveAll.mutate()
    ;(window as any).__pricingTaskStatus = taskStatus
    ;(window as any).__pricingOtpDigits = otpDigits
    ;(window as any).__pricingSetGeneralMargin = setGeneralMargin
    return () => {
      delete (window as any).__applyPricing
      delete (window as any).__savePricing
      delete (window as any).__pricingTaskStatus
      delete (window as any).__pricingOtpDigits
      delete (window as any).__pricingSetGeneralMargin
    }
  }, [applyMargins.mutate, saveAll.mutate, taskStatus, otpDigits])

  const appliedData = (appliedHistory || []).filter((s) => {
    if (chartType === 'general') return s.general_margin != null
    return s.category_margins && s.category_margins[String(chartType)] != null
  })
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280'
  const chartBg = isDark ? 'transparent' : '#fff'
  const borderColor = isDark ? '#374151' : '#e5e7eb'

  const displayData = appliedData.slice(-20)
  const uniqueCatIds = new Set<number>()
  displayData.forEach((s) => {
    if (s.category_margins) {
      Object.keys(s.category_margins).forEach((k) =>
        uniqueCatIds.add(Number(k)),
      )
    }
  })
  const sortedCatIds = [...uniqueCatIds].sort((a, b) => a - b)
  const CAT_COLORS = [
    '#3b82f6',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
    '#f97316',
  ]

  const series: any[] = [
    {
      name: t('pricing_general'),
      type: 'bar',
      stack: 'total',
      data: displayData.map((s) => s.general_margin ?? 0),
      itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
    },
  ]
  sortedCatIds.forEach((catId, i) => {
    const cat = categoryRules?.find((c) => c.category_id === catId)
    series.push({
      name: cat?.category_name || `#${catId}`,
      type: 'bar',
      stack: 'total',
      data: displayData.map((s) => s.category_margins?.[String(catId)] ?? 0),
      itemStyle: {
        color: CAT_COLORS[i % CAT_COLORS.length],
        borderRadius: [4, 4, 0, 0],
      },
    })
  })

  const chartOption = {
    backgroundColor: chartBg,
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1f2937' : '#fff',
      borderColor: borderColor,
      formatter: (params: any) => {
        const snap = displayData[params[0].dataIndex]
        if (!snap) return ''
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${axisTextColor}">${new Date(snap.applied_at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}</div>`
        if (snap.general_margin != null) {
          html += `<div style="color:${axisTextColor};display:flex;align-items:center;gap:4px;margin-top:2px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e"></span>${t('pricing_general')}: <b>${snap.general_margin}%</b></div>`
        }
        if (snap.category_margins) {
          const cats = categoryRules || []
          Object.entries(snap.category_margins).forEach(([catId, val]) => {
            const cat = cats.find((c) => c.category_id === Number(catId))
            const name = cat ? cat.category_name : `#${catId}`
            const color =
              CAT_COLORS[
                sortedCatIds.indexOf(Number(catId)) % CAT_COLORS.length
              ]
            html += `<div style="color:${axisTextColor};display:flex;align-items:center;gap:4px;margin-top:2px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color}"></span>${name}: <b>${val}%</b></div>`
          })
        }
        return html
      },
    },
    grid: { top: 20, right: 20, bottom: 50, left: 50 },
    xAxis: {
      type: 'category' as const,
      data: displayData.map((s) => s.applied_at),
      axisLabel: {
        color: axisTextColor,
        formatter: (value: string) => {
          const d = new Date(value)
          return (
            new Date(value).toLocaleDateString('uk-UA', {
              timeZone: 'Europe/Kyiv',
            }) +
            '\n' +
            new Date(value).toLocaleTimeString('uk-UA', {
              timeZone: 'Europe/Kyiv',
              hour: '2-digit',
              minute: '2-digit',
            })
          )
        },
      },
      axisLine: { lineStyle: { color: borderColor } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: axisTextColor, formatter: '{value}%' },
      splitLine: { lineStyle: { color: borderColor } },
    },
    series,
  }

  const statusBadge = () => {
    if (!taskStatus) return null
    const map: Record<string, { label: string; color: string; icon: any }> = {
      PENDING: {
        label: t('status_pending'),
        color: 'bg-yellow-500 text-white',
        icon: Clock,
      },
      PROGRESS: {
        label: t('status_progress'),
        color: 'bg-orange-500 text-white',
        icon: Loader2,
      },
      SUCCESS: {
        label: t('status_success'),
        color: 'bg-green-500 text-white',
        icon: CheckCircle2,
      },
      FAILURE: {
        label: t('status_error'),
        color: 'bg-red-500 text-white',
        icon: XCircle,
      },
    }
    const s = map[taskStatus] || {
      label: taskStatus,
      color: 'bg-gray-500 text-white',
      icon: AlertTriangle,
    }
    const Icon = s.icon
    return (
      <Badge className={`${s.color} border-0 text-sm gap-1`}>
        <Icon className="w-3.5 h-3.5" />
        {s.label}
      </Badge>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <LineChart className="w-5 h-5 text-primary" />
            {t('pricing_history')}
            {statusBadge()}
          </CardTitle>
          <Select
            value={String(chartType)}
            onValueChange={(v) =>
              setChartType(v === 'general' ? 'general' : Number(v))
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t('pricing_select_category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">{t('pricing_general')}</SelectItem>
              {(categoryRules || []).map((c) => (
                <SelectItem key={c.category_id} value={String(c.category_id)}>
                  {c.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {mounted && <EChart option={chartOption} style={{ height: 300 }} />}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('search')}
              value={catSearch}
              onChange={(e) => {
                setCatSearch(e.target.value)
                setCatPage(1)
              }}
            />
          </div>
          <Select
            value={String(catPageSize)}
            onValueChange={(v) => {
              setCatPageSize(Number(v))
              setCatPage(1)
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground w-[60px]">
                  ID
                </th>
                <th className="text-left p-3 font-medium text-muted-foreground">
                  {t('pricing_category')}
                </th>
                <th className="text-left p-3 font-medium text-muted-foreground">
                  {t('pricing_margin')} %
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryRules.map((cat) => {
                const digits = categoryOtp[cat.category_id] || ['0', '0', '0']
                const updateVal = (newDigits: string[]) => {
                  setCategoryOtp((prev) => ({
                    ...prev,
                    [cat.category_id]: newDigits,
                  }))
                  const num = Math.min(
                    100,
                    Math.max(0, Number(newDigits.join(''))),
                  )
                  setCategoryMargins((prev) => ({
                    ...prev,
                    [cat.category_id]: num,
                  }))
                }
                return (
                  <tr
                    key={cat.category_id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3 font-mono text-xs">{cat.category_id}</td>
                    <td className="p-3 text-sm">{cat.category_name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => {
                            const current =
                              categoryMargins[cat.category_id] || 0
                            const newVal = Math.max(0, current - 1)
                            updateVal(String(newVal).padStart(3, '0').split(''))
                          }}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <div className="flex items-center gap-0.5">
                          <CardInput
                            maxLength={3}
                            value={digits.join('')}
                            onChange={(val) => {
                              const padded = val.padEnd(3, '0').split('').slice(0, 3)
                              updateVal(padded)
                            }}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => {
                            const current =
                              categoryMargins[cat.category_id] || 0
                            const newVal = Math.min(100, current + 1)
                            updateVal(String(newVal).padStart(3, '0').split(''))
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-base font-semibold text-foreground">
                          %
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {categoryRules.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {t('pricing_empty')}
            </div>
          )}
        </div>

        {catTotalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {(catPage - 1) * catPageSize + 1}–
              {Math.min(catPage * catPageSize, catTotal)} of {catTotal}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={catPage === 1}
                onClick={() => setCatPage(catPage - 1)}
              >
                {t('prev_page')}
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(catTotalPages, 7) }, (_, i) => {
                  let p: number
                  if (catTotalPages <= 7) {
                    p = i + 1
                  } else if (catPage <= 4) {
                    p = i + 1
                  } else if (catPage >= catTotalPages - 3) {
                    p = catTotalPages - 6 + i
                  } else {
                    p = catPage - 3 + i
                  }
                  return (
                    <Button
                      key={p}
                      variant={p === catPage ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCatPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={catPage >= catTotalPages}
                onClick={() => setCatPage(catPage + 1)}
              >
                {t('next_page')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

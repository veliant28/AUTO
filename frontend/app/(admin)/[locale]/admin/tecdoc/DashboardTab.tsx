'use client'

import { useTheme } from '@wrksz/themes/client'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BarChart3, Target } from 'lucide-react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/lib/api'
import {
  DashboardData,
  BrandItem,
  PieLabelLayoutParams,
  ResetTimer,
  shiftPieLabelAlongArcNearEdge,
} from './tecdocHelpers'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

export default function DashboardTab({ t }: { t: (k: string) => string }) {
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
        itemStyle: { borderRadius: 4, borderColor, borderWidth: 2 },
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

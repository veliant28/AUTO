'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface DoughnutChartProps {
  labels: string[]
  values: number[]
  colors?: string[]
  height?: number
}

const DEFAULT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]

export default function DoughnutChart({
  labels,
  values,
  colors = DEFAULT_COLORS,
  height = 160,
}: DoughnutChartProps) {
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'item' as const },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontSize: 10, formatter: '{b}' },
          emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
          data: labels.map((label, i) => ({
            name: label,
            value: values[i],
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    }),
    [labels, values, colors],
  )

  if (values.every((v) => v === 0)) {
    return (
      <div className="flex items-center justify-center h-[160px] text-muted-foreground text-sm">
        Нет данных
      </div>
    )
  }

  return <ReactECharts option={option} style={{ height }} />
}

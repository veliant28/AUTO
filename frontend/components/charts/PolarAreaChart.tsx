'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface PolarAreaChartProps {
  labels: string[]
  values: number[]
  height?: number
}

export default function PolarAreaChart({
  labels,
  values,
  height = 160,
}: PolarAreaChartProps) {
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'item' as const },
      angleAxis: {
        type: 'category' as const,
        data: labels,
        axisLabel: { fontSize: 11 },
      },
      radiusAxis: { min: 0, axisLabel: { fontSize: 11 } },
      polar: {},
      series: [
        {
          type: 'bar',
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: `hsl(${(i / labels.length) * 360}, 60%, 55%)`,
              borderRadius: [2, 2, 0, 0],
            },
          })),
          coordinateSystem: 'polar',
          barMaxWidth: 20,
        },
      ],
    }),
    [labels, values],
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

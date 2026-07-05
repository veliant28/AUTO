'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface BarChartProps {
  xData: string[]
  yData: number[]
  color?: string
  name?: string
  height?: number
}

export default function BarChart({
  xData,
  yData,
  color = '#3b82f6',
  name = '',
  height = 160,
}: BarChartProps) {
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      grid: { left: 8, right: 8, top: 16, bottom: 20 },
      xAxis: {
        type: 'category' as const,
        data: xData,
        axisLabel: {
          fontSize: 12,
          interval: 0,
          rotate: xData.length > 7 ? 45 : 0,
        },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        splitLine: { lineStyle: { type: 'dashed' } },
      },
      series: [
        {
          type: 'bar',
          name,
          data: yData,
          itemStyle: { color, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 24,
        },
      ],
    }),
    [xData, yData, color, name],
  )

  return <ReactECharts option={option} style={{ height }} />
}

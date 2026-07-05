'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface LineAreaChartProps {
  xData: string[]
  yData: number[]
  color?: string
  name?: string
  height?: number
  formatY?: (v: number) => string
}

export default function LineAreaChart({
  xData,
  yData,
  color = '#22c55e',
  name = '',
  height = 160,
  formatY,
}: LineAreaChartProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis' as const,
        valueFormatter: (v: number) =>
          formatY ? formatY(v) : `${v.toLocaleString()} ₴`,
      },
      grid: { left: 4, right: 4, top: 8, bottom: 16 },
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
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          name,
          data: yData,
          itemStyle: { color },
          lineStyle: { width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color },
                { offset: 1, color: `${color}20` },
              ],
            },
          },
          symbol: 'circle',
          symbolSize: 6,
        },
      ],
    }),
    [xData, yData, color, name, formatY],
  )

  return <ReactECharts option={option} style={{ height }} />
}

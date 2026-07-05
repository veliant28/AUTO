'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from '@wrksz/themes/client'

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
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const textColor = isDark ? '#e5e7eb' : '#666'

  const option = useMemo(
    () => ({
      tooltip: { trigger: 'axis' as const },
      grid: { left: 4, right: 4, top: 8, bottom: 16 },
      xAxis: {
        type: 'category' as const,
        data: xData,
        axisLabel: {
          fontSize: 12,
          interval: 0,
          rotate: xData.length > 7 ? 45 : 0,
          color: textColor,
        },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        splitLine: {
          lineStyle: { type: 'dashed', color: isDark ? '#374151' : '#e5e7eb' },
        },
        axisLabel: { fontSize: 11, color: textColor },
      },
      series: [
        {
          type: 'bar',
          name,
          data: yData,
          itemStyle: { color, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 32,
        },
      ],
    }),
    [xData, yData, color, name, isDark, textColor],
  )

  return <ReactECharts option={option} style={{ height }} />
}

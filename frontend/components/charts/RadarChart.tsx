'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface RadarIndicator {
  name: string
  max: number
}

interface RadarChartProps {
  indicators: RadarIndicator[]
  values: number[]
  name?: string
  color?: string
  height?: number
}

export default function RadarChart({
  indicators,
  values,
  name = '',
  color = '#8b5cf6',
  height = 180,
}: RadarChartProps) {
  const option = useMemo(
    () => ({
      radar: {
        indicator: indicators,
        radius: '65%',
        splitNumber: 3,
        axisName: { fontSize: 9, color: '#666' },
        splitArea: {
          areaStyle: {
            color: [
              'rgba(139,92,246,0.02)',
              'rgba(139,92,246,0.05)',
              'rgba(139,92,246,0.08)',
            ],
          },
        },
      },
      series: [
        {
          type: 'radar',
          data: [{ name, value: values, areaStyle: { color: `${color}40` } }],
          symbol: 'none',
          lineStyle: { width: 2, color },
          itemStyle: { color },
        },
      ],
    }),
    [indicators, values, name, color],
  )

  return <ReactECharts option={option} style={{ height }} />
}

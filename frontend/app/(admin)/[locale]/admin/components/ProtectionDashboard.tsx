'use client'

import React, { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { ShieldAlert, Ban, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import BarChart from '@/components/charts/BarChart'
import LineAreaChart from '@/components/charts/LineAreaChart'
import DoughnutChart from '@/components/charts/DoughnutChart'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

const THREAT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#a855f7',
  '#3b82f6',
  '#22c55e',
]

export default function ProtectionDashboard() {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const searchParams = useSearchParams()

  const period = searchParams.get('period') || 'month'
  const isRealtime = searchParams.get('realtime') === '1'

  const { data, isLoading } = useQuery({
    queryKey: ['admin-protection-dashboard', period],
    queryFn: async () => {
      const { data } = await api.get('/admin/protection/dashboard', {
        params: { period },
      })
      return data
    },
    enabled: !!user,
    refetchInterval: isRealtime ? 10000 : false,
  })

  // Auto-bans count (lightweight)
  const { data: abuseData } = useQuery({
    queryKey: ['admin-protection-abuse-summary'],
    queryFn: async () => {
      const { data } = await api.get('/admin/protection/abuse-stats')
      return data
    },
    enabled: !!user,
    refetchInterval: isRealtime ? 30000 : false,
  })

  const kpiCards = useMemo(
    () => [
      {
        title: t('protection_total_threats'),
        value: data?.total_threats ?? 0,
        icon: AlertTriangle,
        bg: 'bg-red-100 dark:bg-red-900/30',
        iconColor: 'text-red-600',
      },
      {
        title: t('protection_active_bans'),
        value: data?.active_bans ?? 0,
        icon: Ban,
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        iconColor: 'text-orange-600',
      },
      {
        title: t('protection_blocked_today'),
        value: data?.blocked_today ?? 0,
        icon: ShieldAlert,
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        iconColor: 'text-yellow-600',
      },
      {
        title: 'Авто-баны за 24ч',
        value: abuseData?.recent_auto_bans ?? 0,
        icon: Ban,
        bg: 'bg-purple-100 dark:bg-purple-900/30',
        iconColor: 'text-purple-600',
      },
      {
        title: t('protection_whitelisted'),
        value: data?.whitelisted_count ?? 0,
        icon: ShieldCheck,
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600',
      },
    ],
    [data, abuseData, t],
  )

  // Threat types data for DoughnutChart
  const threatTypesData = useMemo(() => {
    if (!data?.threats_by_type?.length)
      return { labels: [], values: [], colors: [] }
    return {
      labels: data.threats_by_type.map(
        (item: any) => t('event_' + item.type) || item.type,
      ),
      values: data.threats_by_type.map((item: any) => item.count),
      colors: THREAT_COLORS.slice(0, data.threats_by_type.length),
    }
  }, [data, t])

  // Threats by day for BarChart
  const threatsByDayData = useMemo(() => {
    if (!data?.threats_by_day?.length) return { dates: [], counts: [] }
    return {
      dates: data.threats_by_day.map((d: any) => {
        const parts = d.date.split('-')
        return `${parts[2]}.${parts[1]}`
      }),
      counts: data.threats_by_day.map((d: any) => d.count),
    }
  }, [data])

  // Timeline for LineAreaChart
  const timelineData = useMemo(() => {
    if (!data?.threats_timeline?.length) return { times: [], counts: [] }
    return {
      times: data.threats_timeline.map((d: any) => d.time),
      counts: data.threats_timeline.map((d: any) => d.count),
    }
  }, [data])

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`${card.bg} p-3 rounded-lg shrink-0`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold">{fmt(card.value)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {card.title}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threats by day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t('protection_threats_by_day')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {threatsByDayData.dates.length > 0 ? (
              <BarChart
                xData={threatsByDayData.dates}
                yData={threatsByDayData.counts}
                color="#ef4444"
                height={250}
              />
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                {t('no_data')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Threat types */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t('protection_threat_types')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {threatTypesData.labels.length > 0 ? (
              <DoughnutChart
                labels={threatTypesData.labels}
                values={threatTypesData.values}
                colors={threatTypesData.colors}
                height={250}
              />
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                {t('no_data')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Threat timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t('protection_threats_timeline')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timelineData.times.length > 0 ? (
              <LineAreaChart
                xData={timelineData.times}
                yData={timelineData.counts}
                color="#f97316"
                height={250}
                formatY={(v: number) => String(v)}
              />
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                {t('no_data')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

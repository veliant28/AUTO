'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { useTheme } from '@wrksz/themes/client'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Briefcase,
  Crown,
  Eye,
  UserCog,
  UserRound,
  UserX,
  Users,
} from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { formatDateTime, startOfDayInTz } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { useTimezone } from '@/hooks/useTimezone'
import ChartErrorBoundary from '@/components/ChartErrorBoundary'
import ClientDetailModal from './ClientDetailModal'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const PAGE_SIZE = 50

// 5 ролей + анонимы — все группы и в карточках, и в графике
const ALL_GROUPS = ['retail', 'b2b', 'operator', 'manager', 'admin', 'anon']

const GROUP_META: Record<
  string,
  { icon: any; bg: string; iconColor: string; color: string }
> = {
  // Цвета соответствуют бейджам ролей (ROLE_BADGE_COLORS); аноним — фиолетовый
  retail: {
    icon: Users,
    bg: 'bg-gray-100 dark:bg-gray-900/30',
    iconColor: 'text-gray-600',
    color: '#6b7280',
  },
  b2b: {
    icon: Briefcase,
    bg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600',
    color: '#22c55e',
  },
  operator: {
    icon: UserCog,
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600',
    color: '#f97316',
  },
  manager: {
    icon: UserRound,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600',
    color: '#3b82f6',
  },
  admin: {
    icon: Crown,
    bg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600',
    color: '#ef4444',
  },
  anon: {
    icon: UserX,
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600',
    color: '#a855f7',
  },
}

// Цвета ролевых бейджей — как в сайдбаре админки
const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

interface MonitorClientItem {
  client_id: string
  is_anonymous: boolean
  name: string | null
  email: string | null
  phone: string | null
  role: string | null
  status: 'online' | 'offline'
  first_seen: string | null
  last_seen: string | null
  ip: string | null
  avatar_index: number | null
}

interface MonitorClientsResponse {
  items: MonitorClientItem[]
  total: number
  page: number
  page_size: number
}

interface MonitorKpi {
  groups: Record<
    string,
    {
      count: number
      clients: Array<{
        name: string | null
        avatar_index: number | null
        client_id: string
      }>
    }
  >
}

interface MonitorChartHour {
  hour: number
  groups: Record<string, { count: number; clients: (string | null)[] }>
}

interface MonitorChart {
  date: string
  hours: MonitorChartHour[]
}

const columnHelper = createColumnHelper<MonitorClientItem>()

export default function MonitorTab() {
  const t = useTranslations('admin')
  const tz = useTimezone()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [monitorDate, setMonitorDate] = useState<Date | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Window-bridge для топ-бара (календарь/сброс) — паттерн DashboardTab
  useEffect(() => {
    const win = window as any
    win.__monitorSetDate = (d: Date | undefined) => setMonitorDate(d)
    return () => {
      delete win.__monitorSetDate
    }
  }, [])
  useEffect(() => {
    ;(window as any).__monitorDate = monitorDate
  }, [monitorDate])

  const isArchive = !!monitorDate
  // «Сегодня» в tz админки; пересчитывается на каждом рендере, поэтому
  // после 00:00 следующий refetch автоматически перерисует график заново.
  const todayKey = format(startOfDayInTz(tz), 'yyyy-MM-dd')
  const dateKey = monitorDate ? format(monitorDate, 'yyyy-MM-dd') : todayKey

  useEffect(() => {
    setPage(0)
  }, [dateKey])

  const kpi = useQuery({
    queryKey: ['admin-monitor-kpi', dateKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorKpi>(
        isArchive ? `/admin/monitor/kpi?date=${dateKey}` : '/admin/monitor/kpi',
      )
      return data
    },
    refetchInterval: isArchive ? false : 10000,
  })

  const chart = useQuery({
    queryKey: ['admin-monitor-chart', dateKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorChart>(
        `/admin/monitor/chart?date=${dateKey}`,
      )
      return data
    },
    refetchInterval: isArchive ? false : 30000,
  })

  const clients = useQuery({
    queryKey: ['admin-monitor-clients', dateKey, page],
    queryFn: async () => {
      const { data } = await api.get<MonitorClientsResponse>(
        isArchive
          ? `/admin/monitor/archive?date=${dateKey}&page=${page + 1}&page_size=${PAGE_SIZE}`
          : `/admin/monitor/online?page=${page + 1}&page_size=${PAGE_SIZE}`,
      )
      return data
    },
    refetchInterval: isArchive ? false : 10000,
  })

  // ── График ECharts: 5 линий по группам, 0-24ч ─────────────────────────
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280'
  const chartBg = isDark ? 'transparent' : '#fff'
  const borderColor = isDark ? '#374151' : '#e5e7eb'

  const chartOption = useMemo(() => {
    const hours = chart.data?.hours ?? []
    const series = ALL_GROUPS.map((g) => ({
      name: t(g),
      type: 'line' as const,
      smooth: true,
      symbol: 'none',
      data: hours.map((h) => h.groups[g]?.count ?? 0),
      areaStyle: { opacity: 0.12 },
      lineStyle: { width: 2, color: GROUP_META[g].color },
      itemStyle: { color: GROUP_META[g].color },
      emphasis: { focus: 'series' as const },
    }))
    return {
      backgroundColor: chartBg,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#e5e7eb' : '#1f2937', fontSize: 12 },
        formatter: (params: any[]) => {
          const hour = hours[params?.[0]?.dataIndex]
          if (!hour) return ''
          const lines = [`<b>${params[0].axisValue}</b>`]
          for (const g of ALL_GROUPS) {
            const slot = hour.groups[g]
            if (!slot || slot.count === 0) continue
            const names = slot.clients
              .map((n) => n || t('monitor_anonymous'))
              .join(', ')
            const extra =
              slot.count > slot.clients.length
                ? ` +${slot.count - slot.clients.length}`
                : ''
            lines.push(
              `<div style="margin-top:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GROUP_META[g].color};margin-right:6px"></span><b>${t(g)}</b>: ${slot.count}</div>`,
            )
            if (names) {
              lines.push(
                `<div style="color:${axisTextColor};padding-left:14px;max-width:420px;white-space:normal">${names}${extra}</div>`,
              )
            }
          }
          return lines.join('')
        },
      },
      legend: {
        data: ALL_GROUPS.map((g) => t(g)),
        textStyle: { color: axisTextColor },
        top: 0,
      },
      grid: { top: 40, right: 20, bottom: 30, left: 40 },
      xAxis: {
        type: 'category' as const,
        data: hours.map((h) => `${h.hour}:00`),
        axisLabel: { color: axisTextColor },
        axisLine: { lineStyle: { color: borderColor } },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: axisTextColor },
        splitLine: { lineStyle: { color: borderColor } },
      },
      series,
    }
  }, [chart.data, isDark, t, chartBg, axisTextColor, borderColor])

  // ── Таблица ───────────────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      columnHelper.accessor('client_id', {
        header: t('monitor_client_id'),
        size: 80,
        cell: (info) => {
          const v = info.getValue()
          return (
            <span className="font-mono">
              {v.startsWith('u') ? v.slice(1) : v.slice(1, 9)}
            </span>
          )
        },
      }),
      columnHelper.accessor('name', {
        header: t('monitor_client'),
        cell: (info) => info.getValue() || t('monitor_anonymous'),
      }),
      columnHelper.accessor('phone', {
        header: t('monitor_phone'),
        size: 180,
        cell: (info) => (
          <span className="font-mono text-sm">
            {formatPhone(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('role', {
        header: t('role_label'),
        cell: (info) => {
          const role = info.getValue()
          if (!role) return '—'
          return (
            <Badge
              className={`${ROLE_BADGE_COLORS[role] || 'bg-gray-500 text-white'} border-0 text-sm`}
            >
              {t(role) || role}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: t('monitor_status'),
        cell: (info) => {
          const online = info.getValue() === 'online'
          return (
            <Badge
              className={`${online ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'} border-0 text-sm`}
            >
              {online ? t('monitor_online') : t('monitor_offline')}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('first_seen', {
        header: t('monitor_date'),
        cell: (info) => formatDateTime(info.getValue(), tz),
      }),
      columnHelper.accessor('ip', {
        header: t('monitor_ip'),
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue() || '—'}</span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedKey(row.original.client_id)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('monitor_view')}</TooltipContent>
            </Tooltip>
          </div>
        ),
      }),
    ],
    [t, tz],
  )

  const table = useReactTable({
    data: clients.data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    state: { pagination: { pageIndex: page, pageSize: PAGE_SIZE } },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const next = updater({ pageIndex: page, pageSize: PAGE_SIZE })
        setPage(next.pageIndex)
      }
    },
    pageCount: Math.ceil((clients.data?.total || 0) / PAGE_SIZE),
  })

  return (
    <div className="space-y-4">
      {/* 6 КИП-карточек: 5 групп + анонимы */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {ALL_GROUPS.map((g) => {
          const meta = GROUP_META[g]
          const group = kpi.data?.groups?.[g]
          const count = group?.count ?? 0
          return (
            <Card key={g}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`${meta.bg} p-3 rounded-lg shrink-0`}>
                  <meta.icon className={`w-5 h-5 ${meta.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t(g)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* График на всю ширину */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {t('monitor_chart_title')}
            {isArchive && (
              <Badge className="bg-gray-500 text-white border-0 text-sm">
                {format(monitorDate!, 'dd.MM.yyyy')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chart.isLoading && !chart.data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartErrorBoundary>
              <ReactECharts option={chartOption} style={{ height: 300 }} />
            </ChartErrorBoundary>
          )}
        </CardContent>
      </Card>

      {/* Таблица онлайн/архив клиентов */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">
            {isArchive
              ? t('monitor_table_archive_title')
              : t('monitor_table_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.isLoading && !clients.data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b bg-muted/50">
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            className="text-left p-3 font-medium text-muted-foreground"
                            style={{ width: h.getSize() }}
                          >
                            {flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="p-3">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(clients.data?.total ?? 0) > PAGE_SIZE && (
                <div className="flex items-center justify-between p-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, clients.data?.total ?? 0)}{' '}
                    of {clients.data?.total}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('monitor_prev')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        (page + 1) * PAGE_SIZE >= (clients.data?.total ?? 0)
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      {t('monitor_next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ClientDetailModal
        clientKey={selectedKey}
        open={!!selectedKey}
        onOpenChange={(open) => !open && setSelectedKey(null)}
      />
    </div>
  )
}

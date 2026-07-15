'use client'

import { useState, useMemo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Users, Activity, ShoppingCart, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  startOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfDay,
} from 'date-fns'
import BarChart from '@/components/charts/BarChart'
import LineAreaChart from '@/components/charts/LineAreaChart'
import DoughnutChart from '@/components/charts/DoughnutChart'

const fmt = (n: number) => new Intl.NumberFormat('uk-UA').format(n)

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return phone
  const digits = d.slice(-10)
  return `+38 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
  system: 'bg-gray-500 text-white',
}

const PERIODS = ['day', 'week', 'month', 'year'] as const

function getDateRange(period: string): { from: Date; to: Date } {
  const now = new Date()
  switch (period) {
    case 'day':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'week':
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) }
    case 'month':
      return { from: startOfMonth(now), to: endOfDay(now) }
    case 'year':
      return { from: startOfYear(now), to: endOfDay(now) }
    default:
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) }
  }
}

const actionTypeLabels: Record<string, string> = {
  status_change: 'Смена статуса',
  edit: 'Редактирование',
  item_added: 'Товар добавлен',
  item_removed: 'Товар удалён',
}
const actionTypeColors = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444']

export function StaffPageContent() {
  const t = useTranslations('admin')
  const { user, isAuthenticated } = useAuthStore()
  const [period, setPeriod] = useState<string>('month')
  const [customRange, setCustomRange] = useState<
    { from: Date; to: Date } | undefined
  >()
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const range = customRange || getDateRange(period)

  // Register global functions for TopBar buttons
  useEffect(() => {
    const win = window as any
    win.__staffSetPeriod = (p: string) => {
      setPeriod(p)
      setCustomRange(undefined)
    }
    win.__staffSetCustomRange = (r: { from: Date; to: Date } | undefined) =>
      setCustomRange(r)
    win.__staffResetStaff = () => setSelectedStaffId(null)
    return () => {
      delete win.__staffSetPeriod
      delete win.__staffSetCustomRange
      delete win.__staffResetStaff
    }
  }, [])

  // Sync state to window for TopBar polling
  useEffect(() => {
    const win = window as any
    win.__staffPeriod = period
    win.__staffCustomRange = customRange
    win.__staffSelectedStaffId = selectedStaffId
  }, [period, customRange, selectedStaffId])

  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      'admin-staff-stats',
      period,
      customRange?.from?.toISOString(),
      customRange?.to?.toISOString(),
      selectedStaffId,
    ],
    queryFn: async () => {
      const params: any = {
        period,
        from_date: range.from.toISOString(),
        to_date: range.to.toISOString(),
      }
      if (selectedStaffId) params.staff_id = selectedStaffId
      const { data } = await api.get('/admin/staff/stats', { params })
      return data
    },
    enabled: isAuthenticated && ['admin', 'manager'].includes(user?.role ?? ''),
    refetchInterval: 30000,
  })

  const barData = useMemo(() => {
    const list = stats?.staff_list || []
    return {
      labels: list
        .slice(0, 10)
        .map((s: any) => s.name)
        .reverse(),
      values: list
        .slice(0, 10)
        .map((s: any) => s.actions_count)
        .reverse(),
    }
  }, [stats?.staff_list])

  const lineData = useMemo(() => {
    const dates = stats?.actions_by_date?.map((d: any) => d.date.slice(5)) || []
    const counts = stats?.actions_by_date?.map((d: any) => d.count) || []
    return { dates, counts }
  }, [stats?.actions_by_date])

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg shrink-0">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {fmt(stats?.total_actions ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Всего действий</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg shrink-0">
              <ShoppingCart className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {fmt(stats?.total_orders_touched ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Заказов изменено</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg shrink-0">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.staff_members ?? 0}</p>
              <p className="text-xs text-muted-foreground">Сотрудников</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg shrink-0">
              <UserCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.active_staff ?? 0}</p>
              <p className="text-xs text-muted-foreground">Активных</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Staff — grid-cols-4 как KPI */}
      <div className="grid grid-cols-4 gap-4">
        {/* Колонки 1-3: период + графики */}
        <div className="col-span-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-lg font-medium">
                  Действия по сотрудникам
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <BarChart
                  xData={barData.labels}
                  yData={barData.values}
                  color="#3b82f6"
                  height={220}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-lg font-medium">
                  Типы действий
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <DoughnutChart
                  labels={(stats?.actions_by_type || []).map(
                    (t: any) => actionTypeLabels[t.action] || t.action,
                  )}
                  values={(stats?.actions_by_type || []).map(
                    (t: any) => t.count,
                  )}
                  colors={actionTypeColors}
                  height={220}
                />
              </CardContent>
            </Card>
            <Card className="col-span-2">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-lg font-medium">
                  Динамика действий
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <LineAreaChart
                  xData={lineData.dates}
                  yData={lineData.counts}
                  color="#22c55e"
                  height={200}
                  formatY={(v) => v.toLocaleString()}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Колонка 4: Сотрудники */}
        <Card className="self-start">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-medium">Сотрудники</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isLoading ? (
              <div className="space-y-2 mt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-muted animate-pulse rounded"
                  />
                ))}
              </div>
            ) : isError ? (
              <p className="text-sm text-red-500 pt-2">
                Ошибка загрузки данных
              </p>
            ) : !stats?.staff_list?.length ? (
              <p className="text-sm text-muted-foreground pt-2">
                Нет данных за период
              </p>
            ) : (
              <div className="space-y-1">
                {stats.staff_list.map((m: any) => {
                  const sel = selectedStaffId === m.id
                  const rc = ROLE_BADGE[m.group] || 'bg-gray-500 text-white'
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedStaffId(sel ? null : m.id)}
                      className={`w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-lg border transition-colors cursor-pointer
                        ${sel ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90' : 'hover:bg-muted/30'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`text-sm font-medium truncate ${sel ? 'text-primary-foreground' : ''}`}
                          >
                            {m.name}
                          </span>
                          <Badge
                            className={`${rc} border-0 text-sm shrink-0 ml-2`}
                          >
                            {t(m.group)}
                          </Badge>
                        </div>
                        {m.phone && (
                          <p
                            className={`text-xs font-mono mt-0.5 ${sel ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                          >
                            {formatPhone(m.phone)}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Wrapper with padding for standalone page (not inside AdminClient)
export default function StaffPage() {
  return (
    <div className="p-6">
      <StaffPageContent />
    </div>
  )
}

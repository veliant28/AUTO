'use client'

import React from 'react'
import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useTranslations } from 'next-intl'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import BarChart from '@/components/charts/BarChart'
import LineAreaChart from '@/components/charts/LineAreaChart'
import DoughnutChart from '@/components/charts/DoughnutChart'
import RadarChart from '@/components/charts/RadarChart'
import PolarAreaChart from '@/components/charts/PolarAreaChart'
import PieChart from '@/components/charts/PieChart'
import KipTimer from '@/components/ui/KipTimer'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  confirmed: 'bg-gray-800',
  processing: 'bg-blue-500',
  shipped: 'bg-orange-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
}

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждён',
  processing: 'В обработке',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

const PAYMENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6']
const WEEKDAY_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#22c55e',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]
const STATUS_COLORS_CHART = [
  '#f59e0b',
  '#374151',
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#ef4444',
]

export default function DashboardTab() {
  const { user, isAuthenticated } = useAuthStore()
  const t = useTranslations('admin')

  const { data: dashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard')
      return data
    },
    enabled: isAuthenticated && ['admin', 'manager'].includes(user?.role ?? ''),
    refetchInterval: 30000,
  })

  const { data: ordersData } = useQuery({
    queryKey: ['admin-dashboard-orders'],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders', {
        params: { page: 1, page_size: 5 },
      })
      return data
    },
    enabled: isAuthenticated && ['admin', 'manager'].includes(user?.role ?? ''),
    refetchInterval: 30000,
  })
  const orders = ordersData?.items || []

  const dates =
    dashboard?.orders_by_date?.map((d: any) => d.date.slice(5)) || []
  const counts = dashboard?.orders_by_date?.map((d: any) => d.count) || []
  const margins = dashboard?.orders_by_date?.map((d: any) => d.margin) || []

  // Данные для Radar
  const radarIndicators = [
    { name: 'Заказы/день', max: Math.max(...counts, 5) * 1.5 },
    { name: 'Наценка/день', max: Math.max(...margins, 500) * 1.5 },
    { name: '% доставленных', max: 100 },
    { name: 'Ср. чек', max: (dashboard?.average_check || 5000) * 1.5 },
    {
      name: 'Новых/день',
      max: Math.max(dashboard?.new_users_today || 1, 3) * 2,
    },
    {
      name: 'Товары в наличии',
      max: Math.max(dashboard?.total_parts || 100, 500) * 1.2,
    },
  ]
  const radarValues = [
    counts.length > 0
      ? Math.round(
          counts.reduce((a: number, b: number) => a + b, 0) / counts.length,
        )
      : 0,
    margins.length > 0
      ? Math.round(
          margins.reduce((a: number, b: number) => a + b, 0) / margins.length,
        )
      : 0,
    dashboard?.orders_by_status
      ? Math.round(
          ((dashboard.orders_by_status.delivered || 0) /
            (dashboard.total_orders || 1)) *
            100,
        )
      : 0,
    dashboard?.average_check || 0,
    dashboard?.new_users_today || 0,
    dashboard?.total_parts || 0,
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* ── KPI Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* KIP Таймер */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg shrink-0">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <KipTimer
                  oldestPendingSeconds={dashboard?.oldest_pending_seconds || 0}
                  pendingCount={dashboard?.pending_orders_count || 0}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {dashboard?.pending_orders_count
                    ? `${dashboard.pending_orders_count} необр.`
                    : 'Всё ок'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Наценка (прибыль) */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg shrink-0">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">
                {dashboard?.total_margin
                  ? `${fmt(dashboard.total_margin)} ₴`
                  : '0 ₴'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Наценка
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Заказы сегодня */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg shrink-0">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">
                {dashboard?.orders_today ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Заказов сегодня
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Новые пользователи */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg shrink-0">
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">
                {dashboard?.new_users_today ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Новых
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Средний чек */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg shrink-0">
              <DollarSign className="w-4 h-4 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">
                {dashboard?.average_check
                  ? `${fmt(dashboard.average_check)} ₴`
                  : '0 ₴'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Ср. чек
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Товары */}
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-teal-100 dark:bg-teal-900/30 p-2 rounded-lg shrink-0">
              <Package className="w-4 h-4 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">
                {fmt(dashboard?.total_parts ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                Товаров
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts + Orders ────────────────────────────────────── */}
      <div className="flex gap-3">
        {/* Левая колонка: 3 ряда × 2 графика */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          {/* Row 1: Bar + LineArea */}
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                Заказы по дням
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <BarChart
                xData={dates}
                yData={counts}
                color="#3b82f6"
                height={150}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                Наценка по дням
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <LineAreaChart
                xData={dates}
                yData={margins}
                color="#22c55e"
                height={150}
              />
            </CardContent>
          </Card>

          {/* Row 2: Doughnut + Radar */}
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                Статусы заказов
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <DoughnutChart
                labels={Object.keys(dashboard?.orders_by_status || {})}
                values={Object.values(dashboard?.orders_by_status || {})}
                colors={STATUS_COLORS_CHART}
                height={150}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                Эффективность
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <RadarChart
                indicators={radarIndicators}
                values={radarValues}
                color="#8b5cf6"
                height={170}
              />
            </CardContent>
          </Card>

          {/* Row 3: PolarArea + Pie */}
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                По дням недели
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <PolarAreaChart
                labels={
                  dashboard?.orders_by_weekday?.map((d: any) => d.weekday) || []
                }
                values={
                  dashboard?.orders_by_weekday?.map((d: any) => d.count) || []
                }
                height={150}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[11px] font-medium">
                Способы оплаты
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <PieChart
                labels={
                  dashboard?.payment_methods?.map((d: any) => d.method) || []
                }
                values={
                  dashboard?.payment_methods?.map((d: any) => d.count) || []
                }
                colors={PAYMENT_COLORS}
                height={150}
              />
            </CardContent>
          </Card>
        </div>

        {/* Правая колонка: последние заказы */}
        <Card className="w-[280px] shrink-0">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-medium">
              Последние заказы
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground pt-2">Нет заказов</p>
            ) : (
              <div className="divide-y">
                {orders.map((order: any) => {
                  const colorClass =
                    STATUS_COLORS[order.status] || 'bg-gray-500'
                  const label = STATUS_LABEL_MAP[order.status] || order.status
                  return (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center justify-between py-2 gap-2 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono font-medium truncate">
                          {order.order_number || `#${order.id}`}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground truncate">
                            {order.full_name}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold">
                          {fmt(order.total || 0)} ₴
                        </p>
                        <Badge
                          className={`${colorClass} text-white border-0 text-[9px] px-1.5 py-0 h-4`}
                        >
                          {label}
                        </Badge>
                      </div>
                    </Link>
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

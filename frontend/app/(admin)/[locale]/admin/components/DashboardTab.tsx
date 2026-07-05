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
import KipTimer from '@/components/ui/KipTimer'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  let rest = digits
  if (rest.startsWith('380')) rest = rest.slice(3)
  else if (rest.startsWith('38')) rest = rest.slice(2)
  if (rest.length < 8) return phone
  if (rest.startsWith('0')) {
    return `+38 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8)}`
  }
  return `+38 (0${rest.slice(0, 2)}) ${rest.slice(2, 5)}-${rest.slice(5, 7)}-${rest.slice(7)}`
}

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
        params: { page: 1, page_size: 8 },
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

  const radarIndicators = [
    { name: 'Заказы/день', max: Math.max(...counts, 5) * 1.5 },
    { name: 'Наценка/день', max: Math.max(...margins, 500) * 1.5 },
    { name: '% доставленных', max: 100 },
    { name: 'Ср. чек', max: (dashboard?.average_check || 5000) * 1.5 },
    {
      name: 'Новых/день',
      max: Math.max(dashboard?.new_users_today || 1, 3) * 2,
    },
    { name: 'Товары', max: Math.max(dashboard?.total_parts || 100, 500) * 1.2 },
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
    <div className="flex flex-col gap-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg shrink-0">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <KipTimer
                oldestPendingSeconds={dashboard?.oldest_pending_seconds || 0}
                pendingCount={dashboard?.pending_orders_count || 0}
              />
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {dashboard?.pending_orders_count
                  ? `${dashboard.pending_orders_count} необр.`
                  : 'Всё ок'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg shrink-0">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold truncate">
                {dashboard?.total_margin
                  ? `${fmt(dashboard.total_margin)} ₴`
                  : '0 ₴'}
              </p>
              <p className="text-xs text-muted-foreground truncate">Наценка</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg shrink-0">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {dashboard?.orders_today ?? 0}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Заказов сегодня
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg shrink-0">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {dashboard?.new_users_today ?? 0}
              </p>
              <p className="text-xs text-muted-foreground truncate">Новых</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg shrink-0">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold truncate">
                {dashboard?.average_check
                  ? `${fmt(dashboard.average_check)} ₴`
                  : '0 ₴'}
              </p>
              <p className="text-xs text-muted-foreground truncate">Ср. чек</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg shrink-0">
              <Package className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {fmt(dashboard?.total_parts ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground truncate">Товаров</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Orders — 3 колонки, каждая под 2 KPI карточки */}
      <div className="grid grid-cols-3 gap-4">
        {/* Колонка 1: под KIP + Наценка */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-lg font-medium">
                Заказы по дням
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <BarChart
                xData={dates}
                yData={counts}
                color="#3b82f6"
                height={180}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-lg font-medium">
                Наценка по дням
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <LineAreaChart
                xData={dates}
                yData={margins}
                color="#22c55e"
                height={180}
              />
            </CardContent>
          </Card>
        </div>

        {/* Колонка 2: под Заказы сегодня + Новые */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-lg font-medium">
                Статусы заказов
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <DoughnutChart
                labels={Object.keys(dashboard?.orders_by_status || {})}
                values={Object.values(dashboard?.orders_by_status || {})}
                colors={STATUS_COLORS_CHART}
                height={180}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-lg font-medium">
                Эффективность
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <RadarChart
                indicators={radarIndicators}
                values={radarValues}
                color="#8b5cf6"
                height={200}
              />
            </CardContent>
          </Card>
        </div>

        {/* Колонка 3: под Ср. чек + Товары — список заказов */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-medium">
              Последние заказы
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground pt-2">Нет заказов</p>
            ) : (
              <div className="space-y-2">
                {orders.map((order: any) => {
                  const statusInfo = ORDER_STATUS_LABELS[order.status]
                  const className =
                    statusInfo?.className || 'bg-gray-500 text-white'
                  return (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center justify-between py-3 px-3 gap-2 hover:bg-muted/30 rounded-lg border transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono font-semibold truncate">
                          {order.order_number || `#${order.id}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.full_name}
                        </p>
                        {order.phone && (
                          <p className="text-[10px] text-muted-foreground/60 font-mono">
                            {formatPhone(order.phone)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">
                          {fmt(order.total || 0)} ₴
                        </p>
                        <Badge className={`${className} border-0 text-sm`}>
                          {t('order_' + order.status)}
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

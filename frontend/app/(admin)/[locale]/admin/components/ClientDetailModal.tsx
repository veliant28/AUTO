'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTheme } from '@wrksz/themes/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Activity,
  ArrowLeft,
  Building2,
  Copy,
  Eye,
  Gift,
  Globe,
  Loader2,
  MapPin,
  Network,
  Package,
  PackageOpen,
  RefreshCw,
  ScanBarcode,
  ScanLine,
  ShoppingCart,
  Star,
  Truck,
  User,
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { getAvatarUrl, getInitials } from '@/lib/avatar'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import { ORDER_STATUS_LABELS, RETURN_STATUS_LABELS } from '@/lib/constants'
import { NpWaybillBadge } from '@/components/ui/NpWaybillBadge'
import ChartErrorBoundary from '@/components/ChartErrorBoundary'
import api from '@/lib/api'
import { formatDateTime, parseApiDate } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { useTimezone } from '@/hooks/useTimezone'
import { toast } from '@/lib/toast'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

// Цвета долей доната индекса успешности
const SLICE_COLORS: Record<string, string> = {
  delivered: '#22c55e',
  cancelled: '#ef4444',
  returned_full: '#f97316',
  returned_partial: '#eab308',
}

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
}

// Цвета ролевых бейджей — как в таблице монитора и сайдбаре админки
const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

interface MonitorViewItem {
  part_id: number
  article: string | null
  brand: string | null
  part_name: string | null
  sku: string | null
  image_url: string | null
  price: number | null
  currency: string | null
  supplier_name: string | null
  viewed_at: string
}

interface MonitorClientDetail {
  client: {
    client_id: string
    is_anonymous: boolean
    name: string | null
    last_name: string | null
    first_name: string | null
    middle_name: string | null
    email: string | null
    phone: string | null
    role: string | null
    avatar_index: number | null
    status: 'online' | 'offline'
    first_seen: string | null
    last_seen: string | null
    ip: string | null
    success_index: number | null
    total_orders: number | null
    delivery: {
      delivery_type: string | null
      delivery_city_label: string | null
      delivery_warehouse_label: string | null
      delivery_street_label: string | null
      delivery_house: string | null
      delivery_apartment: string | null
    } | null
  }
  views: MonitorViewItem[]
}

interface MonitorCartItem {
  part_id: number
  article: string | null
  brand: string | null
  part_name: string | null
  sku: string | null
  image_url: string | null
  quantity: number
  price: number | null
  currency: string | null
  supplier_name: string | null
}

interface MonitorCartResponse {
  items: MonitorCartItem[]
  total: number
}

interface MonitorIndexSlice {
  key: string
  value: number
  count: number
}

interface MonitorIndexResponse {
  success_index: number | null
  total_orders: number | null
  slices: MonitorIndexSlice[]
}

interface MonitorOrderTtn {
  np_number: string | null
  exists: boolean
  is_deleted: boolean
}

interface MonitorOrderItem {
  order_number: string
  status: string
  total: number
  items_count: number
  created_at: string
  ttn: MonitorOrderTtn | null
}

interface MonitorOrderListResponse {
  items: MonitorOrderItem[]
  total: number
  page: number
  page_size: number
}

interface MonitorReturnItem {
  return_number: string
  order_number: string | null
  status: string
  total_refund: number
  items_count: number
  created_at: string
  ttn_number: string | null
}

interface MonitorReturnListResponse {
  items: MonitorReturnItem[]
  total: number
  page: number
  page_size: number
}

interface MonitorIpItem {
  ip: string
  visits: number
  first_seen: string
  last_seen: string
  is_top: boolean
}

interface MonitorIpListResponse {
  items: MonitorIpItem[]
  total: number
  page: number
  page_size: number
}

interface MonitorVisitDay {
  date: string
  count: number
}

interface MonitorVisitsResponse {
  days: MonitorVisitDay[]
}

interface MonitorPromocodeItem {
  id: number
  code: string
  type: string
  discount_percent: number
  reason: string
  expires_at: string
  used_at: string | null
  is_active: boolean
  created_at: string
  issued_by_name: string | null
  issued_by_role: string | null
}

interface MonitorLoyaltyResponse {
  items: MonitorPromocodeItem[]
  total: number
  page: number
  page_size: number
}

interface MonitorLoyaltyStatsMonth {
  month: string // 'YYYY-MM'
  count: number
}

interface MonitorLoyaltyStatsResponse {
  months: MonitorLoyaltyStatsMonth[]
  total: number
}

interface ClientDetailModalProps {
  clientKey: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Независимая модалка клиента (профиль + просмотренные товары).
 * Отдельный компонент — можно подключать из любого места админки.
 */
export default function ClientDetailModal({
  clientKey,
  open,
  onOpenChange,
}: ClientDetailModalProps) {
  const t = useTranslations('admin')
  const locale = useLocale()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  // Переключатель вида: просмотр товаров <-> корзина <-> индекс <-> IP <-> лояльность
  const [mode, setMode] = useState<
    'main' | 'cart' | 'index' | 'ip' | 'loyalty'
  >('main')
  const [listTab, setListTab] = useState<'orders' | 'returns'>('orders')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-monitor-client', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorClientDetail>(
        `/admin/monitor/clients/${clientKey}`,
      )
      return data
    },
    enabled: !!clientKey && open,
    refetchInterval: 10000,
  })

  const cart = useQuery({
    queryKey: ['admin-monitor-client-cart', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorCartResponse>(
        `/admin/monitor/clients/${clientKey}/cart`,
      )
      return data
    },
    enabled: !!clientKey && open && mode === 'cart',
    refetchInterval: 10000,
  })

  // Индекс успешности: статистика для доната
  const index = useQuery({
    queryKey: ['admin-monitor-client-index', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorIndexResponse>(
        `/admin/monitor/clients/${clientKey}/index`,
      )
      return data
    },
    enabled: !!clientKey && open && mode === 'index',
    refetchInterval: 30000,
  })

  // Заказы/возвраты клиента — ленивая подгрузка (бесконечный скролл)
  const orders = useInfiniteQuery({
    queryKey: ['admin-monitor-client-orders', clientKey],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<MonitorOrderListResponse>(
        `/admin/monitor/clients/${clientKey}/orders`,
        { params: { page: pageParam, page_size: 20 } },
      )
      return data
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: !!clientKey && open && mode === 'index' && listTab === 'orders',
  })

  const returns = useInfiniteQuery({
    queryKey: ['admin-monitor-client-returns', clientKey],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<MonitorReturnListResponse>(
        `/admin/monitor/clients/${clientKey}/returns`,
        { params: { page: pageParam, page_size: 20 } },
      )
      return data
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: !!clientKey && open && mode === 'index' && listTab === 'returns',
  })

  // IP-история клиента: список (бесконечный скролл) + посещения за 7 дней
  const ips = useInfiniteQuery({
    queryKey: ['admin-monitor-client-ips', clientKey],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<MonitorIpListResponse>(
        `/admin/monitor/clients/${clientKey}/ips`,
        { params: { page: pageParam, page_size: 20 } },
      )
      return data
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: !!clientKey && open && mode === 'ip',
  })

  const visits = useQuery({
    queryKey: ['admin-monitor-client-visits', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorVisitsResponse>(
        `/admin/monitor/clients/${clientKey}/visits?days=7`,
      )
      return data
    },
    enabled: !!clientKey && open && mode === 'ip',
    refetchInterval: 30000,
  })

  // Промокоды клиента — ленивая подгрузка (бесконечный скролл), как заказы/IP
  const loyalty = useInfiniteQuery({
    queryKey: ['admin-monitor-client-loyalty', clientKey],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<MonitorLoyaltyResponse>(
        `/admin/monitor/clients/${clientKey}/loyalty`,
        { params: { page: pageParam, page_size: 20 } },
      )
      return data
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: !!clientKey && open && mode === 'loyalty',
  })

  // Статистика выдачи по месяцам (график за 12 месяцев)
  const loyaltyStats = useQuery({
    queryKey: ['admin-monitor-client-loyalty-stats', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorLoyaltyStatsResponse>(
        `/admin/monitor/clients/${clientKey}/loyalty-stats`,
      )
      return data
    },
    enabled: !!clientKey && open && mode === 'loyalty',
    refetchInterval: 30000,
  })

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280'
  const chartBg = isDark ? 'transparent' : '#fff'
  const borderColor = isDark ? '#374151' : '#e5e7eb'

  const listSentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode !== 'index') return
    const el = listSentinelRef.current
    if (!el) return
    const list = listTab === 'orders' ? orders : returns
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          list.hasNextPage &&
          !list.isFetchingNextPage
        ) {
          void list.fetchNextPage()
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    listTab,
    orders.hasNextPage,
    orders.isFetchingNextPage,
    returns.hasNextPage,
    returns.isFetchingNextPage,
  ])

  const ipSentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode !== 'ip') return
    const el = ipSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          ips.hasNextPage &&
          !ips.isFetchingNextPage
        ) {
          void ips.fetchNextPage()
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ips.hasNextPage, ips.isFetchingNextPage])

  const loyaltySentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode !== 'loyalty') return
    const el = loyaltySentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          loyalty.hasNextPage &&
          !loyalty.isFetchingNextPage
        ) {
          void loyalty.fetchNextPage()
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loyalty.hasNextPage, loyalty.isFetchingNextPage])

  // ── Донат индекса успешности (процент в центре) ────────────────────────
  // ВАЖНО: хук обязан быть до раннего return — иначе «Rendered more hooks».
  const indexHasData =
    !!index.data && index.data.slices.some((s) => s.value > 0)
  const indexOption = useMemo(() => {
    const slices = index.data?.slices ?? []
    // Все 4 категории всегда в данных: нулевые доли не рисуются как дуги,
    // но остаются в легенде — чтобы было видно «Возвратов нет», а не пусто.
    const data = slices.map((s) => ({
      value: s.value,
      name: t('monitor_' + s.key),
      itemStyle: { color: SLICE_COLORS[s.key] },
      count: s.count,
    }))
    return {
      backgroundColor: chartBg,
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#e5e7eb' : '#1f2937', fontSize: 12 },
        formatter: (params: any) =>
          `${params.name}: <b>${fmt.format(params.value)} ₴</b> (${params.percent}%)<br/>` +
          t('monitor_items_count', { count: params.data.count }),
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['52%', '78%'],
          center: ['50%', '47%'],
          itemStyle: {
            borderRadius: 6,
            borderColor: borderColor,
            borderWidth: 3,
          },
          label: { show: false },
          data,
        },
      ],
      graphic: indexHasData
        ? [
            {
              type: 'text' as const,
              left: 'center',
              top: '39%',
              style: {
                text: `${index.data?.success_index ?? 0}%`,
                textAlign: 'center' as const,
                fill: isDark ? '#e5e7eb' : '#1f2937',
                fontSize: 34,
                fontWeight: 'bold' as const,
              },
            },
            {
              type: 'text' as const,
              left: 'center',
              top: '52%',
              style: {
                text: t('monitor_index_center'),
                textAlign: 'center' as const,
                fill: axisTextColor,
                fontSize: 12,
              },
            },
          ]
        : [],
    }
  }, [index.data, indexHasData, isDark, t, chartBg, axisTextColor, borderColor])

  // ── Bar-график посещений за 7 дней ─────────────────────────────────────
  const visitsOption = useMemo(() => {
    const days = visits.data?.days ?? []
    return {
      backgroundColor: chartBg,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#e5e7eb' : '#1f2937', fontSize: 12 },
        formatter: (params: any[]) => {
          const p = params?.[0]
          if (!p) return ''
          const d = days[p.dataIndex]?.date ?? ''
          // "2026-08-06" -> "06-08-2026"
          const full = d ? `${d.slice(8)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : d
          return `<b>${full}</b><br/>${t('monitor_visits_count', { count: p.value })}`
        },
      },
      grid: { top: 30, right: 20, bottom: 30, left: 40 },
      xAxis: {
        type: 'category' as const,
        // сначала день, потом месяц: "06.08"
        data: days.map((d) => `${d.date.slice(8)}.${d.date.slice(5, 7)}`),
        axisLabel: { color: axisTextColor },
        axisLine: { lineStyle: { color: borderColor } },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: axisTextColor },
        splitLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          type: 'bar' as const,
          data: days.map((d) => d.count),
          itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: 'top' as const,
            color: axisTextColor,
            fontSize: 11,
          },
        },
      ],
    }
  }, [visits.data, isDark, t, chartBg, axisTextColor, borderColor])

  // ── Bar-график выдачи промокодов за 12 месяцев ─────────────────────────
  const loyaltyOption = useMemo(() => {
    const months = loyaltyStats.data?.months ?? []
    return {
      backgroundColor: chartBg,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textStyle: { color: isDark ? '#e5e7eb' : '#1f2937', fontSize: 12 },
        formatter: (params: any[]) => {
          const p = params?.[0]
          if (!p) return ''
          const m = months[p.dataIndex]?.month ?? ''
          // "2026-08" -> "08.2026"
          const full = m ? `${m.slice(5, 7)}.${m.slice(0, 4)}` : m
          return `<b>${full}</b><br/>${t('monitor_loyalty_promos', { count: p.value })}`
        },
      },
      grid: { top: 30, right: 20, bottom: 30, left: 40 },
      xAxis: {
        type: 'category' as const,
        // "2026-08" -> "08.26"
        data: months.map(
          (m) => `${m.month.slice(5, 7)}.${m.month.slice(2, 4)}`,
        ),
        axisLabel: { color: axisTextColor },
        axisLine: { lineStyle: { color: borderColor } },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: axisTextColor },
        splitLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          type: 'bar' as const,
          data: months.map((m) => m.count),
          itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: 'top' as const,
            color: axisTextColor,
            fontSize: 11,
          },
        },
      ],
    }
  }, [loyaltyStats.data, isDark, t, chartBg, axisTextColor, borderColor])

  if (!clientKey) return null

  const c = data?.client
  const online = c?.status === 'online'
  const deliveryType = c?.delivery?.delivery_type
  const views = data?.views ?? []
  const cartItems = cart.data?.items ?? []
  const cartTotal = cartItems.reduce(
    (sum, i) => sum + (i.price || 0) * i.quantity,
    0,
  )
  const allOrders = orders.data?.pages.flatMap((p) => p.items) ?? []
  const allReturns = returns.data?.pages.flatMap((p) => p.items) ?? []
  const allIps = ips.data?.pages.flatMap((p) => p.items) ?? []
  const allPromos = loyalty.data?.pages.flatMap((p) => p.items) ?? []
  const promoTotal = loyalty.data?.pages[0]?.total ?? 0

  return (
    <TooltipProvider>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setMode('main')
            setListTab('orders')
          }
          onOpenChange(o)
        }}
      >
        <DialogContent
          className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
          aria-describedby={undefined}
        >
          <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar className="h-14 w-14 ring-2 ring-border shrink-0">
                  <AvatarImage
                    src={getAvatarUrl(c?.avatar_index, c?.name || clientKey)}
                  />
                  <AvatarFallback>
                    {getInitials(c?.name || '', clientKey)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                      {c?.name || t('monitor_anonymous')}
                    </DialogTitle>
                    <Badge
                      className={`${online ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'} border-0 text-sm`}
                    >
                      {online ? t('monitor_online') : t('monitor_offline')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(c?.first_seen, tz)}
                    {c?.ip ? ` · ${c.ip}` : ''}
                  </p>
                </div>
              </div>
              {(c?.role || c?.email) && (
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {c?.role && (
                    <Badge
                      className={`${ROLE_BADGE_COLORS[c.role] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} border-0 text-sm`}
                    >
                      {t(c.role) || c.role}
                    </Badge>
                  )}
                  {c?.email && (
                    <span className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {c.email}
                    </span>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>
          <Separator className="flex-shrink-0" />
          <div className="flex-1 min-h-0 overflow-hidden">
            {mode === 'cart' ? (
              <div className="p-6 h-full min-h-0">
                <div className="border rounded-lg p-3 flex flex-col h-full min-h-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                    <ShoppingCart className="w-5 h-5" />{' '}
                    {t('monitor_cart_title')}
                    <Badge variant="secondary" className="text-sm">
                      {t('monitor_cart_items', {
                        count: cart.data?.total ?? 0,
                      })}
                    </Badge>
                  </h4>
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1 mt-3">
                    {cart.isLoading && !cart.data ? (
                      <>
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </>
                    ) : cartItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <PackageOpen className="w-12 h-12" />
                        <p className="text-sm">{t('monitor_cart_empty')}</p>
                      </div>
                    ) : (
                      cartItems.map((item) => (
                        <div
                          key={item.part_id}
                          className="flex gap-3 p-3 rounded-lg border bg-card transition-colors"
                        >
                          <div
                            className={`w-[80px] h-[80px] shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center ${
                              item.image_url
                                ? ''
                                : `bg-gradient-to-br ${getBrandColor(item.brand)}`
                            }`}
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-3xl font-bold text-white/40 select-none">
                                {getBrandInitial(item.brand)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  {item.brand && (
                                    <Badge
                                      variant="secondary"
                                      className="text-sm px-1.5"
                                    >
                                      {item.brand}
                                    </Badge>
                                  )}
                                  <span className="text-sm font-mono text-muted-foreground">
                                    {item.article}
                                  </span>
                                  {item.supplier_name && (
                                    <Badge
                                      className={`${supplierColors[item.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}
                                    >
                                      {item.supplier_name}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium line-clamp-2">
                                  {item.part_name}
                                </p>
                              </div>
                              <div className="flex items-center shrink-0 gap-2">
                                {item.sku && (
                                  <Badge className="bg-blue-500 text-white border-0 text-sm">
                                    {item.sku}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-sm text-muted-foreground">
                                {item.quantity} ×{' '}
                                {item.price != null
                                  ? `${fmt.format(item.price)} ₴`
                                  : '—'}
                              </span>
                              <span className="font-semibold text-base">
                                {item.price != null
                                  ? `${fmt.format(item.price * item.quantity)} ₴`
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : mode === 'index' ? (
              <div className="p-6 h-full min-h-0">
                <div
                  className="grid gap-6 h-full min-h-0"
                  style={{
                    gridTemplateColumns:
                      'calc((100% - 48px) / 2 + 24px) calc((100% - 48px) / 2)',
                  }}
                >
                  {/* График — донат с индексом в центре */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <Activity className="w-5 h-5" />{' '}
                      {t('monitor_index_title')}
                      {index.data?.success_index != null && (
                        <Badge
                          className={`${(() => {
                            const idx = index.data.success_index
                            const totalOrders = index.data.total_orders
                            return totalOrders === 0
                              ? 'bg-gray-500'
                              : idx >= 70
                                ? 'bg-green-500'
                                : idx >= 30
                                  ? 'bg-yellow-500'
                                  : idx >= 1
                                    ? 'bg-orange-500'
                                    : 'bg-red-500'
                          })()} text-white border-0 text-sm ml-auto`}
                        >
                          {index.data.success_index}%
                        </Badge>
                      )}
                    </h4>
                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
                      {index.isLoading && !index.data ? (
                        <Skeleton className="h-[480px] w-full" />
                      ) : !indexHasData ? (
                        <div className="text-sm text-muted-foreground">
                          {t('monitor_no_data')}
                        </div>
                      ) : (
                        <>
                          <ChartErrorBoundary>
                            <ReactECharts
                              option={indexOption}
                              style={{ height: 440, width: '100%' }}
                            />
                          </ChartErrorBoundary>
                          {/* Кастомная легенда 2×2 — все 4 категории, нули включены */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full max-w-md mt-1">
                            {(index.data?.slices ?? []).map((s) => (
                              <div
                                key={s.key}
                                className="flex items-center gap-1.5 text-xs min-w-0"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ background: SLICE_COLORS[s.key] }}
                                />
                                <span className="text-muted-foreground truncate">
                                  {t('monitor_' + s.key)}
                                </span>
                                <span className="font-semibold whitespace-nowrap ml-auto">
                                  {fmt.format(s.value)} ₴
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Список заказов/возвратов — ленивая подгрузка */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <PackageOpen className="w-5 h-5" />
                      {listTab === 'orders'
                        ? t('monitor_orders')
                        : t('monitor_returns')}
                    </h4>
                    <div className="flex-1 overflow-y-auto pr-1 mt-3 space-y-2">
                      {listTab === 'orders' ? (
                        orders.isLoading && !orders.data ? (
                          <Skeleton className="h-16 w-full" />
                        ) : allOrders.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-8 text-center">
                            {t('monitor_no_orders')}
                          </div>
                        ) : (
                          allOrders.map((o) => (
                            <div
                              key={o.order_number}
                              className="p-2.5 rounded-lg border bg-card space-y-1"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-mono text-sm truncate block">
                                    {o.order_number}
                                  </span>
                                </div>
                                {/* ТТН — ровно по центру (обе стороны flex-1) */}
                                <div className="w-48 shrink-0 flex justify-center">
                                  <NpWaybillBadge
                                    npNumber={o.ttn?.np_number ?? undefined}
                                    exists={o.ttn?.exists ?? false}
                                    isDeleted={o.ttn?.is_deleted ?? false}
                                  />
                                </div>
                                <div className="flex-1 flex justify-end">
                                  <Badge
                                    className={`${ORDER_STATUS_LABELS[o.status]?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                                  >
                                    {t('order_' + o.status)}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>
                                  {formatDateTime(o.created_at, tz, {
                                    seconds: false,
                                  })}
                                </span>
                                <span>
                                  {t('monitor_items_count', {
                                    count: o.items_count,
                                  })}
                                </span>
                                <span className="font-semibold text-sm text-foreground">
                                  {fmt.format(o.total)} ₴
                                </span>
                              </div>
                            </div>
                          ))
                        )
                      ) : returns.isLoading && !returns.data ? (
                        <Skeleton className="h-16 w-full" />
                      ) : allReturns.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          {t('monitor_no_returns')}
                        </div>
                      ) : (
                        allReturns.map((r) => (
                          <div
                            key={r.return_number}
                            className="p-2.5 rounded-lg border bg-card space-y-1"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-sm truncate block">
                                  {r.return_number}
                                </span>
                              </div>
                              {/* ТТН — ровно по центру (обе стороны flex-1) */}
                              <div className="w-48 shrink-0 flex justify-center">
                                {r.ttn_number ? (
                                  <Badge className="bg-green-500 text-white border-0 text-sm font-mono gap-1.5 whitespace-nowrap">
                                    <ScanBarcode className="w-3.5 h-3.5" />
                                    {r.ttn_number.replace(
                                      /(\d{2})(\d{4})(\d{4})(\d{4})/,
                                      '$1 $2 $3 $4',
                                    )}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-500 text-white border-0 text-sm font-mono gap-1.5 whitespace-nowrap">
                                    <ScanLine className="w-3.5 h-3.5" />
                                    59 0000 0000 0000
                                  </Badge>
                                )}
                              </div>
                              <div className="flex-1 flex justify-end">
                                <Badge
                                  className={`${RETURN_STATUS_LABELS[r.status]?.className || 'bg-gray-500 text-white'} border-0 text-sm`}
                                >
                                  {t('return_' + r.status)}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                {formatDateTime(r.created_at, tz, {
                                  seconds: false,
                                })}
                              </span>
                              <span>
                                {t('monitor_items_count', {
                                  count: r.items_count,
                                })}
                              </span>
                              <span className="font-semibold text-sm text-foreground">
                                {fmt.format(r.total_refund)} ₴
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={listSentinelRef} className="h-2" />
                      {(orders.isFetchingNextPage ||
                        returns.isFetchingNextPage) && (
                        <div className="flex justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : mode === 'ip' ? (
              <div className="p-6 h-full min-h-0">
                <div
                  className="grid gap-6 h-full min-h-0"
                  style={{
                    gridTemplateColumns:
                      'calc((100% - 48px) * 2 / 3 + 24px) calc((100% - 48px) / 3)',
                  }}
                >
                  {/* График посещений за 7 дней */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <Network className="w-5 h-5" />{' '}
                      {t('monitor_visits_title')}
                    </h4>
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                      {visits.isLoading && !visits.data ? (
                        <Skeleton className="h-[420px] w-full" />
                      ) : !visits.data ||
                        visits.data.days.every((d) => d.count === 0) ? (
                        <div className="text-sm text-muted-foreground">
                          {t('monitor_no_data')}
                        </div>
                      ) : (
                        <ChartErrorBoundary>
                          <ReactECharts
                            option={visitsOption}
                            style={{ height: 420, width: '100%' }}
                          />
                        </ChartErrorBoundary>
                      )}
                    </div>
                  </div>

                  {/* Список IP — бесконечный скролл, топ-5 со звёздами */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <Globe className="w-5 h-5" /> {t('monitor_ip_title')}
                    </h4>
                    <div className="flex-1 overflow-y-auto pr-1 mt-3 space-y-2">
                      {ips.isLoading && !ips.data ? (
                        <Skeleton className="h-12 w-full" />
                      ) : allIps.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          {t('monitor_no_ips')}
                        </div>
                      ) : (
                        allIps.map((row) => (
                          <div
                            key={row.ip}
                            className="p-2.5 rounded-lg border bg-card space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm truncate">
                                {row.ip}
                              </span>
                              {row.is_top && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t('monitor_top_ip')}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                {formatDateTime(row.first_seen, tz, {
                                  mode: 'date',
                                })}{' '}
                                —{' '}
                                {formatDateTime(row.last_seen, tz, {
                                  mode: 'date',
                                })}
                              </span>
                              <span className="whitespace-nowrap">
                                {t('monitor_visits_count', {
                                  count: row.visits,
                                })}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={ipSentinelRef} className="h-2" />
                      {ips.isFetchingNextPage && (
                        <div className="flex justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : mode === 'loyalty' ? (
              <div className="p-6 h-full min-h-0">
                <div
                  className="grid gap-6 h-full min-h-0"
                  style={{
                    gridTemplateColumns:
                      'calc((100% - 48px) * 2 / 3 + 24px) calc((100% - 48px) / 3)',
                  }}
                >
                  {/* График выдачи промокодов за 12 месяцев */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <Gift className="w-5 h-5" />{' '}
                      {t('monitor_loyalty_chart_title')}
                    </h4>
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                      {loyaltyStats.isLoading && !loyaltyStats.data ? (
                        <Skeleton className="h-[420px] w-full" />
                      ) : !loyaltyStats.data ||
                        loyaltyStats.data.months.every((m) => m.count === 0) ? (
                        <div className="text-sm text-muted-foreground">
                          {t('monitor_no_data')}
                        </div>
                      ) : (
                        <ChartErrorBoundary>
                          <ReactECharts
                            option={loyaltyOption}
                            style={{ height: 420, width: '100%' }}
                          />
                        </ChartErrorBoundary>
                      )}
                    </div>
                  </div>

                  {/* Список выданных промокодов */}
                  <div className="border rounded-lg p-3 flex flex-col min-h-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                      <Gift className="w-5 h-5" /> {t('loyalty_title')}
                      {promoTotal > 0 && (
                        <Badge className="bg-purple-500 text-white border-0">
                          {promoTotal}
                        </Badge>
                      )}
                    </h4>
                    <div className="flex-1 overflow-y-auto pr-1 mt-3 space-y-2">
                      {loyalty.isLoading && !loyalty.data ? (
                        <Skeleton className="h-12 w-full" />
                      ) : allPromos.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          {t('monitor_loyalty_empty')}
                        </div>
                      ) : (
                        allPromos.map((p) => {
                          const expired =
                            (parseApiDate(p.expires_at)?.getTime() ?? 0) <
                            Date.now()
                          return (
                            <div
                              key={p.id}
                              className="p-2.5 rounded-lg border bg-card space-y-1.5"
                            >
                              <div className="flex items-center gap-1">
                                {/* Код — ссылка на страницу лояльности */}
                                <Link
                                  href={`/${locale}/admin/loyalty`}
                                  className="min-w-0"
                                >
                                  <span className="font-mono text-sm font-bold tracking-wider truncate block hover:text-primary">
                                    {p.code}
                                  </span>
                                </Link>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        navigator.clipboard.writeText(p.code)
                                        toast.success(t('loyalty_copied'))
                                      }}
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t('loyalty_copy')}
                                  </TooltipContent>
                                </Tooltip>
                                {/* Кто выдал + роль + дата выдачи */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                    >
                                      <User className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="space-y-1.5">
                                    {/* Бейдж роли выдавшего */}
                                    <div>
                                      <Badge
                                        className={`${ROLE_BADGE_COLORS[p.issued_by_role || ''] || 'bg-gray-500 text-white'} border-0 text-sm`}
                                      >
                                        {t(p.issued_by_role || 'retail')}
                                      </Badge>
                                    </div>
                                    {/* Фамилия + Имя — крупнее */}
                                    <div className="text-base font-semibold whitespace-nowrap">
                                      {p.issued_by_name || '—'}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground">
                                        {t('monitor_loyalty_issued_at')}:
                                      </span>
                                      <span className="whitespace-nowrap">
                                        {formatDateTime(p.created_at, tz)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground shrink-0">
                                        {t('monitor_loyalty_reason')}:
                                      </span>
                                      <span className="max-w-[220px]">
                                        {p.reason || '—'}
                                      </span>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                {/* Статус — справа от кода */}
                                <div className="ml-auto">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        className={`${p.used_at ? 'bg-green-500' : expired ? 'bg-red-500' : 'bg-gray-500'} text-white border-0 text-sm cursor-pointer`}
                                      >
                                        {p.used_at
                                          ? t('status_used')
                                          : expired
                                            ? t('status_expired')
                                            : t('status_unused')}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {p.used_at
                                        ? `${t('loyalty_used_at')}: ${formatDateTime(p.used_at, tz)}`
                                        : ''}
                                      {!p.used_at && expired
                                        ? `${t('loyalty_expired_at')}: ${formatDateTime(p.expires_at, tz)}`
                                        : ''}
                                      {!p.used_at && !expired
                                        ? `${t('loyalty_valid_until')}: ${formatDateTime(p.expires_at, tz)}`
                                        : ''}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold">
                                  {p.discount_percent || 100}%
                                </span>
                                <Badge
                                  className={`${p.type === 'delivery' ? 'bg-blue-500' : 'bg-purple-500'} text-white border-0 text-sm`}
                                >
                                  {p.type === 'delivery'
                                    ? t('loyalty_type_delivery')
                                    : t('loyalty_type_margin')}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>{t('monitor_loyalty_expires')}:</span>
                                <span
                                  className={`font-semibold ${expired ? 'text-red-500' : ''}`}
                                >
                                  {formatDateTime(p.expires_at, tz)}
                                </span>
                              </div>
                            </div>
                          )
                        })
                      )}
                      <div ref={loyaltySentinelRef} className="h-2" />
                      {loyalty.isFetchingNextPage && (
                        <div className="flex justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : isLoading && !data ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div
                className="grid gap-6 h-full min-h-0 grid-rows-[minmax(0,1fr)] p-6"
                style={{
                  // «Личные данные» = ровно как «Данные получателя» в модалке
                  // заказа: там сетка 2fr_1fr_1fr с двумя gap-6 (48px),
                  // колонка = (W − 48px) / 4. fr в calc() невалиден,
                  // поэтому считаем через % и px.
                  gridTemplateColumns:
                    'calc((100% - 48px) * 3 / 4 + 24px) calc((100% - 48px) / 4)',
                }}
              >
                {/* Товары — просмотренные (до 100) */}
                <div className="border rounded-lg p-3 flex flex-col min-h-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                    <Eye className="w-5 h-5" /> {t('monitor_views_title')}
                    <Badge variant="secondary" className="text-sm">
                      {views.length}/100
                    </Badge>
                  </h4>
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1 mt-3">
                    {views.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {t('monitor_views_empty')}
                      </div>
                    ) : (
                      views.map((item) => (
                        <div
                          key={`${item.part_id}-${item.viewed_at}`}
                          className="flex gap-3 p-3 rounded-lg border bg-card transition-colors"
                        >
                          <div
                            className={`w-[80px] h-[80px] shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center ${
                              item.image_url
                                ? ''
                                : `bg-gradient-to-br ${getBrandColor(item.brand)}`
                            }`}
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-3xl font-bold text-white/40 select-none">
                                {getBrandInitial(item.brand)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  {item.brand && (
                                    <Badge
                                      variant="secondary"
                                      className="text-sm px-1.5"
                                    >
                                      {item.brand}
                                    </Badge>
                                  )}
                                  <span className="text-sm font-mono text-muted-foreground">
                                    {item.article}
                                  </span>
                                  {item.supplier_name && (
                                    <Badge
                                      className={`${supplierColors[item.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}
                                    >
                                      {item.supplier_name}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium line-clamp-2">
                                  {item.part_name}
                                </p>
                              </div>
                              <div className="flex items-center shrink-0 gap-2">
                                {item.sku && (
                                  <Badge className="bg-blue-500 text-white border-0 text-sm">
                                    {item.sku}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-sm text-muted-foreground">
                                {t('monitor_viewed_at')}:{' '}
                                {formatDateTime(item.viewed_at, tz)}
                              </span>
                              <span className="font-semibold text-base">
                                {item.price != null
                                  ? `${fmt.format(item.price)} ₴`
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Личные данные */}
                <div className="border rounded-lg p-3 flex flex-col min-h-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                    <User className="w-5 h-5" /> {t('monitor_personal_data')}
                    {c && c.success_index != null && (
                      <Badge
                        className={`${(() => {
                          const idx = c.success_index
                          const totalOrders = c.total_orders
                          return totalOrders === 0
                            ? 'bg-gray-500'
                            : idx >= 70
                              ? 'bg-green-500'
                              : idx >= 30
                                ? 'bg-yellow-500'
                                : idx >= 1
                                  ? 'bg-orange-500'
                                  : 'bg-red-500'
                        })()} text-white border-0 text-sm ml-auto`}
                      >
                        {c.success_index}%
                      </Badge>
                    )}
                  </h4>
                  <div className="mt-3 space-y-4 flex-1 overflow-y-auto pr-1">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm">
                        {t('phone_label')}
                      </p>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        <span className="truncate">
                          {formatPhone(c?.phone)}
                        </span>
                      </div>
                    </div>
                    {['last_name', 'first_name', 'middle_name'].map((field) => (
                      <div key={field} className="space-y-1">
                        <p className="text-muted-foreground text-sm">
                          {t(field)}
                        </p>
                        <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                          <span
                            className={
                              (c as any)?.[field]
                                ? 'truncate'
                                : 'truncate text-muted-foreground'
                            }
                          >
                            {(c as any)?.[field] || '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div>
                      <h5 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4" /> {t('delivery_info')}
                      </h5>
                      <div className="space-y-3">
                        <RadioGroup
                          value={deliveryType || ''}
                          disabled
                          className="grid grid-cols-3 gap-2"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                                <RadioGroupItem
                                  value="pickup"
                                  id="cdel-pickup"
                                  className="cursor-pointer"
                                  disabled
                                />
                                <Label
                                  htmlFor="cdel-pickup"
                                  className="cursor-pointer"
                                >
                                  <Package className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('pickup')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                                <RadioGroupItem
                                  value="warehouse"
                                  id="cdel-warehouse"
                                  className="cursor-pointer"
                                  disabled
                                />
                                <Label
                                  htmlFor="cdel-warehouse"
                                  className="cursor-pointer"
                                >
                                  <Building2 className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('warehouse')}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                                <RadioGroupItem
                                  value="courier"
                                  id="cdel-courier"
                                  className="cursor-pointer"
                                  disabled
                                />
                                <Label
                                  htmlFor="cdel-courier"
                                  className="cursor-pointer"
                                >
                                  <Truck className="w-5 h-5" />
                                </Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{t('courier')}</TooltipContent>
                          </Tooltip>
                        </RadioGroup>
                        {(deliveryType === 'warehouse' ||
                          deliveryType === 'courier') && (
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-sm">
                              {t('delivery_city')}
                            </p>
                            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                              <span
                                className={
                                  c?.delivery?.delivery_city_label
                                    ? 'truncate'
                                    : 'truncate text-muted-foreground'
                                }
                              >
                                {c?.delivery?.delivery_city_label || '—'}
                              </span>
                            </div>
                          </div>
                        )}
                        {deliveryType === 'warehouse' && (
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-sm">
                              {t('warehouse')}
                            </p>
                            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                              <span
                                className={
                                  c?.delivery?.delivery_warehouse_label
                                    ? 'truncate'
                                    : 'truncate text-muted-foreground'
                                }
                              >
                                {c?.delivery?.delivery_warehouse_label || '—'}
                              </span>
                            </div>
                          </div>
                        )}
                        {deliveryType === 'courier' && (
                          <>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-sm">
                                {t('monitor_delivery_street')}
                              </p>
                              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                <span
                                  className={
                                    c?.delivery?.delivery_street_label
                                      ? 'truncate'
                                      : 'truncate text-muted-foreground'
                                  }
                                >
                                  {c?.delivery?.delivery_street_label || '—'}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-sm">
                                  {t('monitor_delivery_house')}
                                </p>
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span
                                    className={
                                      c?.delivery?.delivery_house
                                        ? 'truncate'
                                        : 'truncate text-muted-foreground'
                                    }
                                  >
                                    {c?.delivery?.delivery_house || '—'}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-sm">
                                  {t('monitor_delivery_apartment')}
                                </p>
                                <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                                  <span
                                    className={
                                      c?.delivery?.delivery_apartment
                                        ? 'truncate'
                                        : 'truncate text-muted-foreground'
                                    }
                                  >
                                    {c?.delivery?.delivery_apartment || '—'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Separator className="flex-shrink-0" />
          <DialogFooter className="flex-shrink-0 p-4 pt-3 sm:justify-between">
            {mode === 'index' ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode('main')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant={listTab === 'orders' ? 'default' : 'outline'}
                      onClick={() => setListTab('orders')}
                    >
                      {t('monitor_orders')}
                    </Button>
                    <Button
                      variant={listTab === 'returns' ? 'default' : 'outline'}
                      onClick={() => setListTab('returns')}
                    >
                      {t('monitor_returns')}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      queryClient.invalidateQueries({
                        queryKey: ['admin-monitor-client-index', clientKey],
                      })
                      queryClient.invalidateQueries({
                        queryKey: ['admin-monitor-client-orders', clientKey],
                      })
                      queryClient.invalidateQueries({
                        queryKey: ['admin-monitor-client-returns', clientKey],
                      })
                      toast.info(t('monitor_refreshed'))
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : mode === 'ip' ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode('main')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['admin-monitor-client-ips', clientKey],
                    })
                    queryClient.invalidateQueries({
                      queryKey: ['admin-monitor-client-visits', clientKey],
                    })
                    toast.info(t('monitor_refreshed'))
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </>
            ) : mode === 'cart' ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode('main')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  {cartItems.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('monitor_cart_summary')}:{' '}
                      <span className="font-bold text-lg">
                        {fmt.format(cartTotal)} ₴
                      </span>
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      queryClient.invalidateQueries({
                        queryKey: ['admin-monitor-client-cart', clientKey],
                      })
                      toast.info(t('monitor_refreshed'))
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : mode === 'loyalty' ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode('main')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['admin-monitor-client-loyalty', clientKey],
                    })
                    queryClient.invalidateQueries({
                      queryKey: [
                        'admin-monitor-client-loyalty-stats',
                        clientKey,
                      ],
                    })
                    toast.info(t('monitor_refreshed'))
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setMode('cart')}
                    disabled={!data}
                  >
                    <ShoppingCart className="w-4 h-4" /> {t('monitor_cart')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setMode('index')}
                    disabled={!data}
                  >
                    <Activity className="w-4 h-4" /> {t('monitor_index_button')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setMode('ip')}
                    disabled={!data}
                  >
                    <Network className="w-4 h-4" /> {t('monitor_ip_button')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setMode('loyalty')}
                    disabled={!data || c?.is_anonymous}
                  >
                    <Gift className="w-4 h-4" /> {t('monitor_loyalty_button')}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['admin-monitor-client', clientKey],
                    })
                    toast.info(t('monitor_refreshed'))
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

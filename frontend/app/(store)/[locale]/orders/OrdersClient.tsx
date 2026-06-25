'use client'

import React, { useCallback, useMemo, useState, useEffect } from 'react'
import { useMessages, useLocale } from 'next-intl'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Package, ChevronRight, ArrowLeft, RotateCcw } from 'lucide-react'
import { useQuery, useQueries } from '@tanstack/react-query'
import api from '@/lib/api'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { NpWaybillBadge } from '@/components/ui/NpWaybillBadge'
import CatalogPagination from '@/components/features/CatalogPagination'
import { useAuthStore } from '@/store/authStore'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { useOrderSync } from '@/lib/orderSync'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'

const PAGE_SIZE = 10

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

function OrdersSkeleton() {
  return (
    <div className="rounded-lg border bg-card divide-y">
      <div className="grid grid-cols-6 gap-4 px-6 py-3 text-sm font-medium text-muted-foreground bg-muted/50">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-6 gap-4 px-6 py-4 items-center">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export default function OrdersPage() {
  useOrderSync()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const messages = useMessages()
  const msgs = messages as Record<string, any>
  const t = (key: string) => msgs?.common?.[key] ?? key
  const locale = LOCALE_MAP[useLocale()] || 'ru-RU'
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated } = useAuthStore()

  const page = useMemo(() => {
    const value = Number(searchParams?.get('page') || '1')
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page],
    queryFn: async () => {
      const { data } = await api.get('/orders', {
        params: { page, page_size: PAGE_SIZE },
      })
      return data as {
        items: any[]
        total: number
        page: number
        page_size: number
      }
    },
    enabled: isAuthenticated,
  })

  const { data: activeData } = useQuery({
    queryKey: ['orders-active'],
    queryFn: async () => {
      const { data } = await api.get('/orders', {
        params: {
          page: 1,
          page_size: 1,
          status: 'pending,confirmed,processing,shipped',
        },
      })
      return data as { total: number }
    },
    enabled: isAuthenticated,
  })

  // ── NP waybill summaries for the TTN column ───────────────────────────────
  const orderIds = data?.items?.map((o: any) => o.id) ?? []
  const npSummaries = useQueries({
    queries: orderIds.map((id: number) => ({
      queryKey: ['np-summary', id],
      queryFn: () =>
        novaPoshtaApi.getOrderWaybillSummary(id).then((r) => r.data),
      staleTime: 30000,
    })),
    combine: (results) => results.map((r) => r.data ?? null),
  })

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (nextPage <= 1) {
        params.delete('page')
      } else {
        params.set('page', String(nextPage))
      }
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    },
    [pathname, router, searchParams],
  )

  if (!mounted) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-9 w-48" />
        </div>
        <OrdersSkeleton />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <Package className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{t('my_orders')}</h1>
        <p className="text-muted-foreground">{t('orders_empty_desc')}</p>
        <Link href="/auth/login">
          <Button size="lg">{t('login')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-8">
          <Package className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold">{t('my_orders')}</h1>
          <Badge variant="secondary" className="text-sm px-1.5">
            {activeData?.total ?? data?.total ?? 0}
          </Badge>
        </div>

        {isLoading ? (
          <OrdersSkeleton />
        ) : !data?.items?.length ? (
          <div className="flex flex-col items-center justify-center text-center py-20 space-y-6">
            <div className="bg-muted rounded-full p-6">
              <Package className="w-16 h-16 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold">{t('orders_empty_title')}</h2>
            <Link href="/catalog">
              <Button size="lg">
                <ArrowLeft className="mr-2 h-5 w-5" />
                {t('go_to_catalog')}
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <div className="grid grid-cols-[200px_200px_200px_200px_200px_1fr] gap-2 px-4 py-3 text-sm font-medium text-muted-foreground bg-muted/50 rounded-t-lg border-b">
                <span>{t('order_number')}</span>
                <span>{t('status')}</span>
                <span>{t('order_time')}</span>
                <span>{t('order_sum')}</span>
                <span>{t('novaposhta_ttn')}</span>
                <span></span>
              </div>
              <div className="divide-y">
                {data.items.map((order: any, idx: number) => {
                  const statusInfo = ORDER_STATUS_LABELS[order.status] || {
                    labelKey: 'order_pending',
                    className: 'bg-gray-500 text-white',
                  }
                  const date = new Date(order.created_at + 'Z').toLocaleString(
                    locale,
                    {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  )
                  const summary = npSummaries[idx] ?? null
                  return (
                    <div
                      key={order.id}
                      className="grid grid-cols-[200px_200px_200px_200px_200px_1fr] gap-2 px-4 py-4 items-center"
                    >
                      <span className="font-bold font-mono">
                        {order.order_number || `#${order.id}`}
                      </span>
                      <Badge
                        className={`${statusInfo.className} border-0 text-sm w-fit`}
                      >
                        {t(statusInfo.labelKey)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {date}
                      </span>
                      <span className="font-semibold">
                        {fmt(Number(order.total))} ₴
                      </span>
                      {summary ? (
                        <NpWaybillBadge
                          npNumber={summary.np_number}
                          exists={summary.exists}
                          isDeleted={summary.is_deleted}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="lg"
                          className="gap-2"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          {t('details')} <ChevronRight className="w-4 h-4" />
                        </Button>
                        {order.can_return && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="lg"
                                className="gap-2"
                                onClick={async () => {
                                  try {
                                    const { data } = await api.post(
                                      `/returns/from-order/${order.id}`,
                                      { items: [] },
                                    )
                                    router.push(`/returns/${data.id}`)
                                  } catch (e: any) {
                                    toast.error(
                                      e?.response?.data?.detail || t('error'),
                                    )
                                  }
                                }}
                              >
                                <RotateCcw className="w-4 h-4" />
                                {t('return')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('returns')}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <CatalogPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

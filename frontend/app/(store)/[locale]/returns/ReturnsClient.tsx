'use client'

import React, { useCallback, useMemo, useState, useEffect } from 'react'
import { useMessages, useLocale } from 'next-intl'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  ScanBarcode,
  ScanLine,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import CatalogPagination from '@/components/features/CatalogPagination'
import { useAuthStore } from '@/store/authStore'
import { RETURN_STATUS_LABELS } from '@/lib/constants'

const PAGE_SIZE = 10

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

function ReturnsSkeleton() {
  return (
    <div className="rounded-lg border bg-card divide-y">
      <div className="grid grid-cols-5 gap-4 px-6 py-3 text-sm font-medium text-muted-foreground bg-muted/50">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-4 px-6 py-4 items-center">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export default function ReturnsPage() {
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
    queryKey: ['returns', page],
    queryFn: async () => {
      const { data } = await api.get('/returns', {
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
        <ReturnsSkeleton />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <RotateCcw className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{t('my_returns')}</h1>
        <p className="text-muted-foreground">{t('returns_empty_desc')}</p>
        <Link href="/auth/login">
          <Button size="lg">{t('login')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <RotateCcw className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">{t('my_returns')}</h1>
        <Badge variant="secondary" className="text-sm px-1.5">
          {data?.total ?? 0}
        </Badge>
      </div>

      {isLoading ? (
        <ReturnsSkeleton />
      ) : !data?.items?.length ? (
        <div className="flex flex-col items-center justify-center text-center py-20 space-y-6">
          <div className="bg-muted rounded-full p-6">
            <RotateCcw className="w-16 h-16 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold">{t('returns_empty_title')}</h2>
          <Link href="/orders">
            <Button size="lg">
              <ArrowLeft className="mr-2 h-5 w-5" />
              {t('my_orders')}
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <div className="grid grid-cols-[200px_200px_200px_200px_200px_1fr] gap-2 px-4 py-3 text-sm font-medium text-muted-foreground bg-muted/50 rounded-t-lg border-b">
              <span>{t('return_number')}</span>
              <span>{t('status')}</span>
              <span>Время возврата</span>
              <span>{t('return_total')}</span>
              <span>ТТН</span>
              <span></span>
            </div>
            <div className="divide-y">
              {data.items.map((ret: any) => {
                const statusInfo = RETURN_STATUS_LABELS[ret.status] || {
                  labelKey: 'return_pending',
                  className: 'bg-gray-500 text-white',
                }
                const date = new Date(ret.created_at + 'Z').toLocaleString(
                  locale,
                  {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )
                const ttnFormatted = ret.ttn_number
                  ? ret.ttn_number.replace(
                      /(\d{2})(\d{4})(\d{4})(\d{4})/,
                      '$1 $2 $3 $4',
                    )
                  : null
                return (
                  <div
                    key={ret.id}
                    className="grid grid-cols-[200px_200px_200px_200px_200px_1fr] gap-2 px-4 py-4 items-center hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-bold font-mono">
                      {ret.return_number || `#${ret.id}`}
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
                      {fmt(Number(ret.total_refund))} ₴
                    </span>
                    <span>
                      {ttnFormatted ? (
                        <Badge className="bg-green-500 text-white border-0 text-sm font-mono gap-1.5">
                          <ScanBarcode className="w-3.5 h-3.5" />
                          {ttnFormatted}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-500 text-white border-0 text-sm font-mono gap-1.5">
                          <ScanLine className="w-3.5 h-3.5" />
                          XX XXXX XXXX XXXX
                        </Badge>
                      )}
                    </span>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="lg"
                        className="gap-2"
                        onClick={() => router.push(`/returns/${ret.id}`)}
                      >
                        {t('details')} <ChevronRight className="w-4 h-4" />
                      </Button>
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
  )
}

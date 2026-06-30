'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  Gift,
  Copy,
  ArrowLeft,
  Loader2,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const PAGE_SIZE = 10

export default function LoyaltyClient() {
  const t = useTranslations('common')
  const { isAuthenticated } = useAuthStore()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['my-promocodes', page],
    queryFn: async () => {
      const { data } = await api.get('/loyalty', {
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

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <Gift className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{t('login_required')}</h1>
        <Link href="/auth/login">
          <Button size="lg">{t('login')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Gift className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold">{t('loyalty_title')}</h1>
          </div>
          <Link href="/profile">
            <Button variant="outline" size="lg" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {t('back')}
            </Button>
          </Link>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center space-y-4">
                <Package className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">{t('loyalty_empty')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground w-[150px]">
                        {t('loyalty_code')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[120px]">
                        {t('loyalty_type')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[250px]">
                        {t('loyalty_reason')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">
                        {t('status')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[170px]">
                        {t('loyalty_created_at')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[170px]">
                        {t('loyalty_expires_at')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => {
                      const expired = new Date(item.expires_at) < new Date()
                      return (
                        <tr
                          key={item.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <code className="font-mono text-sm font-bold tracking-wider">
                                {item.code}
                              </code>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10"
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.code)
                                      toast.success(t('copied'))
                                    }}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('copy')}</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge
                              className={`${item.type === 'delivery' ? 'bg-blue-500' : 'bg-purple-500'} text-white border-0 text-sm`}
                            >
                              {item.type === 'delivery'
                                ? t('loyalty_type_delivery')
                                : t('loyalty_type_margin')}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm">{item.reason}</td>
                          <td className="p-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  className={`${item.used_at ? 'bg-green-500' : expired ? 'bg-red-500' : 'bg-gray-500'} text-white border-0 text-sm cursor-pointer`}
                                >
                                  {item.used_at
                                    ? t('loyalty_status_used')
                                    : expired
                                      ? t('loyalty_status_expired')
                                      : t('loyalty_status_unused')}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {item.used_at
                                  ? `${t('loyalty_used_at')}: ${new Date(item.used_at + 'Z').toLocaleString()}`
                                  : ''}
                                {!item.used_at && expired
                                  ? `${t('loyalty_expired_at')}: ${new Date(item.expires_at + 'Z').toLocaleString()}`
                                  : ''}
                                {!item.used_at && !expired
                                  ? `${t('loyalty_valid_until')}: ${new Date(item.expires_at + 'Z').toLocaleString()}`
                                  : ''}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(item.created_at + 'Z').toLocaleString()}
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}
                            >
                              {new Date(item.expires_at + 'Z').toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t">
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p: number
                    if (totalPages <= 5) p = i + 1
                    else if (page <= 3) p = i + 1
                    else if (page >= totalPages - 2) p = totalPages - 4 + i
                    else p = page - 2 + i
                    return (
                      <Button
                        key={p}
                        variant={p === page ? 'default' : 'outline'}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

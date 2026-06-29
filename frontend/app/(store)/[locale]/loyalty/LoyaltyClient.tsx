'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Gift, Copy, ArrowLeft, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function LoyaltyClient() {
  const t = useTranslations('common')
  const { isAuthenticated } = useAuthStore()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['my-promocodes'],
    queryFn: async () => {
      const { data } = await api.get('/loyalty', { params: { page: 1, page_size: 50 } })
      return data
    },
    enabled: isAuthenticated,
  })

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <Gift className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{t('login_required')}</h1>
        <Link href="/auth/login"><Button size="lg">{t('login')}</Button></Link>
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
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
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
                      <th className="text-left p-3 font-medium text-muted-foreground w-[140px]">{t('loyalty_code')}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground w-[80px]">{t('loyalty_discount_percent')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">{t('loyalty_type')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t('loyalty_reason')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[150px]">{t('loyalty_created_at')}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[150px]">{t('loyalty_expires_at')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => {
                      const expired = new Date(item.expires_at) < new Date()
                      return (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <code className="font-mono text-sm font-bold tracking-wider">{item.code}</code>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm font-semibold">{item.discount_percent || 100}%</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => { navigator.clipboard.writeText(item.code); toast.success(t('copied')) }}>
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('copy')}</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge className={`${item.type === 'delivery' ? 'bg-blue-500' : 'bg-purple-500'} text-white border-0 text-sm`}>
                              {item.type === 'delivery' ? t('loyalty_type_delivery') : t('loyalty_type_margin')}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm">{item.reason}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {new Date(item.created_at + 'Z').toLocaleString()}
                          </td>
                          <td className="p-3">
                            <span className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}>
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
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

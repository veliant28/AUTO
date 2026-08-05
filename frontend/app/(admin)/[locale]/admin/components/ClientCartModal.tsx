'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ShoppingCart, PackageOpen } from 'lucide-react'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import api from '@/lib/api'

const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
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

interface ClientCartModalProps {
  clientKey: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Корзина клиента (серверная синхронизация из «Монитора»). */
export default function ClientCartModal({
  clientKey,
  open,
  onOpenChange,
}: ClientCartModalProps) {
  const t = useTranslations('admin')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-monitor-client-cart', clientKey],
    queryFn: async () => {
      const { data } = await api.get<MonitorCartResponse>(
        `/admin/monitor/clients/${clientKey}/cart`,
      )
      return data
    },
    enabled: !!clientKey && open,
    refetchInterval: 10000,
  })

  const items = data?.items ?? []
  const total = items.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] max-w-[1200px] h-[80vh] overflow-hidden flex flex-col !p-0 !gap-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            {t('monitor_cart_title')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t('monitor_cart_items', { count: data?.total ?? 0 })}
          </p>
        </DialogHeader>
        <Separator className="flex-shrink-0" />
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
          {isLoading && !data ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <PackageOpen className="w-12 h-12" />
              <p className="text-sm">{t('monitor_cart_empty')}</p>
            </div>
          ) : (
            items.map((item) => (
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
                          <Badge variant="secondary" className="text-sm px-1.5">
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
                      {item.price != null ? `${fmt.format(item.price)} ₴` : '—'}
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
        {items.length > 0 && (
          <>
            <Separator className="flex-shrink-0" />
            <div className="flex-shrink-0 p-4 pt-3 flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                {t('monitor_cart_summary')}:
              </span>
              <span className="font-bold text-lg">{fmt.format(total)} ₴</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

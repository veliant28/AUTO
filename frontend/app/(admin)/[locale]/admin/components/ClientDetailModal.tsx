'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
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
import { Eye, RefreshCw, ShoppingCart, User } from 'lucide-react'
import { getAvatarUrl, getInitials } from '@/lib/avatar'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import api from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { useTimezone } from '@/hooks/useTimezone'
import { toast } from '@/lib/toast'
import ClientCartModal from './ClientCartModal'

const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
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
    email: string | null
    phone: string | null
    role: string | null
    avatar_index: number | null
    status: 'online' | 'offline'
    first_seen: string | null
    last_seen: string | null
    ip: string | null
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
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const [cartOpen, setCartOpen] = useState(false)

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

  if (!clientKey) return null

  const c = data?.client
  const online = c?.status === 'online'
  const views = data?.views ?? []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
          aria-describedby={undefined}
        >
          <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="h-14 w-14 ring-2 ring-border shrink-0">
                <AvatarImage
                  src={getAvatarUrl(c?.avatar_index, c?.name || clientKey)}
                />
                <AvatarFallback>
                  {getInitials(c?.name || '', clientKey)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    {c?.name || t('monitor_anonymous')}
                  </DialogTitle>
                  <Badge
                    className={`${online ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'} border-0 text-sm`}
                  >
                    {online ? t('monitor_online') : t('monitor_offline')}
                  </Badge>
                  {c?.role && (
                    <Badge variant="secondary" className="text-sm">
                      {t(c.role)}
                    </Badge>
                  )}
                  {c && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.client_id}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('monitor_entered_at')}: {formatDateTime(c?.first_seen, tz)}
                  {c?.ip ? ` · ${c.ip}` : ''}
                </p>
              </div>
            </div>
          </DialogHeader>
          <Separator className="flex-shrink-0" />
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading && !data ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-[2fr_1fr] gap-6 h-full min-h-0 grid-rows-[minmax(0,1fr)] p-6">
                {/* Товары — просмотренные (до 100) */}
                <div className="flex flex-col min-h-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                    <Eye className="w-5 h-5" /> {t('monitor_views_title')}
                    <Badge variant="secondary" className="text-xs">
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
                <div className="flex flex-col min-h-0 overflow-y-auto pr-1">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                    <User className="w-5 h-5" /> {t('recipient_data')}
                  </h4>
                  <div className="mt-3 space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t('phone_label')}
                      </p>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        {formatPhone(c?.phone)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t('monitor_email')}
                      </p>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        {c?.email || '—'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t('monitor_full_name')}
                      </p>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        {c?.name || '—'}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-3">
                        {t('delivery_info')}
                      </p>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t('delivery_type')}
                          </p>
                          <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                            {c?.delivery?.delivery_type
                              ? t(c.delivery.delivery_type) ||
                                c.delivery.delivery_type
                              : '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t('delivery_city')}
                          </p>
                          <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                            {c?.delivery?.delivery_city_label || '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t('delivery_warehouse')}
                          </p>
                          <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                            {c?.delivery?.delivery_warehouse_label || '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t('monitor_delivery_street')}
                          </p>
                          <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                            {c?.delivery?.delivery_street_label || '—'}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {t('monitor_delivery_house')}
                            </p>
                            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                              {c?.delivery?.delivery_house || '—'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {t('monitor_delivery_apartment')}
                            </p>
                            <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                              {c?.delivery?.delivery_apartment || '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Separator className="flex-shrink-0" />
          <DialogFooter className="flex-shrink-0 p-4 pt-3 sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCartOpen(true)}
                disabled={!data}
              >
                <ShoppingCart className="w-4 h-4" /> {t('monitor_cart')}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientCartModal
        clientKey={clientKey}
        open={cartOpen}
        onOpenChange={setCartOpen}
      />
    </>
  )
}

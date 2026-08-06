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
import {
  ArrowLeft,
  Building2,
  Eye,
  MapPin,
  Package,
  PackageOpen,
  RefreshCw,
  ShoppingCart,
  Truck,
  User,
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { getAvatarUrl, getInitials } from '@/lib/avatar'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import api from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { useTimezone } from '@/hooks/useTimezone'
import { toast } from '@/lib/toast'

const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

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
  // Переключатель вида: просмотр товаров <-> корзина (как История в заказе)
  const [showCart, setShowCart] = useState(false)

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
    enabled: !!clientKey && open && showCart,
    refetchInterval: 10000,
  })

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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setShowCart(false)
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
            {showCart ? (
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
            {showCart ? (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCart(false)}>
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
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowCart(true)}
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
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

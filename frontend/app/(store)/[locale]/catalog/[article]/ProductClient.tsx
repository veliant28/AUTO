'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Heart,
  ShoppingCart,
  CircleCheckBig,
  Package,
} from 'lucide-react'
import { usePartDetail } from '@/hooks/usePartDetail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { useCartStore } from '@/store/cartStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import { ApplicabilityTable } from '@/components/features/ApplicabilityTable'
import { getBrandColor, getBrandInitial } from '@/lib/brand'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

export default function ProductClient({ article }: { article: string }) {
  const t = useTranslations('catalog')
  const tc = useTranslations('common')
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const cartItems = useCartStore((s) => s.items)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const favoriteArticles = useFavoritesStore((s) => s.articles)

  const { data, isLoading } = usePartDetail(article)

  const isFavorite = favoriteArticles.includes(article)
  const isInCart = cartItems.some((i) => i.part_id === (data?.part?.id ?? 0))

  const handleAddToCart = () => {
    const imgs = data?.images || []
    const imgUrl =
      data?.part?.image_url ||
      (imgs.length > 0
        ? imgs[0].url || `https://auto-db.pro/images/${imgs[0].name}`
        : null)
    addItem({
      id: `cart-${article}-${Date.now()}`,
      part_id: data?.part?.id ?? 0,
      article,
      part_name: data?.info?.name || data?.part?.name || article,
      quantity: 1,
      price: data?.price?.price ?? null,
      supplier_name: data?.price?.supplier_name || null,
      brand: data?.part?.brand,
      sku: data?.part?.sku ?? null,
      image_url: imgUrl,
    })
    toast.success(tc('added_to_cart'))
  }

  const handleToggleFavorite = async () => {
    const wasFav = isFavorite
    toggleFavorite(article)
    try {
      if (wasFav && data?.part?.id) {
        await api.delete(`/favorites/${data.part.id}`)
      } else if (data?.part?.id) {
        await api.post('/favorites/add', { part_id: data.part.id })
      }
    } catch {}
    toast.success(
      wasFav ? tc('removed_from_favorites') : tc('added_to_favorites'),
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 animate-pulse">
        <Skeleton className="h-9 w-28 rounded-md mb-6" />
        <div className="grid md:grid-cols-3 gap-8">
          <Skeleton className="aspect-square rounded-lg" />
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-24 rounded-sm" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-4 w-1/2 rounded-sm" />
                <Skeleton className="h-4 w-1/3 rounded-sm" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-sm" />
              <Skeleton className="h-4 w-20 rounded-sm" />
            </div>
            <Skeleton className="h-7 w-3/4 rounded-sm" />
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-8 w-28 rounded-sm" />
              <Skeleton className="h-6 w-20 rounded-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>
        </div>
        <Skeleton className="h-px my-6" />
        <div className="grid md:grid-cols-3 gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-5 w-20 rounded-sm" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex gap-2">
                  <Skeleton className="h-4 w-1/3 rounded-sm" />
                  <Skeleton className="h-4 w-1/4 rounded-sm" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data?.info && !data?.part) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button
          variant="outline"
          size="lg"
          className="gap-2 mb-6"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
          {tc('back')}
        </Button>
        <div className="text-center py-20 space-y-4">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">{t('no_results')}</p>
          <Button variant="outline" size="lg" onClick={() => router.back()}>
            {t('title')}
          </Button>
        </div>
      </div>
    )
  }

  const brand = data?.part?.brand
  const name = data?.info?.name || data?.part?.name || article
  const price = data?.price
  const info = data?.info
  const images = data?.images || []
  const crosses = data?.crosses || []
  const oems = data?.oem || []
  const attributes = info?.attributes || []
  const appCount = data?.applicability_count || 0

  const imageUrl =
    data?.part?.image_url ||
    (images.length > 0
      ? images[0].url || `https://auto-db.pro/images/${images[0].name}`
      : null)
  const inStock = price ? price.quantity > 0 : false

  return (
    <div className="container mx-auto py-8 px-4">
      <Button
        variant="outline"
        size="lg"
        className="gap-2 mb-6"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-5 h-5" />
        {tc('back')}
      </Button>

      <div className="grid md:grid-cols-3 gap-8">
        <div
          className={`aspect-square relative rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br border ${getBrandColor(brand)}`}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span className="text-5xl font-bold text-white/40 select-none">
              {getBrandInitial(brand)}
            </span>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm">{t('attributes')}</h4>
          {attributes.length > 0 ? (
            <Table>
              <TableBody>
                {attributes
                  .slice(0, 30)
                  .map((attr: { name: string; value: string }, idx: number) => (
                    <TableRow key={idx}>
                      {attr.name ? (
                        <>
                          <TableCell className="text-muted-foreground text-sm font-medium w-1/2">
                            {attr.name}
                          </TableCell>
                          <TableCell className="text-sm">
                            {attr.value}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="text-sm" colSpan={2}>
                          {attr.value}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('no_attributes')}
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              {brand && (
                <Badge variant="secondary" className="text-sm px-1.5">
                  {brand}
                </Badge>
              )}
              <span className="text-sm font-mono text-muted-foreground">
                {article}
              </span>
            </div>
            {data?.part?.sku && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-blue-500 text-white border-0 text-sm px-1.5 cursor-pointer">
                    {data.part.sku}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{tc('sku')}</TooltipContent>
              </Tooltip>
            )}
          </div>

          <h1 className="text-2xl font-bold leading-snug">{name}</h1>

          {price ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-3xl font-bold">{fmt(price.price)} ₴</span>
              <Badge
                className={`${inStock ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} border-0 text-sm shrink-0`}
              >
                {inStock ? tc('in_stock') : tc('out_of_stock')}
              </Badge>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={handleToggleFavorite}
                >
                  <Heart
                    className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFavorite
                  ? tc('remove_from_favorites')
                  : tc('add_to_favorites')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className={`h-10 w-10 ${isInCart ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
                  onClick={handleAddToCart}
                >
                  {isInCart ? (
                    <CircleCheckBig className="h-5 w-5" />
                  ) : (
                    <ShoppingCart className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isInCart ? tc('in_cart') : tc('add_to_cart')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="grid md:grid-cols-3 gap-8">
        <div className="rounded-lg border bg-card flex flex-col">
          <h4 className="font-semibold text-sm p-4 pb-2">{t('analogs')}</h4>
          <div className="overflow-y-auto max-h-[460px] px-4 pb-4">
            {crosses.length > 0 ? (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="bg-muted/30 text-sm">
                      {t('article')}
                    </TableHead>
                    <TableHead className="bg-muted/30 text-sm">
                      {t('brand')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crosses.map(
                    (
                      cross: { article: string; brand_name?: string },
                      idx: number,
                    ) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {cross.article}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cross.brand_name || '—'}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('no_analogs')}</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card flex flex-col">
          <h4 className="font-semibold text-sm p-4 pb-2">{t('oem')}</h4>
          <div className="overflow-y-auto max-h-[460px] px-4 pb-4">
            {oems.length > 0 ? (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="bg-muted/30 text-sm">
                      {t('article')}
                    </TableHead>
                    <TableHead className="bg-muted/30 text-sm">
                      {t('brand')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oems.map(
                    (
                      oem: { number: string; brand_name?: string },
                      idx: number,
                    ) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {oem.number}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {oem.brand_name || '—'}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('no_oem')}</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <ApplicabilityTable article={article} count={appCount} />
        </div>
      </div>
    </div>
  )
}

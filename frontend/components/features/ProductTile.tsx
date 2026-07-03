'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Heart, ShoppingCart, CircleCheckBig } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { saveCatalogReturnState } from '@/lib/catalog-navigation-state'
import { useCartStore } from '@/store/cartStore'
import { getBrandColor, getBrandInitial } from '@/lib/brand'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

export type ProductTileItem = {
  id: number
  article: string
  name: string
  brand: string | null
  price: number | null
  quantity: number
  currency: string
  image_url: string | null
  isFavorite: boolean
  sku: string | null
}

type ProductTileProps = {
  product: ProductTileItem
  onToggleFavorite: (article: string) => void
  onAddToCart: (product: ProductTileItem) => void
}

/** Карточка товара с ценой, бейджем поставщика и кнопками избранного/корзины */
export default function ProductTile({
  product,
  onToggleFavorite,
  onAddToCart,
}: ProductTileProps) {
  const t = useTranslations('common')
  const inStock = product.quantity > 0
  const cartItems = useCartStore((state) => state.items)
  const isInCart = cartItems.some((i) => i.part_id === product.id)

  const handleClick = () => {
    if (typeof window === 'undefined') return
    const catalogUrl = window.location.pathname + window.location.search
    saveCatalogReturnState({
      catalogUrl,
      article: product.article,
      scrollY: window.scrollY,
      productViewportTop: 0,
    })
  }

  return (
    <Card
      className="group overflow-hidden transition-shadow hover:shadow-md"
      data-article={product.article}
      data-sku={product.sku}
    >
      <Link
        href={`/catalog/${product.sku || product.article}`}
        onClick={handleClick}
        className="block"
      >
        <div
          className={`aspect-square relative flex items-center justify-center bg-gradient-to-br border-b ${getBrandColor(product.brand)}`}
        >
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span className="text-5xl font-bold text-white/40 select-none">
              {getBrandInitial(product.brand)}
            </span>
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <Link
          href={`/catalog/${product.sku || product.article}`}
          onClick={handleClick}
          className="block"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {product.brand && (
              <Badge variant="secondary" className="text-sm px-1.5">
                {product.brand}
              </Badge>
            )}
            <span className="text-sm font-mono text-muted-foreground">
              {product.article}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug line-clamp-2 mt-1 min-h-[2.5em]">
            {product.name}
          </p>
        </Link>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {product.price != null ? (
              <span className="font-bold text-base">
                {fmt(product.price)}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  ₴
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <Badge
            className={`${inStock ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} border-0 text-sm shrink-0`}
          >
            {inStock ? t('in_stock') : t('out_of_stock')}
          </Badge>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={(e) => {
                  e.preventDefault()
                  onToggleFavorite(product.article)
                }}
              >
                <Heart
                  className={`h-5 w-5 ${product.isFavorite ? 'fill-red-500 text-red-500' : ''}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {product.isFavorite
                ? t('remove_from_favorites')
                : t('add_to_favorites')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className={`h-10 w-10 ${isInCart ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
                onClick={(e) => {
                  e.preventDefault()
                  onAddToCart(product)
                }}
              >
                {isInCart ? (
                  <CircleCheckBig className="h-5 w-5" />
                ) : (
                  <ShoppingCart className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isInCart ? t('in_cart') : t('add_to_cart')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  )
}

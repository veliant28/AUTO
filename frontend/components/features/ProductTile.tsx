'use client';

import React from 'react';
import Link from 'next/link';
import { Heart, ShoppingCart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { saveCatalogReturnState } from '@/lib/catalog-navigation-state';

export type ProductTileItem = {
  id: number;
  article: string;
  name: string;
  brand: string | null;
  price: number | null;
  quantity: number;
  currency: string;
  image_url: string | null;
  isFavorite: boolean;
};

type ProductTileProps = {
  product: ProductTileItem;
  onToggleFavorite: (article: string) => void;
  onAddToCart: (product: ProductTileItem) => void;
};

const BRAND_COLORS: Record<string, string> = {
  A: 'from-blue-500 to-blue-700',
  B: 'from-emerald-500 to-emerald-700',
  C: 'from-cyan-500 to-cyan-700',
  D: 'from-indigo-500 to-indigo-700',
  E: 'from-violet-500 to-violet-700',
  F: 'from-orange-500 to-orange-700',
  G: 'from-teal-500 to-teal-700',
  H: 'from-rose-500 to-rose-700',
  I: 'from-sky-500 to-sky-700',
  J: 'from-fuchsia-500 to-fuchsia-700',
  K: 'from-pink-500 to-pink-700',
  L: 'from-lime-500 to-lime-700',
  M: 'from-amber-500 to-amber-700',
  N: 'from-purple-500 to-purple-700',
  O: 'from-red-500 to-red-700',
  P: 'from-yellow-500 to-yellow-700',
  Q: 'from-green-500 to-green-700',
  R: 'from-gray-500 to-gray-700',
  S: 'from-slate-500 to-slate-700',
  T: 'from-stone-500 to-stone-700',
  U: 'from-neutral-500 to-neutral-700',
  V: 'from-zinc-500 to-zinc-700',
  W: 'from-blue-600 to-blue-800',
  X: 'from-red-600 to-red-800',
  Y: 'from-emerald-600 to-emerald-800',
  Z: 'from-violet-600 to-violet-800',
};

function getBrandColor(brand: string | null): string {
  const first = brand?.charAt(0)?.toUpperCase() || '?';
  return BRAND_COLORS[first] || 'from-primary/40 to-primary/20';
}

function getBrandInitial(_brand: string | null): string {
  return 'S';
}

export default function ProductTile({ product, onToggleFavorite, onAddToCart }: ProductTileProps) {
  const inStock = product.quantity > 0;

  const handleClick = () => {
    if (typeof window === "undefined") return;
    const catalogUrl = window.location.pathname + window.location.search;
    saveCatalogReturnState({
      catalogUrl,
      article: product.article,
      scrollY: window.scrollY,
      productViewportTop: 0,
    });
  };

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md" data-article={product.article}>
      <Link href={`/catalog/${product.article}`} onClick={handleClick} className="block">
        <div className={`aspect-square relative flex items-center justify-center bg-gradient-to-br ${getBrandColor(product.brand)}`}>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="text-5xl font-bold text-white/40 select-none">
              {getBrandInitial(product.brand)}
            </span>
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <Link href={`/catalog/${product.article}`} onClick={handleClick} className="block">
          <div className="flex items-center gap-1.5 flex-wrap">
            {product.brand && (
              <Badge variant="secondary" className="text-sm px-1.5">{product.brand}</Badge>
            )}
            <span className="text-sm font-mono text-muted-foreground">{product.article}</span>
          </div>
          <p className="text-sm font-medium leading-snug line-clamp-2 mt-1 min-h-[2.5em]">
            {product.name}
          </p>
        </Link>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {product.price != null ? (
              <span className="font-bold text-base">
                {product.price.toLocaleString()} <span className="text-base font-normal text-muted-foreground">₴</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <Badge className={`${inStock ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} border-0 text-sm shrink-0`}>
            {inStock ? "В наличии" : "Нет"}
          </Badge>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={(e) => { e.preventDefault(); onToggleFavorite(product.article); }}
              >
                <Heart className={`h-4 w-4 ${product.isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{product.isFavorite ? 'Убрать из избранного' : 'В избранное'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-9 w-9 bg-green-500 text-white hover:bg-green-600"
                onClick={(e) => { e.preventDefault(); onAddToCart(product); }}
              >
                <ShoppingCart className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>В корзину</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Heart, ShoppingCart, Package } from 'lucide-react';
import { usePartDetail } from '@/hooks/usePartDetail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useCartStore } from '@/store/cartStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { toast } from '@/lib/toast';
import { ApplicabilityTable } from '@/components/features/ApplicabilityTable';

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

export default function ProductClient({ article }: { article: string }) {
  const t = useTranslations('catalog');
  const tc = useTranslations('common');
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favoriteArticles = useFavoritesStore((s) => s.articles);

  const { data, isLoading } = usePartDetail(article);

  const isFavorite = favoriteArticles.includes(article);

  const handleAddToCart = () => {
    addItem({
      id: `cart-${article}-${Date.now()}`,
      part_id: data?.part?.id ?? 0,
      article,
      part_name: data?.info?.name || data?.part?.name || article,
      quantity: 1,
      price: data?.price?.price ?? null,
      supplier_name: data?.price?.supplier_name || null,
    });
    toast.success(tc('added_to_cart'));
  };

  const handleToggleFavorite = () => {
    toggleFavorite(article);
    toast.success(isFavorite ? tc('removed_from_favorites') : tc('added_to_favorites'));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Skeleton className="h-9 w-28 rounded-md mb-6" />
        <div className="grid md:grid-cols-3 gap-8">
          <Skeleton className="aspect-square rounded-md" />
          <Skeleton className="h-40 rounded-md" />
          <div className="space-y-4">
            <Skeleton className="h-5 w-20 rounded-sm" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-5 w-16" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.info && !data?.part) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="outline" className="h-9 gap-2 mb-6" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" /> {t('title')}
        </Button>
        <div className="text-center py-20 space-y-4">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">{t('no_results')}</p>
          <Button variant="outline" onClick={() => router.back()}>{t('title')}</Button>
        </div>
      </div>
    );
  }

  const brand = data?.part?.brand;
  const name = data?.info?.name || data?.part?.name || article;
  const price = data?.price;
  const info = data?.info;
  const images = data?.images || [];
  const crosses = data?.crosses || [];
  const oems = data?.oem || [];
  const attributes = info?.attributes || [];
  const appCount = data?.applicability_count || 0;

  const imageUrl = images.length > 0 ? images[0].url || `https://auto-db.pro/images/${images[0].name}` : null;
  const inStock = price ? price.quantity > 0 : false;

  return (
    <div className="container mx-auto py-8 px-4">
        <Button variant="outline" className="h-9 gap-2 mb-6" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" /> {t('title')}
        </Button>

      <div className="grid md:grid-cols-3 gap-8">
        <div className={`aspect-square relative rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br ${getBrandColor(brand)}`}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="absolute inset-0 w-full h-full object-contain p-4"
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
                {attributes.slice(0, 30).map((attr: { name: string; value: string }, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground text-sm font-medium w-1/2">
                      {attr.name}
                    </TableCell>
                    <TableCell className="text-sm">{attr.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('no_attributes')}</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {brand && (
              <Badge variant="secondary" className="text-sm px-1.5">{brand}</Badge>
            )}
            <span className="text-sm font-mono text-muted-foreground">{article}</span>
          </div>

          <h1 className="text-2xl font-bold leading-snug">{name}</h1>

          {price ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-3xl font-bold">
                {price.price.toLocaleString()} ₴
              </span>
              <Badge className={`${inStock ? 'bg-green-500 text-white' : 'bg-red-500 text-white'} border-0 text-sm shrink-0`}>
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
                  className="h-9 w-9"
                  onClick={handleToggleFavorite}
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFavorite ? tc('remove_from_favorites') : tc('add_to_favorites')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="h-9 w-9 bg-green-500 text-white hover:bg-green-600"
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tc('add_to_cart')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="grid md:grid-cols-3 gap-8">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm">{t('analogs')}</h4>
          {crosses.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-muted/30 text-sm">{t('article')}</TableHead>
                  <TableHead className="bg-muted/30 text-sm">{t('brand')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crosses.map((cross: { article: string; brand_id?: number }, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{cross.article}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cross.brand_id ? `ID: ${cross.brand_id}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('no_analogs')}</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm">{t('oem')}</h4>
          {oems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-muted/30 text-sm">{t('article')}</TableHead>
                  <TableHead className="bg-muted/30 text-sm">{t('brand')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oems.map((oem: { number: string; manufacturer_id?: number }, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{oem.number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {oem.manufacturer_id ? `ID: ${oem.manufacturer_id}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('no_oem')}</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <ApplicabilityTable article={article} count={appCount} />
        </div>
      </div>
    </div>
  );
}

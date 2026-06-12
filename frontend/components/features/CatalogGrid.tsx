'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import ProductTile, { ProductTileItem } from './ProductTile';

type CatalogGridProps = {
  products: ProductTileItem[];
  isLoading: boolean;
  onToggleFavorite: (article: string, isFavorite: boolean) => void;
  onAddToCart: (product: ProductTileItem) => void;
};

function TileSkeleton() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-3 space-y-2">
        <div className="flex gap-1.5">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-14 rounded" />
        </div>
        <div className="flex gap-1 pt-1">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export default function CatalogGrid({ products, isLoading, onToggleFavorite, onAddToCart }: CatalogGridProps) {
  const t = useTranslations('common');

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <TileSkeleton key={i} />)}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="text-center py-20 space-y-4">
        <Package className="w-16 h-16 mx-auto text-muted-foreground/40" />
        <p className="text-lg font-medium">{t('no_results')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductTile
          key={`${product.article}-${product.id}`}
          product={product}
          onToggleFavorite={onToggleFavorite}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  );
}

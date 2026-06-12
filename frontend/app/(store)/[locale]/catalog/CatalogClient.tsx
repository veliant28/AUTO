'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { useParts } from '@/hooks/usePartData';
import CatalogGrid from '@/components/features/CatalogGrid';
import CatalogPagination from '@/components/features/CatalogPagination';
import FilterSheet from '@/components/features/FilterSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { toast } from '@/lib/toast';
import { readCatalogReturnState, clearCatalogReturnState, restoreCatalogScroll } from '@/lib/catalog-navigation-state';

export default function CatalogPage() {
  const t = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((s) => s.addItem);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const categoryId = searchParams.get('categoryId');

  const [filters, setFilters] = useState({ in_stock_only: false, min_price: '', max_price: '', sort_by: '', sort_order: 'asc' });
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);

  const activeFilterCount = [filters.in_stock_only, filters.min_price, filters.max_price, filters.sort_by].filter(Boolean).length;

  const { data, isLoading } = useParts(
    categoryId ?? '',
    { page, in_stock_only: filters.in_stock_only || undefined, min_price: filters.min_price ? Number(filters.min_price) : undefined, max_price: filters.max_price ? Number(filters.max_price) : undefined, sort_by: filters.sort_by || undefined, sort_order: filters.sort_order },
  );

  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  const clearFilters = useCallback(() => {
    setFilters({ in_stock_only: false, min_price: '', max_price: '', sort_by: '', sort_order: 'asc' });
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/catalog?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleToggleFavorite = useCallback(async (article: string, isFavorite: boolean) => {
    // TODO: implement favorites API integration
    toast.success(isFavorite ? 'Убрано из избранного' : 'Добавлено в избранное');
  }, []);

  const handleAddToCart = useCallback((product: any) => {
    addItem({
      id: `cart-${product.article}-${Date.now()}`,
      part_id: product.id,
      article: product.article,
      part_name: product.name,
      quantity: 1,
      price: product.price,
      supplier_name: product.brand,
    });
    toast.success(t('added_to_cart'));
  }, [addItem, t]);

  // Scroll restoration: on mount, check for saved scroll state
  useEffect(() => {
    const saved = readCatalogReturnState();
    if (saved) {
      clearCatalogReturnState();
      if (!isLoading) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            restoreCatalogScroll(saved);
          });
        });
      }
    }
  }, [isLoading]);

  if (!categoryId) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-20 space-y-4">
          <p className="text-lg font-medium">Выберите категорию из каталога в шапке сайта</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowDesktopFilters(!showDesktopFilters)}>
            <SlidersHorizontal className="w-4 h-4" />
            {t('filters')}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">{activeFilterCount}</Badge>
            )}
          </Button>
        </div>
      </div>

      {showDesktopFilters && (
        <div className="p-4 rounded-lg border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{t('filters_sort')}</h4>
            <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setShowDesktopFilters(false); }} className="text-xs gap-1">
              <X className="w-3 h-3" /> {t('close')}
            </Button>
          </div>
          <Separator />
          <FilterSheet filters={filters} onChange={setFilters} onClear={clearFilters} activeCount={activeFilterCount} />
        </div>
      )}

      <CatalogGrid
        products={products.map((p: any) => ({ ...p, isFavorite: false }))}
        isLoading={isLoading}
        onToggleFavorite={handleToggleFavorite}
        onAddToCart={handleAddToCart}
      />

      <CatalogPagination page={page} pageSize={25} total={total} onPageChange={handlePageChange} />
    </div>
  );
}

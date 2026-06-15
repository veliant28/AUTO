'use client';

import React, { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { toast } from '@/lib/toast';
import CatalogGrid from '@/components/features/CatalogGrid';
import CatalogPagination from '@/components/features/CatalogPagination';
import type { ProductTileItem } from '@/components/features/ProductTile';

const PAGE_SIZE = 24;

export default function FavoritesClient() {
  const t = useTranslations('common');
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const { addItem } = useCartStore();

  const page = useMemo(() => {
    const value = Number(searchParams?.get('page') || '1');
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['favorites', page],
    queryFn: async () => {
      const { data } = await api.get('/favorites/', { params: { page, page_size: PAGE_SIZE } });
      return data as { items: any[]; total: number; page: number; page_size: number };
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const removeMutation = useMutation({
    mutationFn: async (partId: number) => {
      await api.delete(`/favorites/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success(t('removed_from_favorites'));
    },
  });

  const toggleFavStore = useFavoritesStore((s) => s.toggleFavorite);

  const handleToggleFavorite = useCallback(
    (article: string) => {
      if (!data?.items) return;
      const item = data.items.find((p: any) => p.article === article);
      if (item) {
        toggleFavStore(article);
        removeMutation.mutate(item.id);
      }
    },
    [data, removeMutation, toggleFavStore],
  );

  const handleAddToCart = useCallback(
    (product: ProductTileItem) => {
      addItem({ id: `cart-${product.article}-${Date.now()}`, part_id: product.id, article: product.article, part_name: product.name, quantity: 1, price: product.price, supplier_name: null, brand: product.brand, image_url: product.image_url });
      toast.success(t('added_to_cart'));
    },
    [addItem, t],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (nextPage <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(nextPage));
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [pathname, router, searchParams],
  );

  const products: ProductTileItem[] = useMemo(
    () =>
      (data?.items ?? []).map((item: any) => ({
        id: item.id,
        article: item.article,
        name: item.name,
        brand: item.brand,
        price: item.price ?? null,
        quantity: item.quantity ?? 0,
        currency: item.currency ?? 'UAH',
        image_url: item.image_url ?? null,
        isFavorite: true,
      })),
    [data],
  );

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <Heart className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('favorites')}</h1>
        <p className="text-muted-foreground">{t('favorites_login_desc')}</p>
        <Link href="/auth/login">
          <Button size="lg">{t('login')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">{t('favorites')}</h1>
      </div>

      {isLoading ? (
        <CatalogGrid products={[]} isLoading={true} onToggleFavorite={handleToggleFavorite} onAddToCart={handleAddToCart} />
      ) : products.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Heart className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">{t('favorites_empty_title')}</p>
          <p className="text-muted-foreground text-sm">{t('favorites_empty_title_desc')}</p>
          <Link href="/">
            <Button size="lg">{t('go_home')}</Button>
          </Link>
        </div>
      ) : (
        <>
          <CatalogGrid products={products} isLoading={false} onToggleFavorite={handleToggleFavorite} onAddToCart={handleAddToCart} />
          <CatalogPagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={handlePageChange} />
        </>
      )}
    </div>
  );
}
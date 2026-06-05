'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ShoppingCart, Car, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Separator } from '@/components/ui/separator';
import { useCartStore } from '@/store/cartStore';
import { toast } from '@/lib/toast';
import ImageGallery from '@/components/features/ImageGallery';
import { APPLICABILITY_LIMIT, APPLICABILITY_PREVIEW } from '@/lib/constants';

function ApplicabilitySection({ article: art }: { article: string }) {
  const [showAll, setShowAll] = useState(false);
  const t = useTranslations('catalog');

  const { data, isLoading } = useQuery({
    queryKey: ['applicability', art],
    queryFn: async () => {
      const { data } = await api.get(`/catalog/parts/${art}/applicability`, {
        params: { page: 1, limit: APPLICABILITY_LIMIT },
      });
      return data;
    },
    enabled: !!art,
  });

  const vehicles = data?.vehicles || [];
  const total = data?.total || 0;
  const displayVehicles = showAll ? vehicles : vehicles.slice(0, APPLICABILITY_PREVIEW);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (vehicles.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <Car className="w-3.5 h-3.5" /> {t('applicability')} ({total})
      </h4>
      <div className="rounded-md border divide-y text-sm">
        {displayVehicles.map((v: any, idx: number) => (
          <div key={idx} className="px-3 py-1.5">
            <span className="font-medium">{v.brand_name}</span>
            {' '}{v.model_name}{' '}
            <span className="text-muted-foreground">({v.mod_name})</span>
          </div>
        ))}
      </div>
      {vehicles.length > APPLICABILITY_PREVIEW && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1 text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>{t('collapse')} <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>{t('show_all')} ({total}) <ChevronDown className="w-3 h-3" /></>
          )}
        </Button>
      )}
    </div>
  );
}

export default function ProductClient({ article }: { article: string }) {
  const t = useTranslations('catalog');
  const tc = useTranslations('common');
  const addItem = useCartStore((s) => s.addItem);

  const { data, isLoading } = useQuery({
    queryKey: ['part-detail', article],
    queryFn: async () => {
      const { data } = await api.get(`/catalog/parts/${article}/details`);
      return data;
    },
    enabled: !!article,
  });

  const handleAddToCart = () => {
    addItem({
      id: `cart-${article}-${Date.now()}`,
      part_id: 0,
      article,
      part_name: data?.info?.name || article,
      quantity: 1,
      price: null,
      supplier_name: data?.info?.brand || null,
    });
    toast.success(tc('added_to_cart'));
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <Link
        href="/catalog"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> {t('title')}
      </Link>

      {isLoading ? (
        <div className="space-y-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
      ) : !data?.info ? (
        <div className="text-center py-20 space-y-4">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium">{t('no_results')}</p>
          <Link href="/catalog">
            <Button variant="outline">{t('title')}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <ImageGallery images={data?.images || []} article={article} />
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{data.info.brand}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{article}</span>
              </div>
              <h1 className="text-2xl font-bold">{data.info.name}</h1>
              {data.info.description && (
                <p className="text-muted-foreground">{data.info.description}</p>
              )}
            </div>

            <Separator />

            <Button onClick={handleAddToCart} size="lg" className="w-full gap-2">
              <ShoppingCart className="w-5 h-5" /> {tc('add_to_cart')}
            </Button>

            <Separator />

            {data?.info?.attributes?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold">{t('attributes')}</h4>
                <div className="rounded-md border divide-y text-sm">
                  {data.info.attributes.map((attr: any, idx: number) => (
                    <div key={idx} className="flex justify-between px-3 py-1.5">
                      <span className="text-muted-foreground">{attr.name || attr.key}</span>
                      <span className="font-medium">{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-semibold">{t('analogs')}</h4>
              <div className="rounded-md border divide-y">
                {data?.crosses?.length > 0 ? (
                  data.crosses.map((cross: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-2 text-sm">
                      <span className="font-mono">{cross.article}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{cross.brand}</span>
                        <Badge variant="secondary" className="text-[10px] h-4">{cross.type}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-2 text-sm text-muted-foreground">{t('no_analogs')}</p>
                )}
              </div>
            </div>

            <ApplicabilitySection article={article} />
          </div>
        </div>
      )}
    </div>
  );
}

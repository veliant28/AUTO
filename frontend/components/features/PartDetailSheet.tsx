'use client';

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShoppingCart, ExternalLink, ChevronDown, ChevronUp, Car } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import ImageGallery from '@/components/features/ImageGallery';
import { APPLICABILITY_LIMIT, APPLICABILITY_PREVIEW } from '@/lib/constants';

interface PartDetailProps {
  isOpen: boolean;
  onClose: () => void;
  part: {
    id: number;
    article: string;
    name: string;
    brand_id: number;
  } | null;
  data: any;
  isLoading: boolean;
}

function ApplicabilitySection({ article }: { article: string }) {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['applicability', article],
    queryFn: async () => {
      const { data } = await api.get(`/catalog/parts/${article}/applicability`, {
        params: { page: 1, limit: APPLICABILITY_LIMIT },
      });
      return data;
    },
    enabled: !!article,
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
        <Car className="w-3.5 h-3.5" /> Применимость ({total})
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
      {vehicles.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1 text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>Свернуть <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Показать все ({total}) <ChevronDown className="w-3 h-3" /></>
          )}
        </Button>
      )}
    </div>
  );
}

export default function PartDetailSheet({ isOpen, onClose, part, data, isLoading }: PartDetailProps) {
  const addItem = useCartStore((s) => s.addItem);

  if (!part) return null;

  const handleAddToCart = () => {
    addItem({
      id: `cart-${part.id}-${Date.now()}`,
      part_id: part.id,
      article: part.article,
      part_name: part.name,
      quantity: 1,
      price: null,
      supplier_name: data?.info?.brand || null,
    });
    toast.success('Добавлено в корзину');
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex justify-between items-center">
            <Badge variant="outline">{data?.info?.brand || 'Загрузка...'}</Badge>
            <span className="text-xs text-muted-foreground font-mono">{part.article}</span>
          </div>
          <SheetTitle className="text-2xl">{data?.info?.name || 'Загрузка информации...'}</SheetTitle>
          <SheetDescription>
            {data?.info?.description || 'Описание детали отсутствует'}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-8">
            <ImageGallery images={data?.images || []} article={part.article} />

            {data?.info?.attributes?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Характеристики</h4>
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
              <h4 className="font-semibold text-sm">Аналоги и кросс-номера</h4>
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
                  <p className="p-2 text-sm text-muted-foreground">Аналоги не найдены</p>
                )}
              </div>
            </div>

            <ApplicabilitySection article={part.article} />

            <div className="flex gap-3 pt-4">
              <Button onClick={handleAddToCart} className="flex-1 gap-2">
                <ShoppingCart className="w-4 h-4" /> Добавить в корзину
              </Button>
              <Button variant="outline" size="icon">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

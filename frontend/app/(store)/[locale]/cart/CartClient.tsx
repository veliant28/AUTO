'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import { getBrandColor, getBrandInitial } from '@/lib/brand';
import api from '@/lib/api';

function CartSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg border bg-card">
              <Skeleton className="w-[120px] aspect-square rounded-lg shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-7 w-7 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-px w-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const t = useTranslations('common');
  const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice, replaceItems } = useCartStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Migrate old cart items without brand: fetch from catalog API
  useEffect(() => {
    const todo = items.filter((i) => !i.brand && i.article);
    if (todo.length === 0) return;
    Promise.all(
      todo.map(async (item) => {
        try {
          const res = await api.get('/catalog/search', { params: { q: item.article, limit: 1 } });
          const product = Array.isArray(res.data) ? res.data[0] : (res.data as any)?.items?.[0];
          if (product?.brand) return { article: item.article, brand: product.brand };
        } catch {}
        return null;
      })
    ).then((results) => {
      const updates = results.filter(Boolean) as { article: string; brand: string }[];
      if (updates.length > 0) {
        replaceItems(
          items.map((item) => {
            const found = updates.find((u) => u.article === item.article);
            return found ? { ...item, brand: found.brand } : item;
          })
        );
      }
    });
  }, []);

  if (!mounted) {
    return <CartSkeleton />;
  }

  const linkPath = typeof window !== 'undefined'
    ? (localStorage.getItem('cartReturnPath') || '/')
    : '/';

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-20 px-4">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-muted rounded-full p-6">
            <ShoppingCart className="w-16 h-16 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold">{t('cart_empty')}</h1>
          <p className="text-muted-foreground max-w-md">
            {t('cart_empty_desc')}
          </p>
          <Link href={linkPath}>
            <Button size="lg">
              <ArrowLeft className="mr-2 h-5 w-5" />
              {t('go_to_catalog')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold">{t('cart')}</h1>
            <Badge variant="secondary" className="text-sm px-1.5">{totalItems()} {t('pcs')}</Badge>
          </div>
          <Button variant="outline" size="lg" className="gap-2" onClick={() => { clearCart(); toast.info(t('cart_cleared')); }}>
            <Trash2 className="w-4 h-4" /> {t('clear_cart')}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => {
              const itemTotalPrice = (item.price || 0) * item.quantity;

              const handleDecrease = () => {
                if (item.quantity <= 1) {
                  removeItem(item.id);
                  toast.success(t('removed_from_cart'));
                } else {
                  updateQuantity(item.id, item.quantity - 1);
                  toast.success(t('quantity_updated'));
                }
              };

              const handleIncrease = () => {
                updateQuantity(item.id, item.quantity + 1);
                toast.success(t('quantity_updated'));
              };

              const handleRemove = () => {
                removeItem(item.id);
                toast.success(t('removed_from_cart'));
              };

              return (
                <div key={item.id} className="flex gap-4 p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
                  <div className={`aspect-square w-[120px] shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center bg-gradient-to-br ${getBrandColor(item.brand)}`}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.part_name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl font-bold text-white/40 select-none">
                        {getBrandInitial(item.brand)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {item.supplier_name && (
                            <Badge variant="secondary" className="text-sm px-1.5">{item.supplier_name}</Badge>
                          )}
                          <span className="text-sm font-mono text-muted-foreground">{item.article}</span>
                        </div>
                        <p className="font-medium text-sm line-clamp-2">{item.part_name}</p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-10 w-10 shrink-0" onClick={handleRemove}>
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('remove')}</TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={handleDecrease}>
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{t('decrease_quantity')}</TooltipContent>
                        </Tooltip>
                        <span className="w-8 text-center font-medium tabular-nums">{item.quantity}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={handleIncrease}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{t('increase_quantity')}</TooltipContent>
                        </Tooltip>
                        {item.price && (
                          <span className="text-sm text-muted-foreground ml-2">× {item.price.toLocaleString()} ₴</span>
                        )}
                      </div>
                      <p className="font-semibold text-base">
                        {itemTotalPrice.toLocaleString()} ₴
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-lg border bg-card p-6 space-y-5 sticky top-24">
              <h3 className="font-semibold text-2xl">{t('your_order')}</h3>
              <Separator />
              <div className="space-y-2 text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('items_label')}</span>
                  <span className="font-medium">{totalItems()} {t('pcs')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('total_label')}:</span>
                  <span className="font-bold text-2xl">{totalPrice().toLocaleString()} ₴</span>
                </div>
              </div>
              <Separator />
              <Button className="w-full gap-2 bg-green-500 text-white hover:bg-green-600" size="lg" asChild>
                <Link href="/checkout">{t('checkout')}</Link>
              </Button>
              <Link href={linkPath} className="block">
                <Button variant="outline" className="w-full" size="lg">
                  {t('continue_shopping')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

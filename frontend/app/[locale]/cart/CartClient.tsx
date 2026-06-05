'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

export default function CartPage() {
  const t = useTranslations('common');
  const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-20 px-4">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-muted rounded-full p-6">
            <ShoppingCart className="w-16 h-16 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Корзина пуста</h1>
          <p className="text-muted-foreground max-w-md">
            Добавьте запчасти в корзину из каталога или найдите их по артикулу
          </p>
          <Link href="/catalog">
            <Button size="lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Перейти в каталог
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold">Корзина</h1>
          <Badge variant="secondary">{totalItems()} товара</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => { clearCart(); toast.info('Корзина очищена'); }}>
          Очистить корзину
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemTotalPrice = (item.price || 0) * item.quantity;

            return (
              <div key={item.id} className="flex gap-4 p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
                <div className="w-16 h-16 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground/40">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">{item.article}</span>
                        {item.supplier_name && (
                          <Badge variant="outline" className="text-[10px]">{item.supplier_name}</Badge>
                        )}
                      </div>
                      <p className="font-medium line-clamp-2">{item.part_name}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => { removeItem(item.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      {item.price && (
                        <span className="text-xs text-muted-foreground ml-2">× {item.price.toLocaleString()} ₴</span>
                      )}
                    </div>
                    <p className="font-semibold text-lg">
                      {itemTotalPrice.toLocaleString()} ₴
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-6 space-y-4 sticky top-24">
            <h3 className="font-semibold text-lg">Ваш заказ</h3>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Товаров:</span>
                <span>{totalItems()} шт.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Сумма:</span>
                <span className="font-semibold text-lg">{totalPrice().toLocaleString()} ₴</span>
              </div>
            </div>
            <Separator />
            <Button className="w-full" size="lg">
              Оформить заказ
            </Button>
            <Link href="/catalog" className="block">
              <Button variant="outline" className="w-full" size="sm">
                Продолжить покупки
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Package, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { OrdersSkeleton } from '@/components/ui/Skeletons';
import PageTransition from '@/components/ui/PageTransition';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

export default function OrdersPage() {
  const t = useTranslations('common');
  const locale = useLocale();
  const { isAuthenticated } = useAuthStore();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders');
      return data;
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <Package className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('my_orders')}</h1>
        <p className="text-muted-foreground">{t('orders_empty_desc')}</p>
        <Link href="/auth/login">
          <Button>{t('login')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Package className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">{t('my_orders')}</h1>
        <Badge variant="secondary">{orders?.length || 0}</Badge>
        </div>

        {isLoading ? (
          <OrdersSkeleton />
        ) : orders?.length === 0 ? (
        <div className="bg-muted/30 border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
          <Package className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">{t('orders_empty_title')}</p>
          <Link href="/catalog">
            <Button variant="outline" className="mt-4">{t('go_to_catalog')}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders?.map((order: any) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, variant: 'secondary' as const };
            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-lg font-bold">#{order.id}</span>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString(locale === 'ua' ? 'uk-UA' : locale, {
                          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                      <p className="text-sm"><strong>{order.items?.length}</strong> {t('items_label')}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-bold text-lg">{Number(order.total).toLocaleString()} ₴</p>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
    </PageTransition>
  );
}

'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/authStore';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id;
  const { isAuthenticated } = useAuthStore();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data;
    },
    enabled: !!orderId && isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold">Авторизуйтесь</h1>
        <Link href="/auth/login"><Button className="mt-4">Войти</Button></Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <Package className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-4">Заказ не найден</h1>
        <Link href="/orders"><Button variant="outline" className="mt-4 gap-2"><ArrowLeft className="w-4 h-4" /> Назад</Button></Link>
      </div>
    );
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, variant: 'secondary' as const };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Link href="/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Все заказы
      </Link>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-mono">#{order.id}</h1>
              <Badge variant={statusInfo.variant}>
                {statusInfo.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              от {new Date(order.created_at).toLocaleString('ru-RU')}
            </p>
          </div>
          {order.status === 'delivered' && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Доставлен</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Получатель</p>
            <p className="font-medium">{order.full_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Телефон</p>
            <p className="font-medium">{order.phone || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Адрес доставки</p>
            <p className="font-medium">{order.address || '—'}</p>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold mb-4">Состав заказа</h3>
          <div className="divide-y">
            {order.items?.map((item: any) => (
              <div key={item.id} className="flex justify-between items-center py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.article}</span>
                    <Badge variant="outline" className="text-[10px]">{item.quantity} шт.</Badge>
                  </div>
                  <p className="font-medium">{item.part_name}</p>
                </div>
                <p className="font-medium">{Number(item.price).toLocaleString()} ₴</p>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <span className="font-semibold">Итого</span>
          <span className="text-2xl font-bold">{Number(order.total).toLocaleString()} ₴</span>
        </div>
      </div>
    </div>
  );
}

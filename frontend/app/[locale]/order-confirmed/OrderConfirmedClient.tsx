'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OrderConfirmedPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id');

  return (
    <div className="container mx-auto py-20 px-4 max-w-lg text-center space-y-8">
      <div className="bg-green-100 dark:bg-green-900/20 w-20 h-20 mx-auto rounded-full flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Заказ оформлен!</h1>
        <p className="text-muted-foreground">
          Спасибо за ваш заказ. Мы свяжемся с вами для подтверждения.
        </p>
      </div>

      {orderId && (
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-muted rounded-full">
          <Package className="w-5 h-5 text-primary" />
          <span className="font-medium">Номер заказа: #{orderId}</span>
        </div>
      )}

      <div className="space-y-3 pt-4">
        <Link href="/orders">
          <Button className="w-full gap-2" size="lg">
            Мои заказы <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link href="/catalog">
          <Button variant="outline" className="w-full">
            Продолжить покупки
          </Button>
        </Link>
      </div>
    </div>
  );
}

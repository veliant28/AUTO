'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingCart, ArrowLeft, CreditCard, Truck, User, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import { checkoutSchema, CheckoutFormData } from '@/lib/validations/authSchemas';

export default function CheckoutPage() {
  const t = useTranslations('common');
  const router = useRouter();
  const { items, totalPrice, clearCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema(t)),
  });

  const formValues = watch();

  const checkoutMutation = useMutation({
    mutationFn: async (formData: CheckoutFormData) => {
      const orderItems = items.map((i) => ({
        part_id: i.part_id,
        quantity: i.quantity,
        price: i.price || 0,
      }));
      const res = await api.post('/orders/checkout', { ...formData, items: orderItems });
      return res.data;
    },
    onSuccess: (data) => {
      clearCart();
      router.push(`/order-confirmed?id=${data.order_id}`);
    },
    onError: () => toast.error(t('checkout_error')),
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('login_required')}</h1>
        <p className="text-muted-foreground">{t('login_for_checkout')}</p>
        <Link href="/auth/login">
          <Button>{t('login')}</Button>
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('cart_empty')}</h1>
        <Link href="/catalog">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> {t('go_to_catalog')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <CreditCard className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">{t('checkout_title')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <User className="w-4 h-4" /> {t('personal_data')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm">{t('full_name')}</label>
                <Input {...register('full_name')} placeholder={t('name_placeholder')} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm">{t('phone')}</label>
                <Input {...register('phone')} placeholder="+380 (99) 123-45-67" />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {t('delivery_address')}
            </h2>
            <div className="space-y-2">
              <label className="text-sm">{t('address')}</label>
              <Input {...register('address')} placeholder={t('address_placeholder')} />
              {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> {t('order_contents')}
            </h2>
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm py-1">
                <div className="flex-1">
                  <span className="font-mono text-xs text-muted-foreground">{item.article}</span>
                  <p className="line-clamp-1">{item.part_name}</p>
                </div>
                <div className="text-right">
                  <p>{item.quantity} × {item.price?.toLocaleString()} ₴</p>
                  <p className="font-medium">{(item.price || 0) * item.quantity} ₴</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card p-6 space-y-4 sticky top-24">
            <h3 className="font-semibold">{t('your_order')}</h3>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('total_label')}:</span>
                <span className="font-bold text-lg">{totalPrice().toLocaleString()} ₴</span>
              </div>
            </div>
            <Separator />
            <Button 
              className="w-full gap-2" 
              size="lg" 
              onClick={handleSubmit((data) => checkoutMutation.mutate(data))}
              disabled={!formValues.full_name || checkoutMutation.isPending}
            >
              <Truck className="w-4 h-4" />
              {checkoutMutation.isPending ? t('processing') : t('checkout')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingCart, CreditCard, User, MapPin, Wallet, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PhoneInput, apiToPhone, phoneToApi } from '@/components/ui/PhoneInput';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/hooks/useProfile';
import { checkoutSchema, CheckoutFormData } from '@/lib/validations/authSchemas';

const inputLg = 'h-10 text-base';

function CheckoutSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-16 rounded-md" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <div className="lg:col-span-1">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const t = useTranslations('common');
  const tc = useTranslations('checkout');
  const router = useRouter();
  const { items, totalPrice, clearCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const { profile, isLoading: profileLoading } = useProfile();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema(tc)),
    defaultValues: {
      last_name: '',
      first_name: '',
      middle_name: '',
      phone: '',
      delivery_type: '',
      delivery_city: '',
      delivery_warehouse: '',
      payment_method: '',
    },
  });

  useEffect(() => {
    if (profile) {
      if (profile.last_name) setValue('last_name', profile.last_name);
      if (profile.first_name) setValue('first_name', profile.first_name);
      if (profile.middle_name) setValue('middle_name', profile.middle_name);
      if (profile.phone) setValue('phone', apiToPhone(profile.phone));
      if (profile.delivery_type) setValue('delivery_type', profile.delivery_type);
      if (profile.delivery_city) setValue('delivery_city', profile.delivery_city);
      if (profile.delivery_warehouse) setValue('delivery_warehouse', profile.delivery_warehouse);
    }
  }, [profile, setValue]);

  const checkoutMutation = useMutation({
    mutationFn: async (formData: CheckoutFormData) => {
      const orderItems = items.map((i) => ({
        part_id: i.part_id,
        quantity: i.quantity,
        price: i.price || 0,
      }));
      const { data } = await api.post('/orders/checkout', {
        last_name: formData.last_name,
        first_name: formData.first_name,
        middle_name: formData.middle_name || '',
        phone: phoneToApi(formData.phone),
        delivery_type: formData.delivery_type,
        delivery_city: formData.delivery_city || '',
        delivery_warehouse: formData.delivery_warehouse || '',
        payment_method: formData.payment_method,
        items: orderItems,
      });
      return data;
    },
    onSuccess: (data) => {
      clearCart();
      router.push(`/order-confirmed?id=${data.order_id}`);
    },
    onError: () => {
      toast.error(t('checkout_error'));
    },
  });

  const onSubmit = (data: CheckoutFormData) => {
    checkoutMutation.mutate(data);
  };

  const onError = () => {
    toast.info(tc('fill_required'));
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <ShoppingCart className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{t('login_required')}</h1>
        <p className="text-muted-foreground">{t('login_for_checkout')}</p>
        <Link href="/auth/login">
          <Button size="lg">{t('login')}</Button>
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-muted rounded-full p-6 mx-auto w-fit">
          <ShoppingCart className="w-16 h-16 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold">{tc('cart_empty')}</h1>
        <Link href="/catalog">
          <Button variant="outline" size="lg" className="gap-2">
            <ArrowLeft className="w-5 h-5" /> {tc('go_to_catalog')}
          </Button>
        </Link>
      </div>
    );
  }

  if (profileLoading) {
    return <CheckoutSkeleton />;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold">{tc('title')}</h1>
        </div>
        <Link href="/cart">
          <Button variant="outline" size="lg" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> {tc('back_to_cart')}
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onError)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="font-semibold flex items-center gap-2 text-lg">
                <User className="w-5 h-5" /> {t('personal_data')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{tc('phone')} *</Label>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={tc('phone_placeholder')}
                        className={`${inputLg} w-full rounded-md border border-input bg-background px-3 py-1 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50${errors.phone ? ' border-destructive' : ''}`}
                      />
                    )}
                  />
                  {errors.phone && (
                    <p className="text-xs text-destructive">{errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">{tc('last_name')} *</Label>
                  <Input
                    id="last_name"
                    {...register('last_name')}
                    placeholder={tc('last_name')}
                    className={inputLg + (errors.last_name ? ' border-destructive' : '')}
                  />
                  {errors.last_name && (
                    <p className="text-xs text-destructive">{errors.last_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="first_name">{tc('first_name')} *</Label>
                  <Input
                    id="first_name"
                    {...register('first_name')}
                    placeholder={tc('first_name')}
                    className={inputLg + (errors.first_name ? ' border-destructive' : '')}
                  />
                  {errors.first_name && (
                    <p className="text-xs text-destructive">{errors.first_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="middle_name">{tc('middle_name')}</Label>
                  <Input
                    id="middle_name"
                    {...register('middle_name')}
                    placeholder={tc('middle_name')}
                    className={inputLg}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="font-semibold flex items-center gap-2 text-lg">
                <MapPin className="w-5 h-5" /> {tc('delivery')}
              </h2>

              <div className="space-y-3">
                <Label>{tc('delivery')} *</Label>
                <Controller
                  name="delivery_type"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-3 gap-3"
                    >
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="warehouse" id="warehouse" />
                        <Label htmlFor="warehouse" className="font-normal cursor-pointer">
                          {tc('delivery_type_warehouse')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="parcel_locker" id="parcel_locker" />
                        <Label htmlFor="parcel_locker" className="font-normal cursor-pointer">
                          {tc('delivery_type_parcel_locker')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="courier" id="courier" />
                        <Label htmlFor="courier" className="font-normal cursor-pointer">
                          {tc('delivery_type_courier')}
                        </Label>
                      </div>
                    </RadioGroup>
                  )}
                />
                {errors.delivery_type && (
                  <p className="text-xs text-destructive">{errors.delivery_type.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="delivery_city">{tc('delivery_city')}</Label>
                  <Input
                    id="delivery_city"
                    {...register('delivery_city')}
                    placeholder={tc('delivery_city')}
                    className={inputLg}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery_warehouse">{tc('delivery_warehouse_number')}</Label>
                  <Input
                    id="delivery_warehouse"
                    {...register('delivery_warehouse')}
                    placeholder={tc('delivery_warehouse_number')}
                    className={inputLg}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="font-semibold flex items-center gap-2 text-lg">
                <Wallet className="w-5 h-5" /> {tc('payment')}
              </h2>

              <div className="space-y-3">
                <Label>{tc('payment')} *</Label>
                <Controller
                  name="payment_method"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-4 gap-3"
                    >
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="cod" id="cod" />
                        <Label htmlFor="cod" className="font-normal cursor-pointer">
                          {tc('payment_cod')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="monobank" id="monobank" />
                        <Label htmlFor="monobank" className="font-normal cursor-pointer">
                          {tc('payment_monobank')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="novapay" id="novapay" />
                        <Label htmlFor="novapay" className="font-normal cursor-pointer">
                          {tc('payment_novapay')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary">
                        <RadioGroupItem value="liqpay" id="liqpay" />
                        <Label htmlFor="liqpay" className="font-normal cursor-pointer">
                          {tc('payment_liqpay')}
                        </Label>
                      </div>
                    </RadioGroup>
                  )}
                />
                {errors.payment_method && (
                  <p className="text-xs text-destructive">{errors.payment_method.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-lg border bg-card p-6 space-y-5 sticky top-24">
              <h3 className="font-semibold text-2xl">{tc('your_order')}</h3>
              <Separator />

              <div className="space-y-2 text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('items_label')}</span>
                  <span className="font-medium">{items.length} {t('pcs')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('total_label')}:</span>
                  <span className="font-bold text-2xl">{totalPrice().toLocaleString()} ₴</span>
                </div>
              </div>

              <Separator />

              <Button
                type="submit"
                className="w-full gap-2 bg-green-500 text-white hover:bg-green-600"
                size="lg"
                disabled={checkoutMutation.isPending}
              >
                <CreditCard className="w-5 h-5" />
                {checkoutMutation.isPending ? tc('processing') : tc('place_order')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

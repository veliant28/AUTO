'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ShoppingCart,
  CreditCard,
  User,
  MapPin,
  Wallet,
  ArrowLeft,
  Building2,
  Container,
  Truck,
  Loader2,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PhoneInput, apiToPhone, phoneToApi } from '@/components/ui/PhoneInput'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useCartStore } from '@/store/cartStore'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/hooks/useProfile'
import { checkoutSchema, CheckoutFormData } from '@/lib/validations/authSchemas'
import { novaPoshtaPublicApi } from '@/lib/api/nova-poshta-public'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
} from '@/lib/types/nova-poshta'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

const inputLg = 'h-10 text-base'

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
  )
}

export default function CheckoutPage() {
  const t = useTranslations('common')
  const tc = useTranslations('checkout')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { items, totalPrice, clearCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { profile, isLoading: profileLoading } = useProfile()

  // Force fresh profile data (e.g. after saving delivery in profile page)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['profile'] })
  }, [queryClient])

  // ── NP delivery refs (tracked outside form because setValue without register doesn't submit) ──
  const [npRefs, setNpRefs] = useState({
    delivery_city_ref: '',
    delivery_settlement_ref: '',
    delivery_city_label: '',
    delivery_warehouse_ref: '',
    delivery_warehouse_label: '',
    delivery_street_ref: '',
    delivery_street_label: '',
    delivery_house: '',
    delivery_apartment: '',
  })

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
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
      delivery_street_label: '',
      delivery_house: '',
      delivery_apartment: '',
      payment_method: '',
    },
  })

  useEffect(() => {
    if (profile) {
      if (profile.last_name) setValue('last_name', profile.last_name)
      if (profile.first_name) setValue('first_name', profile.first_name)
      if (profile.middle_name) setValue('middle_name', profile.middle_name)
      if (profile.phone) setValue('phone', apiToPhone(profile.phone))
      if (profile.delivery_type)
        setValue('delivery_type', profile.delivery_type)
      if (profile.delivery_city) {
        setValue('delivery_city', profile.delivery_city)
        setCityQuery(profile.delivery_city)
        setNpRefs((prev) => ({
          ...prev,
          delivery_city_ref: profile.delivery_city_ref || '',
          delivery_settlement_ref: profile.delivery_settlement_ref || '',
          delivery_city_label:
            profile.delivery_city_label || profile.delivery_city || '',
          delivery_warehouse_ref: profile.delivery_warehouse_ref || '',
          delivery_warehouse_label: profile.delivery_warehouse_label || '',
          delivery_street_ref: profile.delivery_street_ref || '',
          delivery_street_label: profile.delivery_street_label || '',
          delivery_house: profile.delivery_house || '',
          delivery_apartment: profile.delivery_apartment || '',
        }))
      }
      if (profile.delivery_warehouse) {
        setValue('delivery_warehouse', profile.delivery_warehouse)
        setWarehouseQuery(profile.delivery_warehouse)
      }
      if (profile.delivery_street_label) {
        setStreetQuery(profile.delivery_street_label)
      }
      if (
        profile.delivery_house !== undefined &&
        profile.delivery_house !== null
      ) {
        setValue('delivery_house', profile.delivery_house)
      }
      if (
        profile.delivery_apartment !== undefined &&
        profile.delivery_apartment !== null
      ) {
        setValue('delivery_apartment', profile.delivery_apartment)
      }
    }
  }, [profile, setValue])

  const checkoutMutation = useMutation({
    mutationFn: async (formData: CheckoutFormData) => {
      const orderItems = items.map((i) => ({
        part_id: i.part_id,
        quantity: i.quantity,
        price: i.price || 0,
      }))
      const { data } = await api.post('/orders/checkout', {
        last_name: formData.last_name,
        first_name: formData.first_name,
        middle_name: formData.middle_name || '',
        phone: phoneToApi(formData.phone),
        delivery_type: formData.delivery_type,
        delivery_city: formData.delivery_city || '',
        delivery_warehouse: formData.delivery_warehouse || '',
        delivery_city_ref: npRefs.delivery_city_ref,
        delivery_settlement_ref: npRefs.delivery_settlement_ref,
        delivery_city_label: npRefs.delivery_city_label,
        delivery_warehouse_ref: npRefs.delivery_warehouse_ref,
        delivery_warehouse_label: npRefs.delivery_warehouse_label,
        delivery_street_ref: npRefs.delivery_street_ref,
        delivery_street_label: npRefs.delivery_street_label,
        delivery_house: npRefs.delivery_house,
        delivery_apartment: npRefs.delivery_apartment,
        payment_method: formData.payment_method,
        items: orderItems,
      })
      return data
    },
    onSuccess: (data) => {
      clearCart()
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      router.push(`/order-confirmed?order=${data.order_number}`)
    },
    onError: () => {
      toast.error(t('checkout_error'))
    },
  })

  const onSubmit = (data: CheckoutFormData) => {
    checkoutMutation.mutate(data)
  }

  const onError = () => {
    toast.info(tc('fill_required'))
  }

  // ── Nova Poshta online search ──────────────────────────────────
  const deliveryType = watch('delivery_type')
  const cityRef = npRefs.delivery_city_ref

  const [cityQuery, setCityQuery] = useState('')
  const { data: settlements = [], isFetching: citiesLoading } = useQuery({
    queryKey: ['checkout-np-cities', cityQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchSettlements(cityQuery, locale)
        .then((r) => r.data as NovaPoshtaLookupSettlement[]),
    enabled: cityQuery.length >= 2,
    staleTime: 30000,
  })

  const [warehouseQuery, setWarehouseQuery] = useState('')
  const { data: warehouses = [], isFetching: warehousesLoading } = useQuery({
    queryKey: ['checkout-np-warehouses', cityRef, warehouseQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchWarehouses(cityRef!, warehouseQuery, undefined, locale)
        .then((r) => r.data as NovaPoshtaLookupWarehouse[]),
    enabled: !!cityRef && warehouseQuery.length >= 1,
    staleTime: 30000,
  })

  const settlementRef = npRefs.delivery_settlement_ref
  const [streetQuery, setStreetQuery] = useState('')
  const { data: streets = [], isFetching: streetsLoading } = useQuery({
    queryKey: ['checkout-np-streets', settlementRef, streetQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchStreets(settlementRef!, streetQuery, locale)
        .then((r) => r.data as NovaPoshtaLookupStreet[]),
    enabled: !!settlementRef && streetQuery.length >= 2,
    staleTime: 30000,
  })

  const isWarehouseType = deliveryType === 'warehouse'
  const isCourierType = deliveryType === 'courier'

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
    )
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
    )
  }

  if (profileLoading) {
    return <CheckoutSkeleton />
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
                  <div className="flex items-center gap-2">
                    <Label htmlFor="phone">{tc('phone')} *</Label>
                    {errors.phone && (
                      <span className="text-xs text-destructive">
                        {errors.phone.message}
                      </span>
                    )}
                  </div>
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
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="last_name">{tc('last_name')} *</Label>
                    {errors.last_name && (
                      <span className="text-xs text-destructive">
                        {errors.last_name.message}
                      </span>
                    )}
                  </div>
                  <Input
                    id="last_name"
                    {...register('last_name')}
                    placeholder={tc('last_name')}
                    className={
                      inputLg + (errors.last_name ? ' border-destructive' : '')
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="first_name">{tc('first_name')} *</Label>
                    {errors.first_name && (
                      <span className="text-xs text-destructive">
                        {errors.first_name.message}
                      </span>
                    )}
                  </div>
                  <Input
                    id="first_name"
                    {...register('first_name')}
                    placeholder={tc('first_name')}
                    className={
                      inputLg + (errors.first_name ? ' border-destructive' : '')
                    }
                  />
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
                <div className="flex items-center gap-2">
                  <Label>{tc('delivery')} *</Label>
                  {errors.delivery_type && (
                    <span className="text-xs text-destructive">
                      {errors.delivery_type.message}
                    </span>
                  )}
                </div>
                <Controller
                  name="delivery_type"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-3 gap-3"
                    >
                      <Label
                        htmlFor="pickup"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer opacity-50 cursor-not-allowed"
                      >
                        <RadioGroupItem
                          value="pickup"
                          id="pickup"
                          className="cursor-pointer"
                          disabled
                        />
                        {tc('delivery_type_pickup')}
                      </Label>
                      <Label
                        htmlFor="warehouse"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="warehouse"
                          id="warehouse"
                          className="cursor-pointer"
                        />
                        <Building2 className="w-5 h-5" />
                        {tc('delivery_type_warehouse')}
                      </Label>
                      <Label
                        htmlFor="courier"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="courier"
                          id="courier"
                          className="cursor-pointer"
                        />
                        <Truck className="w-5 h-5" />
                        {tc('delivery_type_courier')}
                      </Label>
                    </RadioGroup>
                  )}
                />
              </div>

              {/* City search */}
              <Controller
                name="delivery_city"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>{tc('delivery_city')}</Label>
                    <SearchableSelect<NovaPoshtaLookupSettlement>
                      items={settlements}
                      isLoading={citiesLoading}
                      value={field.value || ''}
                      onChange={(item) => {
                        field.onChange(item.label)
                        setNpRefs((prev) => ({
                          ...prev,
                          delivery_city_ref: item.delivery_city_ref || item.ref,
                          delivery_settlement_ref: item.settlement_ref || '',
                          delivery_city_label: item.label,
                          delivery_warehouse_ref: '',
                          delivery_warehouse_label: '',
                          delivery_street_ref: '',
                          delivery_street_label: '',
                          delivery_house: '',
                          delivery_apartment: '',
                        }))
                        setWarehouseQuery('')
                        setStreetQuery('')
                      }}
                      searchQuery={cityQuery}
                      onSearchChange={setCityQuery}
                      getKey={(item) => item.ref}
                      getLabel={(item) => item.label}
                      placeholder={tc('delivery_city')}
                      minSearchLength={2}
                      noResultsMessage={t('no_results')}
                      typeToSearchMessage={
                        tc('delivery_city') || 'Поиск города...'
                      }
                      renderItem={(item) => (
                        <>
                          <div className="font-medium leading-tight">
                            {item.label}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[item.area, item.region]
                              .filter(Boolean)
                              .join(' — ')}
                            {item.warehouses_count &&
                            item.warehouses_count !== '0' ? (
                              <span className="ml-2 inline-flex items-center gap-1">
                                <Warehouse className="w-3 h-3" />×
                                {item.warehouses_count}
                              </span>
                            ) : null}
                          </div>
                        </>
                      )}
                    />
                  </div>
                )}
              />

              {/* Warehouse / Postomat search */}
              {isWarehouseType && (
                <Controller
                  name="delivery_warehouse"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>{tc('delivery_type_warehouse')}</Label>
                      <SearchableSelect<NovaPoshtaLookupWarehouse>
                        items={warehouses}
                        isLoading={warehousesLoading}
                        value={field.value || ''}
                        onChange={(item) => {
                          field.onChange(item.label)
                          setNpRefs((prev) => ({
                            ...prev,
                            delivery_warehouse_ref: item.ref,
                            delivery_warehouse_label: item.label,
                          }))
                        }}
                        searchQuery={warehouseQuery}
                        onSearchChange={setWarehouseQuery}
                        getKey={(item) => item.ref}
                        getLabel={(item) => item.label}
                        placeholder={tc('delivery_warehouse_number')}
                        minSearchLength={1}
                        noResultsMessage={t('no_results')}
                        typeToSearchMessage={t('no_results')}
                        renderItem={(item) => {
                          const isPostomat = item.type === 'Postomat'
                          return (
                            <>
                              <div className="font-medium leading-tight flex items-center gap-2">
                                {isPostomat ? (
                                  <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                    {tc('delivery_type_parcel_locker')}
                                  </span>
                                ) : (
                                  <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                    №{item.number}
                                  </span>
                                )}
                                <span className="truncate">
                                  {item.label.includes(':')
                                    ? item.label.slice(
                                        0,
                                        item.label.indexOf(':'),
                                      )
                                    : item.label}
                                </span>
                              </div>
                              {(() => {
                                const afterColon = item.label.includes(':')
                                  ? item.label
                                      .slice(item.label.indexOf(':') + 1)
                                      .trim()
                                  : ''
                                const desc =
                                  afterColon || item.description || ''
                                return desc ? (
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {desc}
                                  </div>
                                ) : null
                              })()}
                            </>
                          )
                        }}
                      />
                    </div>
                  )}
                />
              )}

              {/* Courier: street + house + apartment */}
              {isCourierType && (
                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    name="delivery_street_label"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label>{t('delivery_street') || 'Улица'}</Label>
                        <SearchableSelect<NovaPoshtaLookupStreet>
                          items={streets}
                          isLoading={streetsLoading}
                          value={npRefs.delivery_street_label}
                          onChange={(item) => {
                            field.onChange(item.label)
                            setNpRefs((prev) => ({
                              ...prev,
                              delivery_street_ref: item.street_ref,
                              delivery_street_label: item.label,
                            }))
                          }}
                          searchQuery={streetQuery}
                          onSearchChange={setStreetQuery}
                          getKey={(item) => item.street_ref}
                          getLabel={(item) => item.label}
                          renderItem={(item) => (
                            <div className="font-medium leading-tight">
                              {item.street_type &&
                              item.label &&
                              !item.label.startsWith(item.street_type)
                                ? `${item.street_type}. ${item.label}`
                                : item.label}
                            </div>
                          )}
                          placeholder={t('delivery_street') || 'Улица'}
                          minSearchLength={2}
                          noResultsMessage={t('no_results')}
                          typeToSearchMessage={t('no_results')}
                        />
                      </div>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>{t('delivery_house') || 'Дом'}</Label>
                      <Input
                        {...register('delivery_house')}
                        placeholder={t('delivery_house') || 'Дом'}
                        className={inputLg}
                        autoComplete="off"
                        onChange={(e) => {
                          setValue('delivery_house', e.target.value)
                          setNpRefs((prev) => ({
                            ...prev,
                            delivery_house: e.target.value,
                          }))
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('delivery_apartment') || 'Квартира'}</Label>
                      <Input
                        {...register('delivery_apartment')}
                        placeholder={t('delivery_apartment') || 'Квартира'}
                        className={inputLg}
                        autoComplete="off"
                        onChange={(e) => {
                          setValue('delivery_apartment', e.target.value)
                          setNpRefs((prev) => ({
                            ...prev,
                            delivery_apartment: e.target.value,
                          }))
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="font-semibold flex items-center gap-2 text-lg">
                <Wallet className="w-5 h-5" /> {tc('payment')}
              </h2>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>{tc('payment')} *</Label>
                  {errors.payment_method && (
                    <span className="text-xs text-destructive">
                      {errors.payment_method.message}
                    </span>
                  )}
                </div>
                <Controller
                  name="payment_method"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-4 gap-3"
                    >
                      <Label
                        htmlFor="cod"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="cod"
                          id="cod"
                          className="cursor-pointer"
                        />
                        {tc('payment_cod')}
                      </Label>
                      <Label
                        htmlFor="monobank"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="monobank"
                          id="monobank"
                          className="cursor-pointer"
                        />
                        {tc('payment_monobank')}
                      </Label>
                      <Label
                        htmlFor="novapay"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="novapay"
                          id="novapay"
                          className="cursor-pointer"
                        />
                        {tc('payment_novapay')}
                      </Label>
                      <Label
                        htmlFor="liqpay"
                        className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer"
                      >
                        <RadioGroupItem
                          value="liqpay"
                          id="liqpay"
                          className="cursor-pointer"
                        />
                        {tc('payment_liqpay')}
                      </Label>
                    </RadioGroup>
                  )}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-lg border bg-card p-6 space-y-5 sticky top-24">
              <h3 className="font-semibold text-2xl">{tc('your_order')}</h3>
              <Separator />

              <div className="space-y-2 text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('items_label')}
                  </span>
                  <span className="font-medium">
                    {items.length} {t('pcs')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('total_label')}:
                  </span>
                  <span className="font-bold text-2xl">
                    {fmt(totalPrice())} ₴
                  </span>
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
                {checkoutMutation.isPending
                  ? tc('processing')
                  : tc('place_order')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

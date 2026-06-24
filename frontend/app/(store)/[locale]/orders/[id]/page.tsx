'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMessages, useLocale } from 'next-intl';
import { ArrowLeft, Package, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { useOrderSync } from '@/lib/orderSync';

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  let rest = digits;
  if (rest.startsWith('380')) rest = rest.slice(3);
  else if (rest.startsWith('38')) rest = rest.slice(2);
  if (rest.length < 8) return phone;
  if (rest.startsWith('0')) {
    return `+38 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8)}`;
  }
  return `+38 (0${rest.slice(0, 2)}) ${rest.slice(2, 5)}-${rest.slice(5, 7)}-${rest.slice(7)}`;
}

const DELIVERY_LABELS: Record<string, string> = {
  warehouse: 'delivery_warehouse',
  parcel_locker: 'delivery_parcel_locker',
  courier: 'delivery_courier',
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'payment_cod',
  monobank: 'payment_monobank',
  novapay: 'payment_novapay',
  liqpay: 'payment_liqpay',
};

const LOCALE_MAP: Record<string, string> = { ru: 'ru-RU', ua: 'uk-UA', en: 'en-US' };

export default function OrderDetailPage() {
  useOrderSync();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const messages = useMessages();
  const msgs = messages as Record<string, any>;
  const t = (key: string) => msgs?.common?.[key] ?? key;
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

  const locale = LOCALE_MAP[useLocale()] || 'ru-RU';

  if (!mounted) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold">{t('login_required')}</h1>
        <Link href="/auth/login"><Button className="mt-4">{t('login')}</Button></Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <Package className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-4">{t('order_not_found')}</h1>
        <Link href="/orders"><Button variant="outline" className="mt-4 gap-2"><ArrowLeft className="w-4 h-4" /> {t('back')}</Button></Link>
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  const statusInfo = ORDER_STATUS_LABELS[order.status] || { labelKey: 'order_pending', className: 'bg-gray-500 text-white' };
  const date = new Date(order.created_at + 'Z').toLocaleString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const deliveryLabelKey = DELIVERY_LABELS[order.delivery_type];
  const deliveryLabel = deliveryLabelKey ? t(deliveryLabelKey) : order.delivery_type;

  const paymentLabelKey = PAYMENT_LABELS[order.payment_method];
  const paymentLabel = paymentLabelKey ? t(paymentLabelKey) : order.payment_method;

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <Link href="/orders">
          <Button variant="outline" size="lg" className="gap-2 mb-6">
            <ArrowLeft className="w-5 h-5" /> {t('all_orders')}
          </Button>
        </Link>

        <div className="rounded-lg border bg-card p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Order info + Recipient + Delivery + Payment */}
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold font-mono">{order.order_number || `#${order.id}`}</h1>
                    <Badge className={`${statusInfo.className} border-0 text-sm`}>
                      {t(statusInfo.labelKey)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{date}</p>
                </div>
                <Button variant="outline" size="lg" className="gap-2" disabled>
                  <FileText className="w-5 h-5" /> {t('receipt')}
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('recipient')}</h3>
                <p className="font-medium">{order.last_name} {order.first_name} {order.middle_name || ''}</p>
                <p className="text-sm text-muted-foreground">{formatPhone(order.phone)}</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('delivery_type')}</h3>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{deliveryLabel}</p>
                  <p className="text-muted-foreground">{order.delivery_city || '—'}, {order.delivery_warehouse || '—'}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t('payment')}</h3>
                <p className="font-medium text-sm">{paymentLabel}</p>
              </div>
            </div>

            {/* Right: Items + Total */}
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{t('order_contents')}</h3>
              <div className="grid grid-cols-[1fr_auto_100px] gap-x-4 items-start">
                {order.items?.map((item: any, index: number) => (
                  <React.Fragment key={item.id}>
                    <div className={`min-w-0 space-y-1 py-3 ${index > 0 ? 'border-t pt-3' : ''}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.brand && (
                          <Badge variant="secondary" className="text-sm px-1.5">{item.brand}</Badge>
                        )}
                        <span className="text-sm font-mono text-muted-foreground">{item.article}</span>
                      </div>
                      <p className="font-medium text-sm line-clamp-1">{item.part_name}</p>
                    </div>

                    <div className={`py-3 flex items-start ${index > 0 ? 'border-t pt-3' : ''}`}>
                      {item.sku && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-blue-500 text-white border-0 text-sm px-1.5 cursor-pointer">{item.sku}</Badge>
                          </TooltipTrigger>
                          <TooltipContent>{t('sku')}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    <div className={`text-right shrink-0 py-3 ${index > 0 ? 'border-t pt-3' : ''}`}>
                      <span className="text-sm text-muted-foreground">{item.quantity} &times; {fmt(item.price)} ₴</span>
                      <p className="font-semibold text-base">{fmt(item.quantity * item.price)} ₴</p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-base">{t('total_label')}:</span>
                <span className="font-bold text-2xl">{fmt(order.total)} ₴</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

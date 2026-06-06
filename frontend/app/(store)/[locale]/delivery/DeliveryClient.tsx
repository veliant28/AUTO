'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Truck, Package, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import StaticPage from '@/components/features/StaticPage';

export default function DeliveryClient() {
  const t = useTranslations('pages.delivery');
  const params = useParams();
  const locale = params?.locale as string || 'ru';

  const { data: f } = useQuery({
    queryKey: ['footer', locale],
    queryFn: async () => {
      const { data } = await api.get(`/footer?locale=${locale}`);
      return data?.data || {};
    },
  });

  return (
    <StaticPage title={t('title')}>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Truck className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('courier_title')}</p>
            <p>{f?.delivery_courier || t('courier_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('pickup_title')}</p>
            <p>{f?.delivery_pickup || t('pickup_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('timing_title')}</p>
            <p>{f?.delivery_timing || t('timing_desc')}</p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}

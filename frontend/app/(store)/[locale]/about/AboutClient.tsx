'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import StaticPage from '@/components/features/StaticPage';

export default function AboutClient() {
  const t = useTranslations('pages.about');
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
      <p>{f?.about || t('p1')}</p>
      <p>{t('p2')}</p>
      <p>{t('p3')}</p>
    </StaticPage>
  );
}

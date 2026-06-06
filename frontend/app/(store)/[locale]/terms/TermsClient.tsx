'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import StaticPage from '@/components/features/StaticPage';

export default function TermsClient() {
  const t = useTranslations('pages.terms');
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
      <p>{f?.terms_general || t('p1')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_1')}</h2>
      <p>{f?.terms_general || t('p2_1')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_2')}</h2>
      <p>{f?.terms_copyright || t('p2_2')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_3')}</h2>
      <p>{f?.terms_personal || t('p2_3')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_4')}</h2>
      <p>{f?.terms_liability || t('p2_4')}</p>
    </StaticPage>
  );
}

'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import StaticPage from '@/components/features/StaticPage';

export default function FaqClient() {
  const t = useTranslations('pages.faq');
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
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <h3 className="font-medium text-foreground mb-1">{f?.[`faq_q${i}`] || t(`q${i}`)}</h3>
            <p>{f?.[`faq_a${i}`] || t(`a${i}`)}</p>
          </div>
        ))}
      </div>
    </StaticPage>
  );
}

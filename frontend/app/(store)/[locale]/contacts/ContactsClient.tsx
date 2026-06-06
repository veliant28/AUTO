'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Mail, Phone, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { formatPhone } from '@/components/ui/PhoneInput';
import api from '@/lib/api';
import StaticPage from '@/components/features/StaticPage';

export default function ContactsClient() {
  const t = useTranslations('pages.contacts');
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
          <Phone className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('phone_title')}</p>
            <p>{formatPhone(f?.contact_phone) || t('phone')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('email_title')}</p>
            <p>{f?.contact_email || t('email')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('address_title')}</p>
            <p>{f?.contact_address || t('address')}</p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}

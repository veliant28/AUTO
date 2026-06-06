import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Mail, Phone, MapPin } from 'lucide-react';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.contacts');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function ContactsPage() {
  const t = await getTranslations('pages.contacts');
  return (
    <StaticPage title={t('title')}>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Phone className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('phone_title')}</p>
            <p>{t('phone')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('email_title')}</p>
            <p>{t('email')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('address_title')}</p>
            <p>{t('address')}</p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}

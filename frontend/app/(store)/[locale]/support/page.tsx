import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.support');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function SupportPage() {
  const t = await getTranslations('pages.support');
  return (
    <StaticPage title={t('title')}>
      <p>{t('desc')}</p>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('chat_title')}</p>
            <p>{t('chat_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('email_title')}</p>
            <p>{t('email_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Phone className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('phone_title')}</p>
            <p>{t('phone_desc')}</p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}

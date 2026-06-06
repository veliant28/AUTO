import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Truck, Package, Clock } from 'lucide-react';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.delivery');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function DeliveryPage() {
  const t = await getTranslations('pages.delivery');
  return (
    <StaticPage title={t('title')}>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Truck className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('courier_title')}</p>
            <p>{t('courier_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('pickup_title')}</p>
            <p>{t('pickup_desc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('timing_title')}</p>
            <p>{t('timing_desc')}</p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}

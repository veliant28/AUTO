import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.faq');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function FaqPage() {
  const t = await getTranslations('pages.faq');
  return (
    <StaticPage title={t('title')}>
      <div className="space-y-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <h3 className="font-medium text-foreground mb-1">{t(`q${i}`)}</h3>
            <p>{t(`a${i}`)}</p>
          </div>
        ))}
      </div>
    </StaticPage>
  );
}

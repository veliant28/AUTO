import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.terms');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function TermsPage() {
  const t = await getTranslations('pages.terms');
  return (
    <StaticPage title={t('title')}>
      <p>{t('p1')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_1')}</h2>
      <p>{t('p2_1')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_2')}</h2>
      <p>{t('p2_2')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_3')}</h2>
      <p>{t('p2_3')}</p>
      <h2 className="text-lg font-medium text-foreground mt-6">{t('h2_4')}</h2>
      <p>{t('p2_4')}</p>
    </StaticPage>
  );
}

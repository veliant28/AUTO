import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import StaticPage from '@/components/features/StaticPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.about');
  return {
    title: t('meta_title'),
    description: t('meta_desc'),
  };
}

export default async function AboutPage() {
  const t = await getTranslations('pages.about');
  return (
    <StaticPage title={t('title')}>
      <p>{t('p1')}</p>
      <p>{t('p2')}</p>
      <p>{t('p3')}</p>
    </StaticPage>
  );
}

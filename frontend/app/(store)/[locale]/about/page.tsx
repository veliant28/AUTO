import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import AboutClient from './AboutClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.about');
  return { title: t('meta_title'), description: t('meta_desc') };
}

export default function AboutPage() {
  return <AboutClient />;
}

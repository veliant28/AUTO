import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import FaqClient from './FaqClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.faq');
  return { title: t('meta_title'), description: t('meta_desc') };
}

export default function FaqPage() {
  return <FaqClient />;
}

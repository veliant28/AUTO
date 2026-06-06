import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SupportClient from './SupportClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.support');
  return { title: t('meta_title'), description: t('meta_desc') };
}

export default function SupportPage() {
  return <SupportClient />;
}

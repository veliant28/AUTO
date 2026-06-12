import { getTranslations } from 'next-intl/server';
import ProductClient from './ProductClient';

interface Props {
  params: Promise<{ locale: string; article: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { article, locale } = await params;
  const t = await getTranslations('catalog');
  return {
    title: `${article} — SVOM`,
    description: t('title'),
  };
}

export default async function ProductPage({ params }: Props) {
  const { article } = await params;
  return <ProductClient article={article} />;
}

import { getPageMetadata } from '@/lib/metadata';
import CatalogClient from './CatalogClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('catalog', locale);
}

export default function CatalogPage() {
  return <CatalogClient />;
}

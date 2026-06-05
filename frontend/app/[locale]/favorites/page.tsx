import { getPageMetadata } from '@/lib/metadata';
import FavoritesClient from './FavoritesClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('favorites', locale);
}

export default function FavoritesPage() {
  return <FavoritesClient />;
}

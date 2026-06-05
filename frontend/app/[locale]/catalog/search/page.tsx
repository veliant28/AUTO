import { getPageMetadata } from '@/lib/metadata';
import SearchClient from './SearchClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('search', locale);
}

export default function SearchPage() {
  return <SearchClient />;
}

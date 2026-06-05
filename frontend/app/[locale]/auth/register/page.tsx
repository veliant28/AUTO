import { getPageMetadata } from '@/lib/metadata';
import UregisterClient from './uregisterClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('register', locale);
}

export default function Page() { return <UregisterClient />; }

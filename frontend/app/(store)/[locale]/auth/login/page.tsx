import { getPageMetadata } from '@/lib/metadata';
import UloginClient from './uloginClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('login', locale);
}

export default function Page() { return <UloginClient />; }

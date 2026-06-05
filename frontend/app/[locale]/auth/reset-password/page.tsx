import { getPageMetadata } from '@/lib/metadata';
import OrderConfirmedClient from './OrderConfirmedClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('orderConfirmed', locale);
}

export default function Page() { return <OrderConfirmedClient />; }

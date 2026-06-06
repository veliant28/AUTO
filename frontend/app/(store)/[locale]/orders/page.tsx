import { getPageMetadata } from '@/lib/metadata';
import OrdersClient from './OrdersClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('orders', locale);
}

export default function OrdersPage() {
  return <OrdersClient />;
}

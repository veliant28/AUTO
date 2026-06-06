import { getPageMetadata } from '@/lib/metadata';
import CheckoutClient from './CheckoutClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('checkout', locale);
}

export default function CheckoutPage() {
  return <CheckoutClient />;
}

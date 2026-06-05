import { getPageMetadata } from '@/lib/metadata';
import CartClient from './CartClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('cart', locale);
}

export default function CartPage() {
  return <CartClient />;
}

import { getPageMetadata } from '@/lib/metadata';
import AdminClient from './AdminClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('admin', locale);
}

export default function AdminPage() {
  return <AdminClient />;
}

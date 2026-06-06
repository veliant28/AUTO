import { getPageMetadata } from '@/lib/metadata';
import ResetPasswordClient from './ResetPasswordClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('resetPassword', locale);
}

export default function Page() { return <ResetPasswordClient />; }

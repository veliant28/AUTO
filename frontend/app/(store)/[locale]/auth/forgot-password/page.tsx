import { getPageMetadata } from '@/lib/metadata';
import ForgotPasswordClient from './ForgotPasswordClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('forgotPassword', locale);
}

export default function Page() { return <ForgotPasswordClient />; }

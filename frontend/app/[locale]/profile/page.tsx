import { getPageMetadata } from '@/lib/metadata';
import ProfileClient from './ProfileClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('profile', locale);
}

export default function ProfilePage() {
  return <ProfileClient />;
}

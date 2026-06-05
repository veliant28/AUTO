import { getPageMetadata } from '@/lib/metadata';
import SettingsClient from './SettingsClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('profileSettings', locale);
}

export default function SettingsPage() {
  return <SettingsClient />;
}

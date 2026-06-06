import { getPageMetadata } from '@/lib/metadata';
import GarageClient from './GarageClient';

export async function generateMetadata(params: any) {
  const { locale } = await params;
  return getPageMetadata('garage', locale);
}

export default function GaragePage() {
  return <GarageClient />;
}

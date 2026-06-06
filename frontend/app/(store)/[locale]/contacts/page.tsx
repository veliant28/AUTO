import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ContactsClient from './ContactsClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations('pages.contacts');
  return { title: t('meta_title'), description: t('meta_desc') };
}

export default function ContactsPage() {
  return <ContactsClient />;
}

import Link from 'next/link';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { locale } = await params;
  const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080/api/v1';
  let brandName = 'AutoParts';
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) brandName = data.brand_name;
    }
  } catch {}
  const titleMap: Record<string, string> = {
    ru: `404 — ${brandName}`,
    en: `404 — ${brandName}`,
    ua: `404 — ${brandName}`,
  };
  return {
    title: titleMap[locale] || titleMap.ru,
  };
}

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="text-2xl font-semibold">{t('not_found_title')}</h2>
      <p className="text-muted-foreground max-w-md">
        {t('not_found_desc')}
      </p>
      <Link href="/">
        <Button size="lg" className="gap-2">
          <Home className="w-4 h-4" /> {t('go_home')}
        </Button>
      </Link>
    </div>
  );
}

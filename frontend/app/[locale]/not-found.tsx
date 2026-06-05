import Link from 'next/link';
import { Package, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <div className="bg-muted rounded-full p-6">
        <Package className="w-16 h-16 text-muted-foreground" />
      </div>
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

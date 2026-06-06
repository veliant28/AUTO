'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');

  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <div className="bg-destructive/10 rounded-full p-6">
        <AlertTriangle className="w-16 h-16 text-destructive" />
      </div>
      <h1 className="text-4xl font-bold">{t('error_title')}</h1>
      <p className="text-muted-foreground max-w-md">
        {t('error_desc')}
      </p>
      <div className="flex gap-4">
        <Button size="lg" onClick={() => reset()}>
          {t('try_again')}
        </Button>
        <Link href="/">
          <Button variant="outline" size="lg">
            {t('go_home')}
          </Button>
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <div className="bg-destructive/10 rounded-full p-6">
        <AlertTriangle className="w-16 h-16 text-destructive" />
      </div>
      <h1 className="text-6xl font-bold text-destructive">500</h1>
      <h2 className="text-2xl font-semibold">Что-то пошло не так</h2>
      <p className="text-muted-foreground max-w-md">
        Произошла внутренняя ошибка сервера. Пожалуйста, попробуйте обновить страницу или вернуться позже.
      </p>
      <div className="flex gap-4">
        <Button size="lg" onClick={reset} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Попробовать снова
        </Button>
        <Link href="/">
          <Button size="lg" variant="outline" className="gap-2">
            <Home className="w-4 h-4" /> На главную
          </Button>
        </Link>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { Package, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeaderSimple } from '@/components/layout/Header';

export default async function RootNotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <HeaderSimple />
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-muted rounded-full p-6">
            <Package className="w-16 h-16 text-muted-foreground" />
          </div>
          <h1 className="text-6xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold">Страница не найдена</h2>
          <p className="text-muted-foreground max-w-md">
            Запрашиваемая страница не существует или была удалена
          </p>
          <Link href="/">
            <Button size="lg" className="gap-2">
              <Home className="w-4 h-4" /> На главную
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import { Package, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container mx-auto py-20 px-4 flex flex-col items-center justify-center text-center space-y-6 min-h-[60vh]">
      <div className="bg-muted rounded-full p-6">
        <Package className="w-16 h-16 text-muted-foreground" />
      </div>
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="text-2xl font-semibold">Страница не найдена</h2>
      <p className="text-muted-foreground max-w-md">
        Возможно, эта страница была удалена или ссылка, по которой вы перешли, неверна.
      </p>
      <Link href="/">
        <Button size="lg" className="gap-2">
          <Home className="w-4 h-4" /> На главную
        </Button>
      </Link>
    </div>
  );
}

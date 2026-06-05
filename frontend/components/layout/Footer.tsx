'use client';

import React from 'react';
import Link from 'next/link';
import { Package, Shield } from 'lucide-react';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { useAuthStore } from '@/store/authStore';

export default function Footer() {
  const { user } = useAuthStore();
  const adminRoles = ['admin', 'manager', 'operator'];
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap la-8">
          <div className="col-span-1 md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <div className="bg-primary text-primary-foreground p-1 rounded">
                <Package className="w-6 h-6" />
              </div>
              <span>Auto<span className="text-primary">Parts</span></span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Крупнейший интернет-магазин автозапчастей с интеграцией TecDoc.
              Мгновенный поиск и точная применимость.
            </p>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-semibold">Компания</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/about" className="hover:text-primary transition-colors">О нас</Link></li>
              <li><Link href="/contacts" className="hover:text-primary transition-colors">Контакты</Link></li>
              <li><Link href="/delivery" className="hover:text-primary transition-colors">Доставка</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Помощь</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
              <li><Link href="/support" className="hover:text-primary transition-colors">Поддержка</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Условия</Link></li>
              {adminRoles.includes(user?.role ?? '') && (
                <li><Link href="/admin" className="hover:text-primary transition-colors font-medium flex items-center gap-1"><Shield className="w-3 h-3" /> Админ-панель</Link></li>
              )}
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© 2026 AutoParts Store. Все права защищены.</p>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}

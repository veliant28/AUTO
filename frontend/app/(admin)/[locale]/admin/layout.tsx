'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, Users, ShoppingCart, Menu, X, Ban, Loader2, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarUrl, getInitials } from '@/lib/avatar';
import { Card, CardContent } from '@/components/ui/card';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';

const adminRoles = ['admin', 'manager', 'operator'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, avatarStyle } = useAuthStore();
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !adminRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Ban className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t('access_denied')}</h1>
            <p className="text-muted-foreground">{t('access_denied_desc')}</p>
            {!isAuthenticated ? (
              <Link href="/auth/login">
                <Button>{tc('login')}</Button>
              </Link>
            ) : (
              <Link href="/">
                <Button variant="outline">{t('go_home')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: t('dashboard_title'), roles: ['admin', 'manager', 'operator'] },
    { href: '/admin/users', icon: Users, label: t('users_title'), roles: ['admin'] },
    { href: '/admin/orders', icon: ShoppingCart, label: t('orders_title'), roles: ['admin', 'manager', 'operator'] },
  ];

  return (
    <div className="flex min-h-screen bg-muted/10">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <Link href="/admin" className="font-bold text-lg tracking-tight flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span>{t('sidebar_title')}</span>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => {
              const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight mr-2">
              <div className="bg-primary text-primary-foreground p-1 rounded">
                <Package className="w-5 h-5" />
              </div>
              <span className="hidden sm:inline">Auto<span className="text-primary">Parts</span></span>
            </Link>
            <div className="border-l pl-2 flex items-center gap-1">
              <LanguageSwitcher />
              <Avatar className="h-8 w-8 ring-2 ring-border">
                <AvatarImage src={getAvatarUrl(user?.full_name || user?.email || 'user', avatarStyle)} />
                <AvatarFallback>{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
              </Avatar>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

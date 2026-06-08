'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, Users, ShoppingCart, Menu, X, Ban, Loader2, Package, FileText, Shield, Database, RefreshCw, Plus, Save, Tag, Car,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarUrl, getInitials } from '@/lib/avatar';
import { Card, CardContent } from '@/components/ui/card';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { AdminLocaleProvider, useAdminLocale } from './components/AdminLocaleContext';

const LOCALES = ['ru', 'en', 'ua'];

function hasRole(user: { role: string } | null, ...roles: string[]) {
  if (!user) return false;
  return roles.includes(user.role);
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, avatarStyle } = useAuthStore();
  const { activeLocale, setActiveLocale } = useAdminLocale();
  const ta = useTranslations('admin');
  const isTecDoc = pathname.includes('/admin/tecdoc');
  const isFooter = pathname.includes('/admin/footer');

  const pageMeta: Record<string, { icon: any; titleKey: string }> = {
    '/admin': { icon: LayoutDashboard, titleKey: 'dashboard_title' },
    '/admin/orders': { icon: ShoppingCart, titleKey: 'orders_title' },
    '/admin/users': { icon: Users, titleKey: 'users_title' },
    '/admin/products': { icon: Package, titleKey: 'products_title' },
    '/admin/brands': { icon: Tag, titleKey: 'brands_title' },
    '/admin/roles': { icon: Shield, titleKey: 'roles_title' },
    '/admin/tecdoc': { icon: Database, titleKey: 'tecdoc_title' },
    '/admin/catalog': { icon: Car, titleKey: 'catalog_title' },
    '/admin/footer': { icon: FileText, titleKey: 'footer_title' },
  };

  const pageMetaEntries = Object.entries(pageMeta).sort((a, b) => b[0].length - a[0].length);
  const currentMeta = pageMetaEntries.find(([route]) => pathname.endsWith(route) || pathname.includes(route + '/')) || pageMetaEntries.find(([route]) => pathname.includes(route));
  const meta = currentMeta?.[1];

  const tecdocTabs = [
    { key: 'dashboard', label: ta('tecdoc_dashboard') },
    { key: 'batch', label: ta('tecdoc_batch') },
    { key: 'manual', label: ta('tecdoc_manual') },
    { key: 'settings', label: ta('tecdoc_settings') },
  ];

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="w-5 h-5" />
        </Button>
        {meta && (
          <div className="flex items-center gap-2 shrink-0">
            <meta.icon className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold truncate hidden sm:block">{ta(meta.titleKey)}</h1>
          </div>
        )}
        {isTecDoc && tecdocTabs.map((t) => {
          const active = (searchParams.get('tab') || 'dashboard') === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('tab', t.key);
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t.label.toUpperCase()}
            </button>
          );
        })}
        {isFooter && LOCALES.map((loc) => (
          <button
            key={loc}
            onClick={() => setActiveLocale(loc)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeLocale === loc
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {loc.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {pathname.endsWith('/admin') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={() => api.post('/catalog/sync/vehicles').then(() => alert(ta('sync_started')))}>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('sync_catalog')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/users') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={() => (window as any).__openCreateUser?.()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('create_user')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/roles') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={() => (window as any).__openCreateRole?.()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('roles_create')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {isFooter && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={() => (window as any).__saveFooter?.()}>
                  <Save className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('save_footer', { locale: activeLocale.toUpperCase() })}</TooltipContent>
            </Tooltip>
          </div>
        )}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
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
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
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

  if (!hasRole(user, 'admin', 'manager', 'operator')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Ban className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t('access_denied')}</h1>
            <p className="text-muted-foreground">{t('access_denied_desc')}</p>
            {!isAuthenticated ? (
              <Link href="/auth/login"><Button>{tc('login')}</Button></Link>
            ) : (
              <Link href="/"><Button variant="outline">{t('go_home')}</Button></Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: t('dashboard_title'), roles: ['admin', 'manager', 'operator'] },
    { href: '/admin/orders', icon: ShoppingCart, label: t('orders_title'), roles: ['admin', 'manager', 'operator'] },
    { href: '/admin/users', icon: Users, label: t('users_title'), roles: ['admin'] },
    { href: '/admin/products', icon: Package, label: t('products_title'), roles: ['admin'] },
    { href: '/admin/brands', icon: Tag, label: t('brands_title'), roles: ['admin'] },
    { href: '/admin/roles', icon: Shield, label: t('roles_title'), roles: ['admin'] },
    { href: '/admin/tecdoc', icon: Database, label: t('tecdoc_title'), roles: ['admin'] },
    { href: '/admin/catalog', icon: Car, label: t('catalog_title'), roles: ['admin'] },
    { href: '/admin/footer', icon: FileText, label: t('footer_title'), roles: ['admin'] },
  ];

  return (
    <div className="flex min-h-screen bg-muted/10">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

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
            .filter((item) => hasRole(user, ...item.roles))
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

      <div className="flex-1 flex flex-col min-h-screen">
        <Suspense fallback={null}><TopBar onMenuClick={() => setSidebarOpen(true)} /></Suspense>
        <main className="flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLocaleProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminLocaleProvider>
  );
}

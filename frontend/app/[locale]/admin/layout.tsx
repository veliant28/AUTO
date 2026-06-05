'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Users, ShoppingCart, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const adminRoles = ['admin', 'manager', 'operator'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const t = useTranslations('admin');

  if (!user || !adminRoles.includes(user.role)) {
    return null;
  }

  const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: t('dashboard_title'), roles: ['admin', 'manager', 'operator'] },
    { href: '/admin/users', icon: Users, label: t('users_title'), roles: ['admin'] },
    { href: '/admin/orders', icon: ShoppingCart, label: t('orders_title'), roles: ['admin', 'manager', 'operator'] },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <aside className="w-56 border-r bg-muted/20 hidden md:block">
        <nav className="flex flex-col gap-1 p-4">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => {
              const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
      <main className="flex-1">{children}</main>
    </div>
  );
}

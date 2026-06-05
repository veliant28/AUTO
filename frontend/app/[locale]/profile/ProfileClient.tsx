'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { User, Car, ShoppingCart, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';

export default function ProfilePage() {
  const t = useTranslations('common');
  const { user, isAuthenticated, logout } = useAuthStore();

  const menuItems = [
    { icon: Car, label: t('my_garage'), href: '/garage' },
    { icon: ShoppingCart, label: t('cart'), href: '/cart' },
    { icon: User, label: t('personal_data'), href: '#' },
    { icon: Settings, label: t('settings'), href: '/profile/settings' },
  ];

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <User className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('login_title')}</h1>
        <p className="text-muted-foreground">{t('login_desc')}</p>
        <div className="flex gap-4 justify-center">
          <Link href="/auth/login"><Button>{t('login')}</Button></Link>
          <Link href="/auth/register"><Button variant="outline">{t('register')}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-80 space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className="bg-muted w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center">
                <User className="w-8 h-8 text-muted-foreground" />
              </div>
              <CardTitle>{user?.full_name || t('user')}</CardTitle>
              <Badge variant="outline">{user?.role || 'retail'}</Badge>
            </CardHeader>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              {menuItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <Button variant="ghost" className="w-full justify-start gap-3">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
              <Separator />
              <Button variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={logout}>
                <LogOut className="w-4 h-4" />
                {t('logout')}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('personal_data')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">{t('email_label')}</p>
                  <p className="font-medium">{user?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('role_label')}</p>
                  <p className="font-medium capitalize">{user?.role || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('my_garage')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/garage">
                <Button variant="outline" className="gap-2">
                  <Car className="w-4 h-4" />
                  {t('manage_garage')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

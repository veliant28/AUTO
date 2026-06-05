'use client';

import React from 'react';
import Link from 'next/link';
import { User, Car, ShoppingCart, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';

const menuItems = [
  { icon: Car, label: 'Мой гараж', href: '/garage' },
  { icon: ShoppingCart, label: 'Корзина', href: '/cart' },
  { icon: User, label: 'Личные данные', href: '#' },
  { icon: Settings, label: 'Настройки', href: '#' },
];

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <User className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">Войдите в аккаунт</h1>
        <p className="text-muted-foreground">Авторизуйтесь, чтобы просматривать профиль и управлять гаражом</p>
        <div className="flex gap-4 justify-center">
          <Button>Войти</Button>
          <Button variant="outline">Регистрация</Button>
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
              <CardTitle>{user?.full_name || 'Пользователь'}</CardTitle>
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
                Выйти
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Личные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{user?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Роль</p>
                  <p className="font-medium capitalize">{user?.role || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Мой гараж</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/garage">
                <Button variant="outline" className="gap-2">
                  <Car className="w-4 h-4" />
                  Управлять гаражом
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

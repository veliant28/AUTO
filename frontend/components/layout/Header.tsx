'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShoppingCart, User, Car, Package, Heart, ClipboardList, LogOut, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { Badge } from '@/components/ui/badge';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CART_MAX_DISPLAY } from '@/lib/constants';
import { getAvatarUrl, getInitials } from '@/lib/avatar';

export default function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, avatarStyle } = useAuthStore();
  const { totalItems } = useCartStore();

  const cartCount = totalItems();
  const t = useTranslations('header');
  const tc = useTranslations('common');

  const navItems = [
    { name: tc('search'), href: '/catalog/search', icon: Search },
    { name: t('catalog'), href: '/catalog', icon: Package },
    { name: t('garage'), href: '/garage', icon: Car },
    { name: t('favorites'), href: '/favorites', icon: Heart },
    { name: t('orders'), href: '/orders', icon: ClipboardList },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight shrink-0">
            <div className="bg-primary text-primary-foreground p-1 rounded">
              <Package className="w-6 h-6" />
            </div>
            <span className="hidden sm:inline">Auto<span className="text-primary">Parts</span></span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <nav className="hidden lg:flex items-center gap-1 mr-2">
              {navItems.map((item) => (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href}>
                      <Button variant="ghost" size="icon" className={pathname === item.href ? 'bg-accent text-accent-foreground' : ''}>
                        <item.icon className="h-5 w-5" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>{item.name}</TooltipContent>
                </Tooltip>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2 border-l pl-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/cart">
                    <Button variant="ghost" size="icon" className="relative">
                      <ShoppingCart className="h-5 w-5" />
                      {cartCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                        {cartCount > CART_MAX_DISPLAY ? '99+' : cartCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>{tc('cart')}</TooltipContent>
            </Tooltip>

            <LanguageSwitcher />

              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={getAvatarUrl(user?.full_name || user?.email || 'user', avatarStyle)} />
                          <AvatarFallback>{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                  {isAuthenticated ? (
                    <>
                      <DropdownMenuLabel className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                      <AvatarImage src={getAvatarUrl(user?.full_name || user?.email || 'user', avatarStyle)} />
                          <AvatarFallback>{getInitials(user?.full_name || '', user?.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user?.full_name || tc('user')}</p>
                          <p className="text-xs text-muted-foreground font-normal capitalize">{user?.role}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/profile"><User className="mr-2 h-4 w-4" /> {t('profile_link')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/garage"><Car className="mr-2 h-4 w-4" /> {t('my_garage')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/favorites"><Heart className="mr-2 h-4 w-4" /> {t('favorites')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/orders"><ClipboardList className="mr-2 h-4 w-4" /> {t('orders')}</Link>
                      </DropdownMenuItem>
                      {['admin','manager','operator'].includes(user?.role ?? '') && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild className="text-primary font-medium">
                            <Link href="/admin"><Package className="mr-2 h-4 w-4" /> {t('admin_panel')}</Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={logout}>
                        <LogOut className="mr-2 h-4 w-4" /> {tc('logout')}
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuLabel>{t('my_account')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/auth/login">{tc('login')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/auth/register">{tc('register')}</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent>{t('my_account')}</TooltipContent>
            </Tooltip>

            <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden flex items-center justify-around py-2 safe-area-bottom">
        {navItems.map((item) => (
          <Link 
            key={item.href} 
            href={item.href}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-colors ${
              pathname === item.href ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px]">{item.name}</span>
          </Link>
        ))}
        <Link href="/cart" className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-colors ${
          pathname === '/cart' ? 'text-primary' : 'text-muted-foreground'
        }`}>
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">
                {cartCount > CART_MAX_DISPLAY ? '99+' : cartCount}
              </Badge>
            )}
          </div>
          <span className="text-[10px]">{tc('cart')}</span>
        </Link>
      </nav>
    </>
  );
}

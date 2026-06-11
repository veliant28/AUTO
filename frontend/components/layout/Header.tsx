'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShoppingCart, User, Car, Package, LogOut, Search, Heart, ClipboardList } from 'lucide-react';
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
import CategoryNav from '@/components/layout/CategoryNav';
import VehicleSelectorDialog from '@/components/vehicles/VehicleSelectorDialog';
import FalconLogo from '@/components/ui/FalconLogo';
import { useVehicleStore } from '@/store/vehicleStore';
import { CART_MAX_DISPLAY } from '@/lib/constants';
import { getAvatarUrl, getInitials } from '@/lib/avatar';
import { useBrandName } from '@/hooks/useBrandName';

export default function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout, avatarStyle } = useAuthStore();
  const { totalItems } = useCartStore();
  const { modId } = useVehicleStore();

  const cartCount = totalItems();
  const t = useTranslations('header');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  const brandName = useBrandName();

  const mobileNavItems = [
    { name: tc('search'), href: '/catalog/search', icon: Search },
    { name: tc('cart'), href: '/cart', icon: ShoppingCart },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight shrink-0">
            <div className="bg-primary text-primary-foreground p-1 rounded">
              <FalconLogo className="w-6 h-6" />
            </div>
            <span className="hidden sm:inline">{brandName}</span>
          </Link>

          <CategoryNav />

          <div className="flex items-center gap-1 sm:gap-2 border-l pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/catalog/search">
                  <Button variant="ghost" size="icon">
                    <Search className="h-5 w-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>{tc('search')}</TooltipContent>
            </Tooltip>

            <VehicleSelectorDialog>
              <Button variant="ghost" size="icon" className="relative">
                <Car className="h-5 w-5" />
                {modId && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-green-500 rounded-full ring-2 ring-background" />
                )}
              </Button>
            </VehicleSelectorDialog>

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
                          <p className="text-xs text-muted-foreground font-normal">{ta(user?.role || 'retail')}</p>
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
                      {user?.role && ['admin','manager','operator'].includes(user.role) && (
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
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden flex items-center justify-around py-2 safe-area-bottom">
        {mobileNavItems.map((item) => (
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
        <Link href="/garage" className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-colors ${
          pathname === '/garage' ? 'text-primary' : 'text-muted-foreground'
        }`}>
          <Package className="w-5 h-5" />
          <span className="text-[10px]">{t('garage')}</span>
        </Link>
        <Link href="/favorites" className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-colors ${
          pathname === '/favorites' ? 'text-primary' : 'text-muted-foreground'
        }`}>
          <Heart className="w-5 h-5" />
          <span className="text-[10px]">{t('favorites')}</span>
        </Link>
        <Link href="/orders" className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-colors ${
          pathname === '/orders' ? 'text-primary' : 'text-muted-foreground'
        }`}>
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">{t('orders')}</span>
        </Link>
      </nav>
    </>
  );
}

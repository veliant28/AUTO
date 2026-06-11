'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBrandName } from '@/hooks/useBrandName';
import FalconLogo from '@/components/ui/FalconLogo';

export default function Footer() {
  const t = useTranslations('footer');
  const { user } = useAuthStore();
  const params = useParams();
  const locale = params?.locale as string || 'ru';
  const { data: f } = useQuery({
    queryKey: ['footer', locale],
    queryFn: async () => {
      const { data } = await api.get(`/footer?locale=${locale}`);
      return data?.data || {};
    },
  });

  const brandName = useBrandName();
  const hasAdminAccess = !!(user?.role && ['admin', 'manager', 'operator'].includes(user.role));

  const ft = (key: string) => f?.[key] || t(key);

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap la-8">
          <div className="col-span-1 md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <div className="bg-primary text-primary-foreground p-1 rounded">
              <FalconLogo className="w-6 h-6" />
              </div>
              <span>{brandName}</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              {ft('description')}
            </p>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-semibold">{t('company_title')}</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/about" className="hover:text-primary transition-colors">{t('about')}</Link></li>
              <li><Link href="/contacts" className="hover:text-primary transition-colors">{t('contacts')}</Link></li>
              <li><Link href="/delivery" className="hover:text-primary transition-colors">{t('delivery')}</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">{t('help_title')}</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/faq" className="hover:text-primary transition-colors">{t('faq')}</Link></li>
              <li><Link href="/support" className="hover:text-primary transition-colors">{t('support')}</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">{t('terms')}</Link></li>
              {hasAdminAccess && (
                <li><Link href="/admin" className="hover:text-primary transition-colors font-medium flex items-center gap-1"><Shield className="w-3 h-3" /> {t('admin_panel')}</Link></li>
              )}
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>{ft('copyright')}</p>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}

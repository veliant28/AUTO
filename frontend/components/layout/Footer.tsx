'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Package, Shield, Phone, Mail, MapPin } from 'lucide-react';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import { formatPhone } from '@/components/ui/PhoneInput';
import api from '@/lib/api';

export default function Footer() {
  const t = useTranslations('footer');
  const { user } = useAuthStore();
  const params = useParams();
  const locale = params?.locale as string || 'ru';
  const adminRoles = ['admin', 'manager', 'operator'];

  const { data: f } = useQuery({
    queryKey: ['footer', locale],
    queryFn: async () => {
      const { data } = await api.get(`/footer?locale=${locale}`);
      return data?.data || {};
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const ft = (key: string) => f?.[key] || t(key);

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
            <p className="text-sm text-muted-foreground max-w-xs">{ft('description')}</p>
            <p className="text-xs text-muted-foreground">{ft('copyright')}</p>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-semibold">{t('company_title')}</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/about" className="hover:text-primary transition-colors">{t('about')}</Link></li>
              <li className="flex items-center gap-1.5"><Phone className="w-3 h-3 shrink-0" />{formatPhone(ft('contact_phone')) || t('contact_phone')}</li>
              <li className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" />{ft('contact_email') || t('contact_email')}</li>
              <li className="flex items-center gap-1.5"><MapPin className="w-3 h-3 shrink-0" />{ft('contact_address') || t('contact_address')}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">{t('help_title')}</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><Link href="/faq" className="hover:text-primary transition-colors">{t('faq')}</Link></li>
              <li><Link href="/support" className="hover:text-primary transition-colors">{t('support')}</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">{t('terms')}</Link></li>
              {adminRoles.includes(user?.role ?? '') && (
                <li><Link href="/admin" className="hover:text-primary transition-colors font-medium flex items-center gap-1"><Shield className="w-3 h-3" /> {t('admin_panel')}</Link></li>
              )}
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t flex justify-center text-sm text-muted-foreground">
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}

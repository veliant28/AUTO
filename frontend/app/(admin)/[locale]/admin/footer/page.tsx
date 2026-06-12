'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneInput, phoneToApi, apiToPhone } from '@/components/ui/PhoneInput';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useAdminLocale } from '../components/AdminLocaleContext';

interface FooterData {
  description: string;
  copyright: string;
  about: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  faq: string;
  delivery_courier: string;
  delivery_pickup: string;
  delivery_timing: string;
  support_chat: string;
  support_email: string;
  support_phone: string;
  terms_general: string;
  terms_copyright: string;
  terms_personal: string;
  terms_liability: string;
}

export default function FooterPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const { activeLocale } = useAdminLocale();

  const [localForms, setLocalForms] = React.useState<Record<string, FooterData>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-footer'],
    queryFn: async () => {
      const { data } = await api.get('/admin/footer');
      return data as { locale: string; data: FooterData }[];
    },
    enabled: !!user,
  });

  const getForm = (locale: string): FooterData => {
    if (localForms[locale]) return localForms[locale];
    const server = data?.find((d) => d.locale === locale)?.data;
    return server || {} as FooterData;
  };

  const setField = (field: keyof FooterData, value: string) => {
    setLocalForms((prev) => ({
      ...prev,
      [activeLocale]: { ...getForm(activeLocale), [field]: value },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (locale: string) => {
      const form = { ...getForm(locale) };
      if (form.contact_phone) form.contact_phone = phoneToApi(form.contact_phone);
      if (form.support_phone) form.support_phone = phoneToApi(form.support_phone);
      await api.put(`/admin/footer/${locale}`, { data: form });
      return form;
    },
    onSuccess: (form, locale) => {
      queryClient.setQueryData(['footer', locale], form);
      queryClient.invalidateQueries({ queryKey: ['admin-footer'] });
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('save_error')),
  });

  if (!user || user.role !== 'admin') return null;

  useEffect(() => {
    (window as any).__saveFooter = () => saveMutation.mutate(activeLocale);
    return () => { delete (window as any).__saveFooter; };
  }, [activeLocale]);

  const form = getForm(activeLocale);

  const ta = (field: keyof FooterData) => (
    <textarea
      value={form[field] || ''}
      onChange={(e) => setField(field, e.target.value)}
      rows={4}
      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
    />
  );

  const inp = (field: keyof FooterData, type = 'text') => (
    <Input type={type} value={form[field] || ''} onChange={(e) => setField(field, e.target.value)} />
  );

  return (
    <div className="p-6">

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Column 1: SVOM + Contacts + Delivery */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_logo_name')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_description')}</label>
                  {ta('description')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_copyright')}</label>
                  {inp('copyright')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_about')}</label>
                  {ta('about')}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_contacts')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_contact_phone')}</label>
                  <PhoneInput value={apiToPhone(form.contact_phone)} onChange={(v) => setField('contact_phone', v)} placeholder="+38 (0XX) XXX-XX-XX" className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_contact_email')}</label>
                  {inp('contact_email', 'email')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_contact_address')}</label>
                  {inp('contact_address')}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_delivery_courier')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_delivery_courier')}</label>
                  {ta('delivery_courier')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_delivery_pickup')}</label>
                  {ta('delivery_pickup')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_delivery_timing')}</label>
                  {ta('delivery_timing')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Column 2: FAQ */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_faq')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="mb-2">
                      <label className="text-sm text-muted-foreground mb-1 block">{t(`footer_faq_q${i}`)}</label>
                      {inp(`faq_q${i}` as keyof FooterData)}
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">{t(`footer_faq_a${i}`)}</label>
                      {ta(`faq_a${i}` as keyof FooterData)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Column 3: Support + Terms */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_support')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_support_chat')}</label>
                  {inp('support_chat')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_support_email')}</label>
                  {inp('support_email', 'email')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_support_phone')}</label>
                  <PhoneInput value={apiToPhone(form.support_phone)} onChange={(v) => setField('support_phone', v)} placeholder="+38 (0XX) XXX-XX-XX" className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('footer_terms_general')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_terms_general')}</label>
                  {ta('terms_general')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_terms_copyright')}</label>
                  {ta('terms_copyright')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_terms_personal')}</label>
                  {ta('terms_personal')}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('footer_terms_liability')}</label>
                  {ta('terms_liability')}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}

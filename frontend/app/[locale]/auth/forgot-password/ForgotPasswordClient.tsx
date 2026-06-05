'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

export default function ForgotPasswordPage() {
  const { forgotPassword, forgotLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const t = useTranslations('auth');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotPassword({ email });
    setSent(true);
  };

  if (sent) {
    return (
      <div className="container mx-auto py-20 px-4 max-w-md text-center space-y-6">
        <div className="bg-primary/10 w-16 h-16 mx-auto rounded-full flex items-center justify-center">
          <Send className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold">{t('check_email')}</h1>
        <p className="text-muted-foreground">{t('email_sent')} <strong>{email}</strong></p>
        <Link href="/auth/login">
          <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" /> {t('back_to_login')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">{t('forgot_title')}</h1>
        <p className="text-muted-foreground">{t('forgot_desc')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('email_label')}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('email_placeholder')} className="pl-10" required />
          </div>
        </div>
        <Button type="submit" className="w-full gap-2" size="lg" disabled={forgotLoading}>
          <Send className="w-4 h-4" />{forgotLoading ? t('sending') : t('send_link')}
        </Button>
      </form>
      <p className="text-center mt-8">
        <Link href="/auth/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> {t('back_to_login')}
        </Link>
      </p>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';

export default function RegisterPage() {
  const { register, registerLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const t = useTranslations('auth');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ email, password, full_name: name });
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">{t('register_title')}</h1>
        <p className="text-muted-foreground">{t('register_desc')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('name_label')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name_placeholder')} className="pl-10" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('email_label')}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('email_placeholder')} className="pl-10" required />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('password_label')}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password_placeholder')} className="pl-10 pr-10" required minLength={PASSWORD_MIN_LENGTH} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full gap-2" size="lg" disabled={registerLoading}>
          <UserPlus className="w-4 h-4" />
          {registerLoading ? t('register_loading') : t('register_btn')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-8">
        {t('have_account')}{' '}
        <Link href="/auth/login" className="text-primary font-medium hover:underline">{t('login_btn')}</Link>
      </p>
    </div>
  );
}

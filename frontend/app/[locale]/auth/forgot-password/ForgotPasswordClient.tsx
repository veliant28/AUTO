'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

export default function ForgotPasswordPage() {
  const { forgotPassword, forgotLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

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
        <h1 className="text-3xl font-bold">Проверьте почту</h1>
        <p className="text-muted-foreground">
          Мы отправили ссылку для восстановления пароля на <strong>{email}</strong>
        </p>
        <Link href="/auth/login">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Вернуться ко входу
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">Восстановление пароля</h1>
        <p className="text-muted-foreground">Введите email, и мы вышлем ссылку для сброса пароля</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" 
              className="pl-10" 
              required 
            />
          </div>
        </div>

        <Button type="submit" className="w-full gap-2" size="lg" disabled={forgotLoading}>
          <Send className="w-4 h-4" />
          {forgotLoading ? 'Отправка...' : 'Отправить ссылку'}
        </Button>
      </form>

      <p className="text-center mt-8">
        <Link href="/auth/login" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Вернуться ко входу
        </Link>
      </p>
    </div>
  );
}

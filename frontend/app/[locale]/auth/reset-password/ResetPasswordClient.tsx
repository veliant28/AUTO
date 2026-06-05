'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { resetPassword, resetLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return;
    resetPassword({ token, password });
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">Новый пароль</h1>
        <p className="text-muted-foreground">Придумайте новый пароль для вашего аккаунта</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Новый пароль</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов" 
                className="pl-10 pr-10" 
                required 
                minLength={PASSWORD_MIN_LENGTH}
              />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Подтвердите пароль</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type={showPassword ? 'text' : 'password'} 
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Повторите пароль" 
                className="pl-10" 
                required 
                minLength={PASSWORD_MIN_LENGTH}
              />
          </div>
        </div>

        <Button type="submit" className="w-full gap-2" size="lg" disabled={resetLoading || password !== confirm}>
          <KeyRound className="w-4 h-4" />
          {resetLoading ? 'Сохранение...' : 'Сохранить пароль'}
        </Button>
      </form>
    </div>
  );
}

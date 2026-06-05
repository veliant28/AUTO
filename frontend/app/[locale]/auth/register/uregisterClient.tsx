'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';

export default function RegisterPage() {
  const { register, registerLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ email, password, full_name: name });
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">Регистрация</h1>
        <p className="text-muted-foreground">Создайте аккаунт для быстрого заказа запчастей</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Имя</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов" 
              className="pl-10" 
            />
          </div>
        </div>

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

        <div className="space-y-2">
          <label className="text-sm font-medium">Пароль</label>
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

        <Button type="submit" className="w-full gap-2" size="lg" disabled={registerLoading}>
          <UserPlus className="w-4 h-4" />
          {registerLoading ? 'Регистрация...' : 'Создать аккаунт'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-8">
        Уже есть аккаунт?{' '}
        <Link href="/auth/login" className="text-primary font-medium hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}

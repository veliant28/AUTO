'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/lib/toast'
import { useAuth } from '@/hooks/useAuth'
import { loginSchema, LoginFormData } from '@/lib/validations/authSchemas'
import { GoogleLogin, CredentialResponse } from '@react-oauth/google'

export default function LoginPage() {
  const { login, loginLoading, googleAuth } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const t = useTranslations('auth')
  const tc = useTranslations('common')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema(tc)) })
  const onSubmit = (data: LoginFormData) => login(data)

  const onGoogleSuccess = (response: CredentialResponse) => {
    if (response.credential) {
      googleAuth(response.credential)
    }
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">{t('login_title')}</h1>
        <p className="text-muted-foreground">{t('login_desc')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('email_label')}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              {...register('email')}
              type="email"
              placeholder={t('email_placeholder')}
              className="h-10 pl-10"
            />
          </div>
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('password_label')}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="h-10 pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            {t('forgot_password')}
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full gap-2"
          size="lg"
          disabled={loginLoading}
        >
          <LogIn className="w-5 h-5" /> {loginLoading ? '...' : t('login_btn')}
        </Button>
      </form>

      <div className="my-8 flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-sm text-muted-foreground">{t('or')}</span>
        <Separator className="flex-1" />
      </div>

      <div className="w-full flex justify-center">
        <GoogleLogin
          onSuccess={onGoogleSuccess}
          onError={() => toast.error(t('google_error'))}
          theme="outline"
          size="large"
          text="signin_with"
          shape="rectangular"
          width="100%"
        />
      </div>

      <p className="text-center text-sm text-muted-foreground mt-8">
        {t('no_account')}{' '}
        <Link
          href="/auth/register"
          className="text-primary font-medium hover:underline"
        >
          {t('register_btn')}
        </Link>
      </p>
    </div>
  )
}

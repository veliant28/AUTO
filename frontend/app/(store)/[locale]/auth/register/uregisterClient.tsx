'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, RegisterFormData } from '@/lib/validations/authSchemas'
import { toast } from '@/lib/toast'

export default function RegisterPage() {
  const { register: registerUser, registerLoading } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const t = useTranslations('auth')
  const tc = useTranslations('common')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema(tc)),
  })

  const onError = (fieldErrors: typeof errors) => {
    if (fieldErrors.full_name) {
      toast.info(
        fieldErrors.full_name.message || tc('name_min_length', { min: 2 }),
      )
    } else if (fieldErrors.email) {
      toast.info(fieldErrors.email.message || tc('email_invalid'))
    } else if (fieldErrors.password) {
      toast.info(
        fieldErrors.password.message || tc('password_min_length', { min: 6 }),
      )
    }
  }

  const onSubmit = (data: RegisterFormData) => {
    registerUser({
      email: data.email,
      password: data.password,
      first_name: data.full_name,
    })
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold">{t('register_title')}</h1>
        <p className="text-muted-foreground">{t('register_desc')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('name_label')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              {...register('full_name')}
              placeholder={t('name_placeholder')}
              className="h-10 pl-10"
            />
          </div>
        </div>

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
        </div>

        <Button
          type="submit"
          className="w-full gap-2"
          size="lg"
          disabled={registerLoading}
        >
          <UserPlus className="w-5 h-5" />
          {registerLoading ? t('register_loading') : t('register_btn')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-8">
        {t('have_account')}{' '}
        <Link
          href="/auth/login"
          className="text-primary font-medium hover:underline"
        >
          {t('login_btn')}
        </Link>
      </p>
    </div>
  )
}

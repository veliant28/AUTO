'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Eye, EyeOff, Settings, Mail, Send, LogIn } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import FalconLogo from '@/components/ui/FalconLogo'

const TZS = [
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'Europe/Kiev',
  'Europe/Moscow',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/London',
  'Europe/Istanbul',
  'Asia/Tbilisi',
  'Asia/Yerevan',
  'UTC',
].filter((v, i, a) => a.indexOf(v) === i)

export default function SettingsPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const [brandName, setBrandName] = React.useState('')
  const [timezone, setTimezone] = React.useState('Europe/Kiev')

  // SMTP fields
  const [resendApiKey, setResendApiKey] = React.useState('')
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [emailFrom, setEmailFrom] = React.useState('noreply@svom.com.ua')
  const [emailFromName, setEmailFromName] = React.useState('')
  const [testEmail, setTestEmail] = React.useState('')

  // Google OAuth fields
  const [googleClientId, setGoogleClientId] = React.useState('')
  const [googleClientSecret, setGoogleClientSecret] = React.useState('')
  const [showGoogleSecret, setShowGoogleSecret] = React.useState(false)
  const [hasGoogleSecret, setHasGoogleSecret] = React.useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings')
      return data as {
        brand_name: string
        timezone: string
        email_from: string
        email_from_name: string | null
        has_resend_api_key: boolean
        resend_api_key_masked: string | null
        google_client_id: string | null
        has_google_secret: boolean
        google_client_secret_masked: string | null
      }
    },
    enabled: !!user,
  })

  // Track the original masked key to detect changes
  const [savedKeyMask, setSavedKeyMask] = React.useState<string | null>(null)
  const [savedSecretMask, setSavedSecretMask] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (data?.brand_name) setBrandName(data.brand_name)
    if (data?.timezone) setTimezone(data.timezone)
    if (data?.email_from) setEmailFrom(data.email_from)
    if (data?.email_from_name) setEmailFromName(data.email_from_name)
    if (data?.resend_api_key_masked) {
      setResendApiKey(data.resend_api_key_masked)
      setSavedKeyMask(data.resend_api_key_masked)
    } else {
      setSavedKeyMask(null)
    }
    if (data?.google_client_id) setGoogleClientId(data.google_client_id)
    if (data?.google_client_secret_masked) {
      setGoogleClientSecret(data.google_client_secret_masked)
      setSavedSecretMask(data.google_client_secret_masked)
      setHasGoogleSecret(true)
    } else {
      setGoogleClientSecret('')
      setSavedSecretMask(null)
      setHasGoogleSecret(false)
    }
  }, [data])

  const isKeyUnchanged = resendApiKey === savedKeyMask
  const isSecretUnchanged = googleClientSecret === savedSecretMask

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { brand_name: brandName, timezone }
      if (!isKeyUnchanged) payload.resend_api_key = resendApiKey
      if (emailFrom) payload.email_from = emailFrom
      if (emailFromName) payload.email_from_name = emailFromName
      if (googleClientId) payload.google_client_id = googleClientId
      if (!isSecretUnchanged) payload.google_client_secret = googleClientSecret
      await api.put('/admin/settings', payload)
    },
    onSuccess: () => {
      queryClient.setQueryData(['public-settings'], { brand_name: brandName })
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success(t('settings_saved'))
    },
    onError: () => toast.error(t('save_error')),
  })

  React.useEffect(() => {
    ;(window as any).__saveSettings = () => saveMutation.mutate()
    return () => {
      delete (window as any).__saveSettings
    }
  }, [saveMutation.mutate])

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      await api.post('/admin/settings/test-email', { to_email: testEmail })
    },
    onSuccess: () => toast.success(t('settings_test_email_sent')),
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || t('settings_test_email_error'))
    },
  })

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* General Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              {t('settings_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_brand_name')}
                  </label>
                  <Input
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="SVOM"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_timezone')}
                  </label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TZS.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg bg-muted p-4 border">
                  <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
                    {t('settings_logo_preview')}
                  </p>
                  <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                    <div className="bg-primary text-primary-foreground p-1.5 rounded">
                      <FalconLogo className="w-5 h-5" />
                    </div>
                    <span>{brandName || 'SVOM'}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* SMTP / Email Settings Card */}
        <Card className="sm:col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t('settings_email_title')}
            </CardTitle>
            <CardDescription>{t('settings_email_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('settings_resend_api_key')}
                    </label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        value={resendApiKey}
                        onChange={(e) => setResendApiKey(e.target.value)}
                        placeholder={t('settings_resend_api_key_placeholder')}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('settings_email_from')}
                    </label>
                    <Input
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      placeholder="noreply@svom.com.ua"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('settings_email_from_name')}
                    </label>
                    <Input
                      value={emailFromName}
                      onChange={(e) => setEmailFromName(e.target.value)}
                      placeholder={brandName || 'SVOM'}
                    />
                  </div>
                </div>

                {/* Test Email */}
                <div className="border-t pt-4 mt-2">
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_test_email')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1"
                      type="email"
                    />
                    <Button
                      variant="outline"
                      onClick={() => testEmailMutation.mutate()}
                      disabled={testEmailMutation.isPending || !testEmail}
                      className="gap-2 shrink-0"
                    >
                      {testEmailMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {t('settings_test_email_btn')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Google OAuth Settings Card */}
        <Card className="sm:col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="w-5 h-5 text-primary" />
              {t('settings_google_title')}
            </CardTitle>
            <CardDescription>{t('settings_google_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_google_client_id')}
                  </label>
                  <Input
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="123456-xxxxx.apps.googleusercontent.com"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_google_client_secret')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showGoogleSecret ? 'text' : 'password'}
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      placeholder={t(
                        'settings_google_client_secret_placeholder',
                      )}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showGoogleSecret ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

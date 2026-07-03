'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Eye,
  EyeOff,
  Settings,
  Mail,
  Send,
  LogIn,
  HelpCircle,
  Receipt,
  Building2,
  Wallet,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
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
import { Checkbox as CheckboxUI } from '@/components/ui/checkbox'
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

  // Checkbox fields
  const [checkboxApiKey, setCheckboxApiKey] = React.useState('')
  const [showCheckboxKey, setShowCheckboxKey] = React.useState(false)
  const [checkboxOrgId, setCheckboxOrgId] = React.useState('')
  const [checkboxIsTest, setCheckboxIsTest] = React.useState(true)
  const [hasCheckboxKey, setHasCheckboxKey] = React.useState(false)

  // Payment method toggles
  const [paymentCodEnabled, setPaymentCodEnabled] = React.useState(true)
  const [paymentMonobankEnabled, setPaymentMonobankEnabled] =
    React.useState(true)
  const [paymentNovapayEnabled, setPaymentNovapayEnabled] = React.useState(true)
  const [paymentLiqpayEnabled, setPaymentLiqpayEnabled] = React.useState(true)

  // Monobank fields
  const [monobankToken, setMonobankToken] = React.useState('')
  const [showMonobankToken, setShowMonobankToken] = React.useState(false)
  const [hasMonobankToken, setHasMonobankToken] = React.useState(false)

  // LiqPay fields
  const [liqpayPublicKey, setLiqpayPublicKey] = React.useState('')
  const [showLiqpayPublic, setShowLiqpayPublic] = React.useState(false)
  const [hasLiqpayPublic, setHasLiqpayPublic] = React.useState(false)
  const [liqpayPrivateKey, setLiqpayPrivateKey] = React.useState('')
  const [showLiqpayPrivate, setShowLiqpayPrivate] = React.useState(false)
  const [hasLiqpayPrivate, setHasLiqpayPrivate] = React.useState(false)

  // NovaPay fields
  const [novapayMerchantId, setNovapayMerchantId] = React.useState('')
  const [novapayPrivateKey, setNovapayPrivateKey] = React.useState('')
  const [showNovapayKey, setShowNovapayKey] = React.useState(false)
  const [hasNovapayPrivateKey, setHasNovapayPrivateKey] = React.useState(false)

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
        has_checkbox_api_key: boolean
        checkbox_api_key_masked: string | null
        checkbox_organization_id: string | null
        checkbox_is_test: boolean
        payment_cod_enabled: boolean
        payment_monobank_enabled: boolean
        payment_novapay_enabled: boolean
        payment_liqpay_enabled: boolean
        has_monobank_token: boolean
        monobank_token_masked: string | null
        has_liqpay_public_key: boolean
        liqpay_public_key_masked: string | null
        has_liqpay_private_key: boolean
        liqpay_private_key_masked: string | null
        has_novapay_private_key: boolean
        novapay_private_key_masked: string | null
        novapay_merchant_id: string | null
      }
    },
    enabled: !!user,
  })

  // Track the original masked key to detect changes
  const [savedKeyMask, setSavedKeyMask] = React.useState<string | null>(null)
  const [savedSecretMask, setSavedSecretMask] = React.useState<string | null>(
    null,
  )
  const [savedCheckboxKeyMask, setSavedCheckboxKeyMask] = React.useState<
    string | null
  >(null)
  const [savedMonobankTokenMask, setSavedMonobankTokenMask] = React.useState<
    string | null
  >(null)
  const [savedLiqpayPublicMask, setSavedLiqpayPublicMask] = React.useState<
    string | null
  >(null)
  const [savedLiqpayPrivateMask, setSavedLiqpayPrivateMask] = React.useState<
    string | null
  >(null)
  const [savedNovapayKeyMask, setSavedNovapayKeyMask] = React.useState<
    string | null
  >(null)
  const [savedNovapayMerchantId, setSavedNovapayMerchantId] = React.useState<
    string | null
  >(null)

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
    if (data?.checkbox_api_key_masked) {
      setCheckboxApiKey(data.checkbox_api_key_masked)
      setSavedCheckboxKeyMask(data.checkbox_api_key_masked)
      setHasCheckboxKey(true)
    } else {
      setCheckboxApiKey('')
      setSavedCheckboxKeyMask(null)
      setHasCheckboxKey(false)
    }
    if (data?.checkbox_organization_id) {
      setCheckboxOrgId(data.checkbox_organization_id)
    } else {
      setCheckboxOrgId('')
    }
    if (data?.checkbox_is_test !== undefined) {
      setCheckboxIsTest(data.checkbox_is_test)
    }
    // Payment method toggles
    if (data?.payment_cod_enabled !== undefined)
      setPaymentCodEnabled(data.payment_cod_enabled)
    if (data?.payment_monobank_enabled !== undefined)
      setPaymentMonobankEnabled(data.payment_monobank_enabled)
    if (data?.payment_novapay_enabled !== undefined)
      setPaymentNovapayEnabled(data.payment_novapay_enabled)
    if (data?.payment_liqpay_enabled !== undefined)
      setPaymentLiqpayEnabled(data.payment_liqpay_enabled)
    // Monobank
    if (data?.monobank_token_masked) {
      setMonobankToken(data.monobank_token_masked)
      setSavedMonobankTokenMask(data.monobank_token_masked)
      setHasMonobankToken(true)
    } else {
      setMonobankToken('')
      setSavedMonobankTokenMask(null)
      setHasMonobankToken(false)
    }
    // LiqPay
    if (data?.liqpay_public_key_masked) {
      setLiqpayPublicKey(data.liqpay_public_key_masked)
      setSavedLiqpayPublicMask(data.liqpay_public_key_masked)
      setHasLiqpayPublic(true)
    } else {
      setLiqpayPublicKey('')
      setSavedLiqpayPublicMask(null)
      setHasLiqpayPublic(false)
    }
    if (data?.liqpay_private_key_masked) {
      setLiqpayPrivateKey(data.liqpay_private_key_masked)
      setSavedLiqpayPrivateMask(data.liqpay_private_key_masked)
      setHasLiqpayPrivate(true)
    } else {
      setLiqpayPrivateKey('')
      setSavedLiqpayPrivateMask(null)
      setHasLiqpayPrivate(false)
    }
    // NovaPay
    if (data?.novapay_merchant_id)
      setNovapayMerchantId(data.novapay_merchant_id)
    if (data?.novapay_private_key_masked) {
      setNovapayPrivateKey(data.novapay_private_key_masked)
      setSavedNovapayKeyMask(data.novapay_private_key_masked)
      setHasNovapayPrivateKey(true)
    } else {
      setNovapayPrivateKey('')
      setSavedNovapayKeyMask(null)
      setHasNovapayPrivateKey(false)
    }
  }, [data])

  const isKeyUnchanged = resendApiKey === savedKeyMask
  const isSecretUnchanged = googleClientSecret === savedSecretMask
  const isCheckboxKeyUnchanged = checkboxApiKey === savedCheckboxKeyMask
  const isMonobankTokenUnchanged = monobankToken === savedMonobankTokenMask
  const isLiqpayPublicUnchanged = liqpayPublicKey === savedLiqpayPublicMask
  const isLiqpayPrivateUnchanged = liqpayPrivateKey === savedLiqpayPrivateMask
  const isNovapayKeyUnchanged = novapayPrivateKey === savedNovapayKeyMask

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { brand_name: brandName, timezone }
      if (!isKeyUnchanged) payload.resend_api_key = resendApiKey
      if (emailFrom) payload.email_from = emailFrom
      if (emailFromName) payload.email_from_name = emailFromName
      if (googleClientId) payload.google_client_id = googleClientId
      if (!isSecretUnchanged) payload.google_client_secret = googleClientSecret
      if (!isCheckboxKeyUnchanged) payload.checkbox_api_key = checkboxApiKey
      if (checkboxOrgId) payload.checkbox_organization_id = checkboxOrgId
      payload.checkbox_is_test = checkboxIsTest
      // Payment toggles
      payload.payment_cod_enabled = paymentCodEnabled
      payload.payment_monobank_enabled = paymentMonobankEnabled
      payload.payment_novapay_enabled = paymentNovapayEnabled
      payload.payment_liqpay_enabled = paymentLiqpayEnabled
      // Monobank
      if (!isMonobankTokenUnchanged) payload.monobank_token = monobankToken
      // LiqPay
      if (!isLiqpayPublicUnchanged) payload.liqpay_public_key = liqpayPublicKey
      if (!isLiqpayPrivateUnchanged)
        payload.liqpay_private_key = liqpayPrivateKey
      // NovaPay
      if (novapayMerchantId) payload.novapay_merchant_id = novapayMerchantId
      if (!isNovapayKeyUnchanged)
        payload.novapay_private_key = novapayPrivateKey
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t('settings_email_title')}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>{t('settings_email_desc')}</TooltipContent>
              </Tooltip>
            </CardTitle>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                {/* Test Email */}
                <div>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="w-5 h-5 text-primary" />
              {t('settings_google_title')}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>{t('settings_google_desc')}</TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Checkbox (Фіскалізація) Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Checkbox
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>{t('settings_checkbox_desc')}</TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_checkbox_api_key')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showCheckboxKey ? 'text' : 'password'}
                      value={checkboxApiKey}
                      onChange={(e) => setCheckboxApiKey(e.target.value)}
                      placeholder={t('settings_checkbox_api_key_placeholder')}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCheckboxKey(!showCheckboxKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showCheckboxKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_checkbox_organization_id')}
                  </label>
                  <Input
                    value={checkboxOrgId}
                    onChange={(e) => setCheckboxOrgId(e.target.value)}
                    placeholder={t(
                      'settings_checkbox_organization_id_placeholder',
                    )}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <CheckboxUI
                    id="checkbox-test-mode"
                    checked={checkboxIsTest}
                    onCheckedChange={(checked) => setCheckboxIsTest(!!checked)}
                  />
                  <label
                    htmlFor="checkbox-test-mode"
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    {t('settings_checkbox_test_mode')}
                  </label>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {/* Способы оплаты (Payment Methods) Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              {t('settings_payment_methods_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <div
                  className="flex items-center justify-between rounded-lg border p-4 cursor-pointer"
                  onClick={() => setPaymentCodEnabled(!paymentCodEnabled)}
                >
                  <label
                    className="text-sm font-medium cursor-pointer"
                    htmlFor="cod-toggle"
                  >
                    {t('payment_method_cod')}
                  </label>
                  <CheckboxUI
                    id="cod-toggle"
                    checked={paymentCodEnabled}
                    onCheckedChange={(checked) =>
                      setPaymentCodEnabled(!!checked)
                    }
                    className="cursor-pointer"
                  />
                </div>
                <div
                  className="flex items-center justify-between rounded-lg border p-4 cursor-pointer"
                  onClick={() =>
                    setPaymentMonobankEnabled(!paymentMonobankEnabled)
                  }
                >
                  <label
                    className="text-sm font-medium cursor-pointer"
                    htmlFor="monobank-toggle"
                  >
                    Monobank
                  </label>
                  <CheckboxUI
                    id="monobank-toggle"
                    checked={paymentMonobankEnabled}
                    onCheckedChange={(checked) =>
                      setPaymentMonobankEnabled(!!checked)
                    }
                    className="cursor-pointer"
                  />
                </div>
                <div
                  className="flex items-center justify-between rounded-lg border p-4 cursor-pointer"
                  onClick={() =>
                    setPaymentNovapayEnabled(!paymentNovapayEnabled)
                  }
                >
                  <label
                    className="text-sm font-medium cursor-pointer"
                    htmlFor="novapay-toggle"
                  >
                    NovaPay
                  </label>
                  <CheckboxUI
                    id="novapay-toggle"
                    checked={paymentNovapayEnabled}
                    onCheckedChange={(checked) =>
                      setPaymentNovapayEnabled(!!checked)
                    }
                    className="cursor-pointer"
                  />
                </div>
                <div
                  className="flex items-center justify-between rounded-lg border p-4 cursor-pointer"
                  onClick={() => setPaymentLiqpayEnabled(!paymentLiqpayEnabled)}
                >
                  <label
                    className="text-sm font-medium cursor-pointer"
                    htmlFor="liqpay-toggle"
                  >
                    LiqPay
                  </label>
                  <CheckboxUI
                    id="liqpay-toggle"
                    checked={paymentLiqpayEnabled}
                    onCheckedChange={(checked) =>
                      setPaymentLiqpayEnabled(!!checked)
                    }
                    className="cursor-pointer"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Monobank Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Monobank
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {t('settings_monobank_token')}
                </label>
                <div className="relative">
                  <Input
                    type={showMonobankToken ? 'text' : 'password'}
                    value={monobankToken}
                    onChange={(e) => setMonobankToken(e.target.value)}
                    placeholder={t('settings_monobank_token_placeholder')}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMonobankToken(!showMonobankToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showMonobankToken ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LiqPay Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              LiqPay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_liqpay_public_key')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showLiqpayPublic ? 'text' : 'password'}
                      value={liqpayPublicKey}
                      onChange={(e) => setLiqpayPublicKey(e.target.value)}
                      placeholder={t('settings_liqpay_key_placeholder')}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLiqpayPublic(!showLiqpayPublic)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showLiqpayPublic ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_liqpay_private_key')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showLiqpayPrivate ? 'text' : 'password'}
                      value={liqpayPrivateKey}
                      onChange={(e) => setLiqpayPrivateKey(e.target.value)}
                      placeholder={t('settings_liqpay_key_placeholder')}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLiqpayPrivate(!showLiqpayPrivate)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showLiqpayPrivate ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* NovaPay Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              NovaPay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_novapay_merchant_id')}
                  </label>
                  <Input
                    value={novapayMerchantId}
                    onChange={(e) => setNovapayMerchantId(e.target.value)}
                    placeholder="..."
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {t('settings_novapay_private_key')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showNovapayKey ? 'text' : 'password'}
                      value={novapayPrivateKey}
                      onChange={(e) => setNovapayPrivateKey(e.target.value)}
                      placeholder={t('settings_novapay_key_placeholder')}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNovapayKey(!showNovapayKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showNovapayKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

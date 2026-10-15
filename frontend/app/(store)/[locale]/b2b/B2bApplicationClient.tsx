'use client'

import React, { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  CheckCircle2,
  Loader2,
  Percent,
  Send,
  Truck,
  UserRound,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { PhoneInput } from '@/components/ui/PhoneInput'
import api from '@/lib/api'
import { toast } from '@/lib/toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function B2bApplicationClient() {
  const t = useTranslations('b2b')
  const params = useParams()
  const locale = (params?.locale as string) || 'ru'

  const [company, setCompany] = useState('')
  const [edrpou, setEdrpou] = useState('')
  const [city, setCity] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const benefits = [
    { icon: Percent, text: t('benefit_prices') },
    { icon: Truck, text: t('benefit_speed') },
    { icon: UserRound, text: t('benefit_support') },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !company.trim() ||
      !contactName.trim() ||
      !city.trim() ||
      !edrpou.trim()
    ) {
      toast.error(t('error_required'))
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error(t('error_email'))
      return
    }
    if (phone.replace(/\D/g, '').length < 11) {
      toast.error(t('error_phone'))
      return
    }
    setSending(true)
    try {
      await api.post('/requests/b2b-application', {
        company: company.trim(),
        edrpou: edrpou.trim(),
        contact_name: contactName.trim(),
        phone,
        email: email.trim(),
        city: city.trim(),
        comment: comment.trim() || null,
        locale,
      })
      setSent(true)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('error_generic'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="container mx-auto px-4 py-16 md:py-24">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="bg-green-500/10 w-16 h-16 mx-auto rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">{t('success_title')}</h1>
            <p className="text-muted-foreground">{t('success_text')}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link href="/">
                <Button>{t('success_home')}</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setSent(false)
                  setCompany('')
                  setEdrpou('')
                  setCity('')
                  setContactName('')
                  setPhone('')
                  setEmail('')
                  setComment('')
                }}
              >
                {t('success_again')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-primary">
            <Building2 className="w-4 h-4" />
            {t('badge')}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {benefits.map((b) => (
            <div
              key={b.text}
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <div className="bg-primary/10 w-10 h-10 shrink-0 rounded-lg flex items-center justify-center">
                <b.icon className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium leading-snug">{b.text}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  {t('section_company')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('company')} *
                    </label>
                    <Input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder={t('company_placeholder')}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('edrpou')} *
                    </label>
                    <Input
                      value={edrpou}
                      onChange={(e) =>
                        setEdrpou(
                          e.target.value.replace(/[^\d]/g, '').slice(0, 10),
                        )
                      }
                      placeholder={t('edrpou_placeholder')}
                      inputMode="numeric"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('city')} *
                    </label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={t('city_placeholder')}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <UserRound className="w-4 h-4 text-primary" />
                  {t('section_contact')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('contact_name')} *
                    </label>
                    <Input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder={t('contact_name_placeholder')}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('phone')} *
                    </label>
                    <PhoneInput value={phone} onChange={setPhone} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('email')} *
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('email_placeholder')}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {t('email_hint')}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('comment')}
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('comment_placeholder')}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending ? t('sending') : t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

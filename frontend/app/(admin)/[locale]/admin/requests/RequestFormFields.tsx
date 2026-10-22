'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarIcon, Search } from 'lucide-react'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { enUS, ru, uk } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PhoneInput, phoneToApi } from '@/components/ui/PhoneInput'
import api from '@/lib/api'
import { formatMinutes, parseHoursToMinutes } from '@/lib/timesheetTime'
import type { AssigneeOption } from './shared'

const DATE_FNS_LOCALE: Record<string, Locale> = { ru, uk, enUS }

/** Разрешаем только ЧЧ, ЧЧ:ММ или ЧЧ.ММ (до 2 цифр до и после разделителя). */
function sanitizeHoursInput(raw: string): string {
  const cleaned = raw.replace(/[^\d:.,]/g, '').replace(/,/g, '.')
  const m = cleaned.match(/^(\d{1,2})(?:([:.])(\d{0,2}))?/)
  if (!m) return ''
  return `${m[1]}${m[2] ?? ''}${m[3] ?? ''}`
}

export interface RequestFormValues {
  description: string
  payload: Record<string, any>
}

interface ClientOption {
  id: number
  name: string
  email: string
}

/** Проверка обязательных полей формы по категории. */
export function requestFormError(
  code: string | null | undefined,
  values: RequestFormValues,
): 'email' | 'phone' | 'time' | 'required' | null {
  const p = values.payload || {}

  if (code === 'b2b_registration') {
    if (!String(p.company || '').trim()) return 'required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(p.email || '').trim()))
      return 'email'
    const digits = String(p.phone || '').replace(/\D/g, '')
    if (digits.length < 12) return 'phone'
  }

  if (code === 'timesheet_manual') {
    if (!p.user_id || !String(p.work_date || '').trim()) return 'required'
    const minutes = parseHoursToMinutes(String(p.minutes ?? ''))
    if (minutes === null) return 'required'
    if (minutes === -1) return 'time'
  }

  if (code === 'ban_unban') {
    if (
      !p.user_id &&
      !String(p.email || '').trim() &&
      !String(p.client_name || '').trim()
    )
      return 'required'
  }

  return null
}

function Label({
  children,
  required,
  compact = false,
}: {
  children: React.ReactNode
  required?: boolean
  compact?: boolean
}) {
  return (
    <label
      className={`text-sm text-muted-foreground block ${
        compact ? 'mb-1' : 'mb-2'
      }`}
    >
      {children}
      {required ? ' *' : ''}
    </label>
  )
}

function ClientPicker({
  payload,
  updatePayload,
}: {
  payload: Record<string, any>
  updatePayload: (patch: Record<string, any>) => void
}) {
  const t = useTranslations('admin')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const selected = payload.user_id || payload.client_name || payload.email

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['requests', 'client-search', query],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/users?page_size=10&search=${encodeURIComponent(query)}`,
      )
      const items = data?.items || data?.users || []
      return items.map((u: any) => ({
        id: u.id,
        name:
          [u.last_name, u.first_name].filter(Boolean).join(' ') ||
          u.full_name ||
          u.email,
        email: u.email,
      }))
    },
    enabled: !selected,
  })

  if (selected) {
    return (
      <button
        type="button"
        onClick={() =>
          updatePayload({ user_id: null, email: null, client_name: null })
        }
        className="w-full text-left text-sm rounded-md border border-primary/50 bg-primary/5 px-3 py-2 cursor-pointer"
        title={t('requests_client_search')}
      >
        <span className="font-medium">
          {payload.client_name || payload.email || `#${payload.user_id}`}
        </span>
        {payload.email && payload.client_name && (
          <span className="text-muted-foreground"> · {payload.email}</span>
        )}
      </button>
    )
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('requests_client_search')}
          className="pl-9"
        />
      </div>
      <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
        {clients.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() =>
              updatePayload({
                user_id: c.id,
                email: c.email,
                client_name: c.name,
              })
            }
            className="w-full text-left text-sm rounded-md border px-3 py-2 hover:bg-accent cursor-pointer"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground"> · {c.email}</span>
          </button>
        ))}
        {clients.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('no_results')}</p>
        )}
      </div>
    </>
  )
}

/**
 * Редактируемые поля заявки. Раскладка зависит от кода категории:
 * B2B-анкета, правка часов, бан/разбан или обычное описание.
 */
export default function RequestFormFields({
  code,
  values,
  onChange,
  staff,
  inline = false,
}: {
  code: string | null | undefined
  values: RequestFormValues
  onChange: (patch: Partial<RequestFormValues>) => void
  staff: AssigneeOption[]
  /** Встроенный режим: без внутренних блоков и заголовков секций */
  inline?: boolean
}) {
  const t = useTranslations('admin')
  const tb = useTranslations('b2b')
  const locale = useLocale()
  const dateLocale = DATE_FNS_LOCALE[locale] || ru
  const [dateOpen, setDateOpen] = useState(false)
  const payload = values.payload || {}
  const selectedDate = payload.work_date
    ? new Date(`${payload.work_date}T00:00:00`)
    : undefined
  const validSelectedDate =
    selectedDate && !Number.isNaN(selectedDate.getTime())
      ? selectedDate
      : undefined

  const updatePayload = (patch: Record<string, any>) =>
    onChange({ payload: { ...payload, ...patch } })

  const staffOptions = useMemo(() => {
    const options = [...staff]
    const currentId = Number(payload.user_id || 0)
    if (currentId && !options.some((s) => s.id === currentId)) {
      options.unshift({
        id: currentId,
        name: payload.user_name || payload.email || `#${payload.user_id}`,
        email: payload.email || '',
        role: null,
      })
    }
    return options
  }, [staff, payload.user_id, payload.user_name, payload.email])

  const descriptionField =
    code !== 'b2b_registration' &&
    code !== 'ban_unban' &&
    code !== 'timesheet_manual' ? (
      <div>
        <Label compact={inline}>{t('requests_desc_label')}</Label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder={t('requests_desc_label')}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
    ) : null

  const banActionField = (
    <div>
      <Label required compact={inline}>
        {t('requests_fields_action')}
      </Label>
      <Select
        value={payload.action || 'ban'}
        onValueChange={(v) => updatePayload({ action: v })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ban">{t('requests_ban_action_ban')}</SelectItem>
          <SelectItem value="unban">
            {t('requests_ban_action_unban')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  const banClientField = (
    <div>
      <Label required compact={inline}>
        {t('requests_fields_client')}
      </Label>
      <ClientPicker payload={payload} updatePayload={updatePayload} />
    </div>
  )

  const banReasonField = (
    <div>
      <Label compact={inline}>{t('requests_fields_reason')}</Label>
      <textarea
        value={payload.reason || ''}
        onChange={(e) => updatePayload({ reason: e.target.value })}
        rows={3}
        placeholder={t('requests_ban_reason_placeholder')}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
    </div>
  )

  return (
    <div className="space-y-3">
      {inline && descriptionField}
      {code === 'b2b_registration' && (
        <div
          className={inline ? 'space-y-3' : 'space-y-4 rounded-lg border p-3'}
        >
          <div>
            {!inline && (
              <p className="text-sm font-semibold mb-2">
                {tb('section_company')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label required compact={inline}>
                  {tb('company')}
                </Label>
                <Input
                  value={payload.company || ''}
                  onChange={(e) => updatePayload({ company: e.target.value })}
                  placeholder={tb('company_placeholder')}
                />
              </div>
              <div>
                <Label compact={inline}>{tb('edrpou')}</Label>
                <Input
                  value={payload.edrpou || ''}
                  onChange={(e) =>
                    updatePayload({
                      edrpou: e.target.value.replace(/\D/g, '').slice(0, 10),
                    })
                  }
                  placeholder={tb('edrpou_placeholder')}
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label compact={inline}>{tb('city')}</Label>
                <Input
                  value={payload.city || ''}
                  onChange={(e) => updatePayload({ city: e.target.value })}
                  placeholder={tb('city_placeholder')}
                />
              </div>
            </div>
          </div>

          <div>
            {!inline && (
              <p className="text-sm font-semibold mb-2">
                {tb('section_contact')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required compact={inline}>
                  {tb('phone')}
                </Label>
                <PhoneInput
                  value={payload.phone || ''}
                  onChange={(v) => {
                    const digits = v.replace(/\D/g, '')
                    // Локальный номер 0XX… дополняем кодом страны
                    const normalized =
                      digits.length === 10 && digits.startsWith('0')
                        ? `+38${digits}`
                        : phoneToApi(v)
                    updatePayload({ phone: normalized })
                  }}
                />
              </div>
              <div>
                <Label compact={inline}>{tb('contact_last_name')}</Label>
                <Input
                  value={payload.contact_last_name || ''}
                  onChange={(e) =>
                    updatePayload({ contact_last_name: e.target.value })
                  }
                  placeholder={tb('contact_last_name_placeholder')}
                />
              </div>
              <div>
                <Label compact={inline}>{tb('contact_first_name')}</Label>
                <Input
                  value={payload.contact_first_name || ''}
                  onChange={(e) =>
                    updatePayload({ contact_first_name: e.target.value })
                  }
                  placeholder={tb('contact_first_name_placeholder')}
                />
              </div>
              <div>
                <Label compact={inline}>{tb('contact_middle_name')}</Label>
                <Input
                  value={payload.contact_middle_name || ''}
                  onChange={(e) =>
                    updatePayload({ contact_middle_name: e.target.value })
                  }
                  placeholder={tb('contact_middle_name_placeholder')}
                />
              </div>
              <div className="col-span-2">
                <Label required compact={inline}>
                  {tb('email')}
                </Label>
                <Input
                  type="email"
                  value={payload.email || ''}
                  onChange={(e) => updatePayload({ email: e.target.value })}
                  placeholder={tb('email_placeholder')}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {code === 'timesheet_manual' && (
        <div
          className={inline ? 'space-y-3' : 'space-y-3 rounded-lg border p-3'}
        >
          <div>
            <Label required compact={inline}>
              {t('requests_payload_user')}
            </Label>
            <Select
              value={payload.user_id ? String(payload.user_id) : ''}
              onValueChange={(v) => {
                const member = staffOptions.find((s) => String(s.id) === v)
                updatePayload({
                  user_id: Number(v),
                  user_name: member?.name || null,
                  email: member?.email || null,
                })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('requests_payload_user')} />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required compact={inline}>
                {t('requests_fields_date')}
              </Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-10"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {validSelectedDate ? (
                      format(validSelectedDate, 'dd.MM.yyyy', {
                        locale: dateLocale,
                      })
                    ) : (
                      <span className="text-muted-foreground">
                        {t('requests_fields_date')}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    className="rounded-md"
                    navLayout="around"
                    locale={dateLocale}
                    selected={validSelectedDate}
                    onSelect={(date) => {
                      if (!date) return
                      updatePayload({ work_date: format(date, 'yyyy-MM-dd') })
                      setDateOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label required compact={inline}>
                {t('requests_fields_hours')}
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                maxLength={5}
                pattern="[0-9]{1,2}([:.,][0-9]{1,2})?"
                value={
                  payload.minutes == null || payload.minutes === ''
                    ? ''
                    : typeof payload.minutes === 'number'
                      ? formatMinutes(payload.minutes)
                      : String(payload.minutes)
                }
                onChange={(e) =>
                  updatePayload({
                    minutes: sanitizeHoursInput(e.target.value),
                  })
                }
                placeholder="8:00"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('requests_hours_hint')}
          </p>
        </div>
      )}

      {code === 'ban_unban' &&
        (inline ? (
          <div className="space-y-3">
            {banActionField}
            <div className="grid grid-cols-2 gap-3">
              {banClientField}
              {banReasonField}
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            {banActionField}
            {banClientField}
            {banReasonField}
          </div>
        ))}

      {!inline && descriptionField}
    </div>
  )
}

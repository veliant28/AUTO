'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import {
  Building2,
  CalendarIcon,
  HelpCircle,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Search,
  Truck,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { enUS, ru, uk } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label as UiLabel } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import {
  SettlementItem,
  WarehouseDropdownItem,
} from '@/components/ui/nova-poshta-items'
import {
  Popover,
  PopoverAnchor,
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
import { PhoneInput, formatPhone, phoneToApi } from '@/components/ui/PhoneInput'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import { ORDER_STATUS_LABELS, RETURN_STATUS_LABELS } from '@/lib/constants'
import { formatMinutes, parseHoursToMinutes } from '@/lib/timesheetTime'
import { useNovaPoshtaAddressSearch } from '@/hooks/useNovaPoshtaAddressSearch'
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
  phone: string | null
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  role: string | null
  last_ip: string | null
}

interface OrderOption {
  id: number
  order_number: string
  full_name: string
  phone: string | null
  total: number
  status: string
}

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(
    Number(value || 0),
  )

function orderStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-gray-500 text-white'
  return ORDER_STATUS_LABELS[status]?.className || 'bg-gray-500 text-white'
}

interface ReturnOption {
  id: number
  return_number: string
  order_number: string
  status: string
  total_refund: number
  items_count: number
  phone: string | null
  client_name: string
}

export interface SupportChatOption {
  id: number
  ticket_number: string
  user_name: string
  user_phone: string | null
  user_email: string | null
  status: string
  last_message: string | null
  last_message_at: string | null
  created_at: string
}

const SUPPORT_STATUS_BADGE: Record<string, string> = {
  new: 'bg-orange-500 text-white',
  active: 'bg-green-500 text-white',
  closed: 'bg-gray-500 text-white',
}

function supportStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-gray-500 text-white'
  return SUPPORT_STATUS_BADGE[status] || 'bg-gray-500 text-white'
}

function formatSupportTime(
  dateStr: string | null | undefined,
  locale: string,
): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  const intlLocale = locale === 'ua' ? 'uk' : locale
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) {
    return new Intl.RelativeTimeFormat(intlLocale, {
      numeric: 'auto',
    }).format(-Math.max(mins, 0), 'minute')
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return new Intl.RelativeTimeFormat(intlLocale, {
      numeric: 'auto',
    }).format(-hours, 'hour')
  }
  return d.toLocaleDateString(intlLocale, {
    day: 'numeric',
    month: 'short',
  })
}

/** Плитка обращения — как в списке чатов поддержки */
export function SupportChatTile({ chat }: { chat: SupportChatOption }) {
  const t = useTranslations('admin')
  const locale = useLocale()
  const statusLabel =
    chat.status === 'new' ||
    chat.status === 'active' ||
    chat.status === 'closed'
      ? t(`support_status_${chat.status}`)
      : chat.status
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-mono font-bold truncate">
          {chat.ticket_number || `#${chat.id}`}
        </span>
        <AnimatedBadge swapKey={chat.status} className="shrink-0">
          <Badge
            className={`${supportStatusBadgeClass(chat.status)} border-0 text-sm`}
          >
            {statusLabel}
          </Badge>
        </AnimatedBadge>
      </div>
      {(chat.user_name || chat.user_phone || chat.user_email) && (
        <div className="mt-1 space-y-0.5">
          {chat.user_email && (
            <p className="text-sm leading-tight truncate font-mono text-muted-foreground/60">
              {chat.user_email}
            </p>
          )}
          {chat.user_name && (
            <p className="text-sm leading-tight truncate">{chat.user_name}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            {chat.user_phone ? (
              <span className="text-sm font-mono leading-tight truncate text-muted-foreground">
                {formatPhone(chat.user_phone)}
              </span>
            ) : (
              <span />
            )}
            <span className="text-sm shrink-0 text-muted-foreground/50">
              {formatSupportTime(
                chat.last_message_at || chat.created_at,
                locale,
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

interface PricingCategoryOption {
  category_id: number
  category_name: string
  margin_percent: number | null
}

/** Степпер наценки — тот же паттерн −/+ и три цифры, что на странице «Цена». */
function MarginStepper({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number) => void
}) {
  const num = Math.min(100, Math.max(0, Number(value ?? 0)))
  const digits = String(num).padStart(3, '0').split('')

  const applyDigits = (raw: string) => {
    const padded = raw.replace(/\D/g, '').slice(0, 3).padEnd(3, '0')
    onChange(Math.min(100, Math.max(0, Number(padded))))
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => onChange(Math.max(0, num - 1))}
      >
        <Minus className="w-3.5 h-3.5" />
      </Button>
      <InputOTP
        maxLength={3}
        value={digits.join('')}
        onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
          const input = e.target as HTMLInputElement
          const set0 = () => input.setSelectionRange(0, 0)
          setTimeout(set0, 0)
          setTimeout(set0, 100)
        }}
        onPointerDown={(e: React.PointerEvent<HTMLInputElement>) => {
          const input = e.target as HTMLInputElement
          setTimeout(() => input.setSelectionRange(0, 0), 0)
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== 'Backspace') return
          e.preventDefault()
          const input = e.target as HTMLInputElement
          const pos = Math.min(2, input.selectionStart ?? 2)
          const current = digits.join('')
          const next =
            current.substring(0, pos) + '0' + current.substring(pos + 1)
          applyDigits(next)
          setTimeout(() => input.setSelectionRange(pos, pos), 0)
        }}
        onChange={applyDigits}
        containerClassName="[&_[data-input-otp]]:pointer-events-auto"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} className="w-7 h-8 text-xs" />
          <InputOTPSlot index={1} className="w-7 h-8 text-xs" />
          <InputOTPSlot index={2} className="w-7 h-8 text-xs" />
        </InputOTPGroup>
      </InputOTP>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => onChange(Math.min(100, num + 1))}
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
      <span className="text-base font-semibold text-foreground">%</span>
    </div>
  )
}

function returnStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-gray-500 text-white'
  return RETURN_STATUS_LABELS[status]?.className || 'bg-gray-500 text-white'
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

  if (code === 'order_final_status') {
    if (!p.order_id) return 'required'
  }

  if (code === 'order_delete') {
    if (!p.order_id) return 'required'
    if (!String(values.description || '').trim()) return 'required'
  }

  if (code === 'return_change') {
    if (!p.return_id) return 'required'
    if (!String(values.description || '').trim()) return 'required'
  }

  if (code === 'support_edit') {
    if (!p.chat_id) return 'required'
    if (!String(values.description || '').trim()) return 'required'
  }

  if (code === 'other' && !String(values.description || '').trim())
    return 'required'

  if (code === 'pricing_change') {
    if (p.pricing_target !== 'general' && p.pricing_target !== 'category')
      return 'required'
    if (p.pricing_target === 'category' && !p.pricing_category_id)
      return 'required'
    const margin = Number(p.margin_percent)
    if (
      p.margin_percent == null ||
      p.margin_percent === '' ||
      !Number.isFinite(margin)
    )
      return 'required'
    if (margin < 0 || margin > 100) return 'required'
    if (!String(values.description || '').trim()) return 'required'
  }

  return null
}

function Label({
  children,
  required,
  compact = false,
  noMargin = false,
}: {
  children: React.ReactNode
  required?: boolean
  compact?: boolean
  noMargin?: boolean
}) {
  return (
    <label
      className={`text-sm text-muted-foreground block ${
        noMargin ? '' : compact ? 'mb-1' : 'mb-2'
      }`}
    >
      {children}
      {required ? ' *' : ''}
    </label>
  )
}

function ReadonlyField({
  label,
  value,
}: {
  label?: string
  value: React.ReactNode
}) {
  const empty = value == null || value === ''
  return (
    <div className="space-y-1 min-w-0">
      {label && (
        <p className="text-sm text-muted-foreground truncate">{label}</p>
      )}
      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
        <span className={empty ? 'truncate text-muted-foreground' : 'truncate'}>
          {empty ? '—' : value}
        </span>
      </div>
    </div>
  )
}

function ClientPicker({
  payload,
  updatePayload,
  readOnly = false,
}: {
  payload: Record<string, any>
  updatePayload: (patch: Record<string, any>) => void
  readOnly?: boolean
}) {
  const t = useTranslations('admin')
  const tb = useTranslations('b2b')
  const listId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const { data: clients = [], isFetching } = useQuery<ClientOption[]>({
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
        phone: u.phone || null,
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        middle_name: u.middle_name || null,
        role: u.role || null,
        last_ip: u.last_ip || null,
      }))
    },
    enabled: !readOnly && query.trim().length > 0,
  })

  // Пока debounce не отработал и запрос не вернулся, старый список нельзя
  // выбирать по Enter — он может не соответствовать введённому запросу.
  const loading = isFetching || search.trim() !== query.trim()

  // Подсвечиваем первый результат, чтобы Enter выбирал его без стрелок
  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const item = listRef.current.querySelector(
      `[data-index="${highlighted}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  const selectClient = (client: ClientOption) => {
    // Заранее предупреждаем: администратора нельзя заблокировать
    if (client.role === 'admin' && (payload.action || 'ban') === 'ban') {
      toast.warning(t('protection_cannot_ban_admin'))
    }
    updatePayload({
      user_id: client.id,
      email: client.email,
      client_name: client.name,
      phone: client.phone,
      first_name: client.first_name,
      last_name: client.last_name,
      middle_name: client.middle_name,
      role: client.role,
      last_ip: client.last_ip,
    })
    // Поле поиска — только для поиска: после выбора очищаем его
    setSearch('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((prev) => (prev < clients.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((prev) => (prev > 0 ? prev - 1 : clients.length - 1))
    } else if (e.key === 'Enter') {
      const client = clients[highlighted]
      if (client && !loading) {
        e.preventDefault()
        selectClient(client)
      }
    }
  }

  const clientDetails = (
    <div className={readOnly ? 'space-y-3' : 'mt-3 space-y-3'}>
      <div className="grid grid-cols-2 gap-3">
        <ReadonlyField
          label={t('requests_fields_phone')}
          value={payload.phone ? formatPhone(payload.phone) : null}
        />
        <ReadonlyField
          label={tb('contact_last_name')}
          value={payload.last_name || null}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ReadonlyField
          label={tb('contact_first_name')}
          value={payload.first_name || null}
        />
        <ReadonlyField
          label={tb('contact_middle_name')}
          value={payload.middle_name || null}
        />
      </div>
      <ReadonlyField
        label={t('requests_fields_email')}
        value={payload.email || null}
      />
      <ReadonlyField
        label={t('requests_fields_ip')}
        value={payload.last_ip || null}
      />
    </div>
  )

  if (readOnly) {
    return clientDetails
  }

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (search.trim()) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('requests_client_search')}
              className="pl-9 pr-9"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
            />
            {open && loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
          >
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  t('no_results')
                )}
              </p>
            ) : (
              clients.map((c, index) => (
                <div
                  key={c.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    index === highlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectClient(c)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.email}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {clientDetails}
    </div>
  )
}

/**
 * Поиск заказа для заявки «Изменение заказа»: номер, телефон, ФИО.
 * После выбора подгружает полный заказ и заполняет получателя/доставку.
 */
function OrderPicker({
  payload,
  updatePayload,
  onOrderLoaded,
}: {
  payload: Record<string, any>
  updatePayload: (patch: Record<string, any>) => void
  onOrderLoaded: (detail: any) => void
}) {
  const t = useTranslations('admin')
  const listId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [loadingOrder, setLoadingOrder] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const { data: orders = [], isFetching } = useQuery<OrderOption[]>({
    queryKey: ['requests', 'order-search', query],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/orders?page_size=10&search=${encodeURIComponent(query)}`,
      )
      return (data?.items || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number || `#${o.id}`,
        full_name: o.full_name || '—',
        phone: o.phone || null,
        total: Number(o.total || 0),
        status: o.status || '',
      }))
    },
    enabled: query.trim().length > 0,
  })

  const loading = isFetching || search.trim() !== query.trim() || loadingOrder

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const item = listRef.current.querySelector(
      `[data-index="${highlighted}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  const selectOrder = async (order: OrderOption) => {
    setLoadingOrder(true)
    try {
      const { data } = await api.get(`/admin/orders/${order.id}`)
      updatePayload({
        order_id: data.id,
        order_number: data.order_number || `#${data.id}`,
        order_status: data.status || '',
        order_total: data.total || 0,
        order_full_name: data.full_name || '',
        order_user_id: data.user_id,
        phone: data.phone || '',
        last_name: data.last_name || '',
        first_name: data.first_name || '',
        middle_name: data.middle_name || '',
        delivery_type: data.delivery_type || '',
        delivery_city: data.delivery_city || '',
        delivery_warehouse: data.delivery_warehouse || '',
        delivery_city_ref: data.delivery_city_ref || '',
        delivery_settlement_ref: data.delivery_settlement_ref || '',
        delivery_city_label: data.delivery_city_label || '',
        delivery_warehouse_ref: data.delivery_warehouse_ref || '',
        delivery_warehouse_label: data.delivery_warehouse_label || '',
        delivery_street_ref: data.delivery_street_ref || '',
        delivery_street_label: data.delivery_street_label || '',
        delivery_house: data.delivery_house || '',
        delivery_apartment: data.delivery_apartment || '',
      })
      onOrderLoaded(data)
      setSearch('')
      setOpen(false)
    } catch {
      toast.error(t('requests_order_load_error'))
    } finally {
      setLoadingOrder(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((prev) => (prev < orders.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((prev) => (prev > 0 ? prev - 1 : orders.length - 1))
    } else if (e.key === 'Enter') {
      const order = orders[highlighted]
      if (order && !loading) {
        e.preventDefault()
        selectOrder(order)
      }
    }
  }

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (search.trim()) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('requests_order_search')}
              className="pl-9 pr-9"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
            />
            {open && loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  t('no_results')
                )}
              </p>
            ) : (
              orders.map((o, index) => (
                <div
                  key={o.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    index === highlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOrder(o)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold truncate">
                        {o.order_number}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.full_name}
                      </p>
                      {o.phone && (
                        <p className="text-[10px] text-muted-foreground/60 font-mono">
                          {formatPhone(o.phone)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold whitespace-nowrap">
                        {formatMoney(o.total)} ₴
                      </p>
                      <AnimatedBadge swapKey={o.status}>
                        <Badge
                          className={`${orderStatusBadgeClass(o.status)} border-0 text-xs whitespace-nowrap`}
                        >
                          {o.status ? t(`order_${o.status}`) : '—'}
                        </Badge>
                      </AnimatedBadge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {payload.order_id && (
        <div className="mt-3 flex items-center justify-between py-3 px-3 gap-2 rounded-lg border bg-muted/20">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-mono font-semibold truncate">
              {payload.order_number || `#${payload.order_id}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {payload.order_full_name ||
                [payload.last_name, payload.first_name]
                  .filter(Boolean)
                  .join(' ') ||
                '—'}
            </p>
            {payload.phone && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {formatPhone(payload.phone)}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold whitespace-nowrap">
              {formatMoney(payload.order_total)} ₴
            </p>
            <AnimatedBadge swapKey={payload.order_status}>
              <Badge
                className={`${orderStatusBadgeClass(payload.order_status)} border-0 text-sm whitespace-nowrap`}
              >
                {payload.order_status
                  ? t(`order_${payload.order_status}`)
                  : '—'}
              </Badge>
            </AnimatedBadge>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Поиск возврата для заявки «Изменение возврата».
 * После выбора подгружает возврат и заполняет read-only данные получателя.
 */
function ReturnPicker({
  payload,
  updatePayload,
}: {
  payload: Record<string, any>
  updatePayload: (patch: Record<string, any>) => void
}) {
  const t = useTranslations('admin')
  const listId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [loadingReturn, setLoadingReturn] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const { data: returns = [], isFetching } = useQuery<ReturnOption[]>({
    queryKey: ['requests', 'return-search', query],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/returns?page_size=10&search=${encodeURIComponent(query)}`,
      )
      return (data?.items || []).map((r: any) => ({
        id: r.id,
        return_number: r.return_number || `#${r.id}`,
        order_number: r.order_number || '',
        status: r.status || '',
        total_refund: Number(r.total_refund || 0),
        items_count: Number(r.items_count || 0),
        phone: r.phone || null,
        client_name:
          [r.user_last_name, r.user_first_name].filter(Boolean).join(' ') ||
          r.user_name ||
          '—',
      }))
    },
    enabled: query.trim().length > 0,
  })

  const loading = isFetching || search.trim() !== query.trim() || loadingReturn

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const item = listRef.current.querySelector(
      `[data-index="${highlighted}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  const selectReturn = async (ret: ReturnOption) => {
    setLoadingReturn(true)
    try {
      const { data } = await api.get(`/admin/returns/${ret.id}`)
      updatePayload({
        return_id: data.id,
        return_number: data.return_number || `#${data.id}`,
        return_order_id: data.order_id,
        return_order_number: data.order_number || '',
        return_status: data.status || '',
        return_total_refund: data.total_refund || 0,
        return_items_count: data.items?.length || 0,
        client_phone: data.phone || '',
        client_last_name: data.last_name || '',
        client_first_name: data.first_name || '',
        client_middle_name: data.middle_name || '',
        client_email: data.user_email || '',
        client_name:
          [data.last_name, data.first_name].filter(Boolean).join(' ') ||
          data.user_name ||
          '',
      })
      setSearch('')
      setOpen(false)
    } catch {
      toast.error(t('requests_return_load_error'))
    } finally {
      setLoadingReturn(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((prev) => (prev < returns.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((prev) => (prev > 0 ? prev - 1 : returns.length - 1))
    } else if (e.key === 'Enter') {
      const ret = returns[highlighted]
      if (ret && !loading) {
        e.preventDefault()
        selectReturn(ret)
      }
    }
  }

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (search.trim()) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('requests_return_search')}
              className="pl-9 pr-9"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
            />
            {open && loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {returns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  t('no_results')
                )}
              </p>
            ) : (
              returns.map((r, index) => (
                <div
                  key={r.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    index === highlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectReturn(r)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold truncate">
                        {r.return_number}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t('return_of_order')}: {r.order_number}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.client_name || '—'}
                      </p>
                      {r.phone && (
                        <p className="text-[10px] text-muted-foreground/60 font-mono">
                          {formatPhone(r.phone)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold whitespace-nowrap">
                        {formatMoney(r.total_refund)} ₴
                      </p>
                      <AnimatedBadge swapKey={r.status}>
                        <Badge
                          className={`${returnStatusBadgeClass(r.status)} border-0 text-xs whitespace-nowrap`}
                        >
                          {r.status ? t(`return_${r.status}`) : '—'}
                        </Badge>
                      </AnimatedBadge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {payload.return_id && (
        <div className="mt-3 flex items-center justify-between py-3 px-3 gap-2 rounded-lg border bg-muted/20">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-mono font-semibold truncate">
              {payload.return_number || `#${payload.return_id}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {t('return_of_order')}: {payload.return_order_number || '—'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {payload.client_name || '—'}
            </p>
            {payload.client_phone && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {formatPhone(payload.client_phone)}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold whitespace-nowrap">
              {formatMoney(payload.return_total_refund)} ₴
            </p>
            <AnimatedBadge swapKey={payload.return_status}>
              <Badge
                className={`${returnStatusBadgeClass(payload.return_status)} border-0 text-sm whitespace-nowrap`}
              >
                {payload.return_status
                  ? t(`return_${payload.return_status}`)
                  : '—'}
              </Badge>
            </AnimatedBadge>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Поиск обращения для заявки «Тех. поддержка».
 * Ищем по имени, телефону и email — как на странице поддержки.
 */
function SupportPicker({
  payload,
  updatePayload,
}: {
  payload: Record<string, any>
  updatePayload: (patch: Record<string, any>) => void
}) {
  const t = useTranslations('admin')
  const listId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const { data: chats = [], isFetching } = useQuery<SupportChatOption[]>({
    queryKey: ['requests', 'support-search', query],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/support/chats?period=all&search=${encodeURIComponent(query)}`,
      )
      return (Array.isArray(data) ? data : []).map((c: any) => ({
        id: c.id,
        ticket_number: c.ticket_number || `#${c.id}`,
        user_name: c.user_name || '',
        user_phone: c.user_phone || null,
        user_email: c.user_email || null,
        status: c.status || 'new',
        last_message: c.last_message || null,
        last_message_at: c.last_message_at || null,
        created_at: c.created_at || '',
      }))
    },
    enabled: query.trim().length > 0,
  })

  const loading = isFetching || search.trim() !== query.trim()

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const item = listRef.current.querySelector(
      `[data-index="${highlighted}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  const selectChat = (chat: SupportChatOption) => {
    updatePayload({
      chat_id: chat.id,
      ticket_number: chat.ticket_number || `#${chat.id}`,
      chat_status: chat.status,
      chat_last_message: chat.last_message || '',
      chat_last_message_at: chat.last_message_at || chat.created_at || '',
      client_name: chat.user_name || '',
      client_phone: chat.user_phone || '',
      client_email: chat.user_email || '',
    })
    setSearch('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((prev) => (prev < chats.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((prev) => (prev > 0 ? prev - 1 : chats.length - 1))
    } else if (e.key === 'Enter') {
      const chat = chats[highlighted]
      if (chat && !loading) {
        e.preventDefault()
        selectChat(chat)
      }
    }
  }

  const selectedChat: SupportChatOption | null = payload.chat_id
    ? {
        id: payload.chat_id,
        ticket_number: payload.ticket_number || `#${payload.chat_id}`,
        user_name: payload.client_name || '',
        user_phone: payload.client_phone || null,
        user_email: payload.client_email || null,
        status: payload.chat_status || 'new',
        last_message: payload.chat_last_message || null,
        last_message_at: payload.chat_last_message_at || null,
        created_at: payload.chat_last_message_at || '',
      }
    : null

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (search.trim()) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('requests_support_search')}
              className="pl-9 pr-9"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
            />
            {open && loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  t('no_results')
                )}
              </p>
            ) : (
              chats.map((chat, index) => (
                <div
                  key={chat.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted}
                  className={`px-3 py-2.5 cursor-pointer transition-colors ${
                    index === highlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectChat(chat)}
                >
                  <SupportChatTile chat={chat} />
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedChat && (
        <div className="mt-3 flex items-start py-3 px-3 rounded-lg border bg-muted/20">
          <SupportChatTile chat={selectedChat} />
        </div>
      )}
    </div>
  )
}

/**
 * Редактируемые поля заявки. Раскладка зависит от кода категории:
 * B2B-анкета, правка часов, бан/разбан, изменение заказа или описание.
 */
export default function RequestFormFields({
  code,
  values,
  onChange,
  staff,
  inline = false,
  readOnly = false,
}: {
  code: string | null | undefined
  values: RequestFormValues
  onChange: (patch: Partial<RequestFormValues>) => void
  staff: AssigneeOption[]
  /** Встроенный режим: без внутренних блоков и заголовков секций */
  inline?: boolean
  /** Режим просмотра: поля только для чтения */
  readOnly?: boolean
}) {
  const t = useTranslations('admin')
  const tb = useTranslations('b2b')
  const locale = useLocale()
  const dateLocale = DATE_FNS_LOCALE[locale] || ru
  const [dateOpen, setDateOpen] = useState(false)
  const payload = useMemo(() => values.payload || {}, [values.payload])
  const selectedDate = payload.work_date
    ? new Date(`${payload.work_date}T00:00:00`)
    : undefined
  const validSelectedDate =
    selectedDate && !Number.isNaN(selectedDate.getTime())
      ? selectedDate
      : undefined

  const updatePayload = React.useCallback(
    (patch: Record<string, any>) =>
      onChange({ payload: { ...payload, ...patch } }),
    [onChange, payload],
  )

  // Адресный поиск Новой Почты для заявки «Изменение заказа»
  const np = useNovaPoshtaAddressSearch({
    prefix: 'request-order',
    cityRef: payload.delivery_city_ref || null,
    settlementRef: payload.delivery_settlement_ref || null,
    locale,
  })
  const {
    setCityQuery: setNpCityQuery,
    setWarehouseQuery: setNpWarehouseQuery,
    setStreetQuery: setNpStreetQuery,
  } = np

  // При открытии существующей заявки подставляем подписи адреса в поля поиска
  useEffect(() => {
    if (!payload.order_id) return
    setNpCityQuery(payload.delivery_city || '')
    setNpWarehouseQuery(payload.delivery_warehouse || '')
    setNpStreetQuery(payload.delivery_street_label || '')
  }, [
    payload.order_id,
    payload.delivery_city,
    payload.delivery_warehouse,
    payload.delivery_street_label,
    setNpCityQuery,
    setNpWarehouseQuery,
    setNpStreetQuery,
  ])

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

  const isOrderDelete = code === 'order_delete'
  const isReturnChange = code === 'return_change'
  const isSupportEdit = code === 'support_edit'
  const isPricingChange = code === 'pricing_change'
  const isOther = code === 'other'

  const { data: pricingGeneral, isLoading: pricingGeneralLoading } = useQuery<{
    margin_percent: number
  }>({
    queryKey: ['requests', 'pricing-general'],
    queryFn: async () => {
      const { data } = await api.get('/admin/pricing/general')
      return data
    },
    enabled: isPricingChange,
  })

  const { data: pricingCategoriesData, isLoading: pricingCategoriesLoading } =
    useQuery<{ items: PricingCategoryOption[] }>({
      queryKey: ['requests', 'pricing-categories'],
      queryFn: async () => {
        const { data } = await api.get('/admin/pricing/categories', {
          params: { page: 1, page_size: 1000 },
        })
        return data
      },
      enabled: isPricingChange,
    })

  const pricingCategories = useMemo(
    () => pricingCategoriesData?.items ?? [],
    [pricingCategoriesData],
  )

  const pricingCategoryOptions = useMemo(() => {
    const options = [...pricingCategories]
    const currentId = Number(payload.pricing_category_id || 0)
    if (currentId && !options.some((c) => c.category_id === currentId)) {
      options.unshift({
        category_id: currentId,
        category_name: payload.pricing_target_name || `#${currentId}`,
        margin_percent: payload.pricing_old_margin ?? null,
      })
    }
    return options
  }, [
    pricingCategories,
    payload.pricing_category_id,
    payload.pricing_target_name,
    payload.pricing_old_margin,
  ])

  const pricingGeneralMargin = Number(pricingGeneral?.margin_percent ?? 0)
  const pricingSelectValue =
    payload.pricing_target === 'category' && payload.pricing_category_id
      ? String(payload.pricing_category_id)
      : 'general'

  useEffect(() => {
    if (!isPricingChange || payload.pricing_target) return
    if (pricingGeneralLoading || pricingCategoriesLoading) return
    updatePayload({
      pricing_target: 'general',
      pricing_category_id: null,
      pricing_target_name: t('pricing_general'),
      pricing_old_margin: pricingGeneralMargin,
      margin_percent: pricingGeneralMargin,
    })
  }, [
    isPricingChange,
    payload.pricing_target,
    pricingGeneralLoading,
    pricingCategoriesLoading,
    pricingGeneralMargin,
    t,
    updatePayload,
  ])

  const handlePricingTargetChange = (value: string) => {
    if (value === 'general') {
      updatePayload({
        pricing_target: 'general',
        pricing_category_id: null,
        pricing_target_name: t('pricing_general'),
        pricing_old_margin: pricingGeneralMargin,
        margin_percent: pricingGeneralMargin,
      })
      return
    }
    const category = pricingCategoryOptions.find(
      (c) => String(c.category_id) === value,
    )
    if (!category) return
    const current = Number(category.margin_percent ?? 0)
    updatePayload({
      pricing_target: 'category',
      pricing_category_id: category.category_id,
      pricing_target_name: category.category_name,
      pricing_old_margin: current,
      margin_percent: current,
    })
  }

  const pricingChangeFields = isPricingChange ? (
    <div className="space-y-2">
      <Label required compact={inline}>
        {t('pricing_margin')}
      </Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Select
          value={pricingSelectValue}
          onValueChange={handlePricingTargetChange}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('pricing_select_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">{t('pricing_general')}</SelectItem>
            {pricingCategoryOptions.map((category) => (
              <SelectItem
                key={category.category_id}
                value={String(category.category_id)}
              >
                {category.category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MarginStepper
          value={payload.margin_percent ?? null}
          onChange={(margin_percent) => updatePayload({ margin_percent })}
        />
      </div>
    </div>
  ) : null

  const descriptionField =
    code !== 'b2b_registration' &&
    code !== 'ban_unban' &&
    code !== 'timesheet_manual' ? (
      <div>
        <Label
          compact={inline}
          required={
            isOrderDelete ||
            isReturnChange ||
            isSupportEdit ||
            isPricingChange ||
            isOther
          }
        >
          {isOrderDelete || isPricingChange
            ? t('requests_fields_reason')
            : t('requests_desc_label')}
        </Label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder={
            isOrderDelete
              ? t('requests_order_delete_reason_placeholder')
              : isPricingChange
                ? t('requests_pricing_reason_placeholder')
                : t('requests_desc_label')
          }
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
    ) : null

  const banActionLabel =
    payload.action === 'unban'
      ? t('requests_ban_action_unban')
      : payload.action === 'whitelist'
        ? t('requests_ban_action_whitelist')
        : t('requests_ban_action_ban')

  const banActionField = (
    <div>
      <Label required={!readOnly} compact={inline}>
        {t('requests_fields_action')}
      </Label>
      {readOnly ? (
        <ReadonlyField value={banActionLabel} />
      ) : (
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
            <SelectItem value="whitelist">
              {t('requests_ban_action_whitelist')}
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )

  const banClientField = (
    <div>
      {!readOnly && (
        <Label required compact={inline}>
          {t('requests_fields_client')}
        </Label>
      )}
      <ClientPicker
        payload={payload}
        updatePayload={updatePayload}
        readOnly={readOnly}
      />
    </div>
  )

  const banReasonField = (
    <div>
      <Label compact={inline}>{t('requests_fields_reason')}</Label>
      {readOnly ? (
        <div className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm min-h-[72px] whitespace-pre-wrap">
          {payload.reason || '—'}
        </div>
      ) : (
        <textarea
          value={payload.reason || ''}
          onChange={(e) => updatePayload({ reason: e.target.value })}
          rows={3}
          placeholder={t('requests_ban_reason_placeholder')}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      )}
    </div>
  )

  const orderChangeFields =
    code === 'order_final_status' || code === 'order_delete' ? (
      <div className="space-y-3">
        <div>
          <Label required compact={inline}>
            {t('requests_fields_order')}
          </Label>
          <OrderPicker
            payload={payload}
            updatePayload={updatePayload}
            onOrderLoaded={(detail) => {
              np.setCityQuery(detail.delivery_city || '')
              np.setWarehouseQuery(detail.delivery_warehouse || '')
              np.setStreetQuery(detail.delivery_street_label || '')
            }}
          />
        </div>

        {payload.order_id &&
          (code === 'order_delete' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ReadonlyField
                  label={t('requests_fields_phone')}
                  value={payload.phone ? formatPhone(payload.phone) : null}
                />
                <ReadonlyField
                  label={tb('contact_last_name')}
                  value={payload.last_name || null}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ReadonlyField
                  label={tb('contact_first_name')}
                  value={payload.first_name || null}
                />
                <ReadonlyField
                  label={tb('contact_middle_name')}
                  value={payload.middle_name || null}
                />
              </div>
              {payload.delivery_type && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="w-4 h-4" /> {t('delivery_info')}
                  </div>
                  <RadioGroup
                    value={payload.delivery_type}
                    className="grid grid-cols-3 gap-2"
                    disabled
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-default opacity-50">
                          <RadioGroupItem
                            value="pickup"
                            id="req-del-pickup"
                            className="cursor-default"
                            disabled
                          />
                          <UiLabel
                            htmlFor="req-del-pickup"
                            className="cursor-default"
                          >
                            <Package className="w-5 h-5" />
                          </UiLabel>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{t('pickup')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-default">
                          <RadioGroupItem
                            value="warehouse"
                            id="req-del-warehouse"
                            className="cursor-default"
                            disabled
                          />
                          <UiLabel
                            htmlFor="req-del-warehouse"
                            className="cursor-default"
                          >
                            <Building2 className="w-5 h-5" />
                          </UiLabel>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{t('warehouse')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-default">
                          <RadioGroupItem
                            value="courier"
                            id="req-del-courier"
                            className="cursor-default"
                            disabled
                          />
                          <UiLabel
                            htmlFor="req-del-courier"
                            className="cursor-default"
                          >
                            <Truck className="w-5 h-5" />
                          </UiLabel>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{t('courier')}</TooltipContent>
                    </Tooltip>
                  </RadioGroup>
                  <ReadonlyField
                    label={t('city')}
                    value={payload.delivery_city || null}
                  />
                  {payload.delivery_type === 'warehouse' && (
                    <ReadonlyField
                      label={t('warehouse')}
                      value={payload.delivery_warehouse || null}
                    />
                  )}
                  {payload.delivery_type === 'courier' && (
                    <>
                      <ReadonlyField
                        label={t('street')}
                        value={payload.delivery_street_label || null}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <ReadonlyField
                          label={t('house')}
                          value={payload.delivery_house || null}
                        />
                        <ReadonlyField
                          label={t('apartment')}
                          value={payload.delivery_apartment || null}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label compact={inline}>{t('requests_fields_phone')}</Label>
                  <PhoneInput
                    value={payload.phone || ''}
                    onChange={(value) => updatePayload({ phone: value })}
                  />
                </div>
                <div>
                  <Label compact={inline}>{tb('contact_last_name')}</Label>
                  <Input
                    value={payload.last_name || ''}
                    onChange={(e) =>
                      updatePayload({ last_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label compact={inline}>{tb('contact_first_name')}</Label>
                  <Input
                    value={payload.first_name || ''}
                    onChange={(e) =>
                      updatePayload({ first_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label compact={inline}>{tb('contact_middle_name')}</Label>
                  <Input
                    value={payload.middle_name || ''}
                    onChange={(e) =>
                      updatePayload({ middle_name: e.target.value })
                    }
                  />
                </div>
              </div>

              <Separator />
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4" />
                {t('delivery_info')}
              </div>

              <RadioGroup
                value={payload.delivery_type || ''}
                onValueChange={(value) =>
                  updatePayload({
                    delivery_type: value,
                    delivery_warehouse: '',
                    delivery_warehouse_ref: '',
                    delivery_warehouse_label: '',
                    delivery_street_ref: '',
                    delivery_street_label: '',
                    delivery_house: '',
                    delivery_apartment: '',
                  })
                }
                className="grid grid-cols-3 gap-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer opacity-50">
                      <RadioGroupItem
                        value="pickup"
                        id="req-order-pickup"
                        className="cursor-pointer"
                        disabled
                      />
                      <UiLabel
                        htmlFor="req-order-pickup"
                        className="cursor-pointer"
                      >
                        <Package className="w-5 h-5" />
                      </UiLabel>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t('pickup')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                      <RadioGroupItem
                        value="warehouse"
                        id="req-order-warehouse"
                        className="cursor-pointer"
                      />
                      <UiLabel
                        htmlFor="req-order-warehouse"
                        className="cursor-pointer"
                      >
                        <Building2 className="w-5 h-5" />
                      </UiLabel>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t('warehouse')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center gap-2 rounded-lg border p-3 has-data-[state=checked]:border-primary cursor-pointer">
                      <RadioGroupItem
                        value="courier"
                        id="req-order-courier"
                        className="cursor-pointer"
                      />
                      <UiLabel
                        htmlFor="req-order-courier"
                        className="cursor-pointer"
                      >
                        <Truck className="w-5 h-5" />
                      </UiLabel>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t('courier')}</TooltipContent>
                </Tooltip>
              </RadioGroup>

              {payload.delivery_type && (
                <div>
                  <Label compact={inline}>{t('city')}</Label>
                  <SearchableSelect<any>
                    items={np.settlements}
                    isLoading={np.citiesLoading}
                    value={payload.delivery_city || ''}
                    onChange={(item: any) =>
                      updatePayload({
                        delivery_city: item.label,
                        delivery_city_ref: item.delivery_city_ref || item.ref,
                        delivery_settlement_ref: item.settlement_ref || '',
                        delivery_city_label: item.label,
                        delivery_warehouse: '',
                        delivery_warehouse_ref: '',
                        delivery_warehouse_label: '',
                        delivery_street_ref: '',
                        delivery_street_label: '',
                        delivery_house: '',
                        delivery_apartment: '',
                      })
                    }
                    searchQuery={np.cityQuery}
                    onSearchChange={np.setCityQuery}
                    getKey={(item: any) => item.ref}
                    getLabel={(item: any) => item.label}
                    renderItem={(item: any) => <SettlementItem item={item} />}
                    dropdownInPopover
                    placeholder={t('city')}
                    minSearchLength={2}
                    noResultsMessage={t('novaposhta_no_results')}
                    typeToSearchMessage={t('novaposhta_type_to_search')}
                    hideSearchIcon
                  />
                </div>
              )}

              {payload.delivery_type === 'warehouse' && (
                <div>
                  <Label compact={inline}>{t('warehouse')}</Label>
                  <SearchableSelect<any>
                    items={np.warehouses}
                    isLoading={np.warehousesLoading}
                    value={payload.delivery_warehouse || ''}
                    onChange={(item: any) =>
                      updatePayload({
                        delivery_warehouse: item.label,
                        delivery_warehouse_ref: item.ref,
                        delivery_warehouse_label: item.label,
                      })
                    }
                    searchQuery={np.warehouseQuery}
                    onSearchChange={np.setWarehouseQuery}
                    getKey={(item: any) => item.ref}
                    getLabel={(item: any) => item.label}
                    renderItem={(item: any) => (
                      <WarehouseDropdownItem
                        item={item}
                        postomatLabel={t('novaposhta_postomat')}
                      />
                    )}
                    placeholder={t('warehouse')}
                    minSearchLength={1}
                    noResultsMessage={t('novaposhta_no_results')}
                    typeToSearchMessage={t('novaposhta_type_to_search')}
                    dropdownInPopover
                    hideSearchIcon
                  />
                </div>
              )}

              {payload.delivery_type === 'courier' && (
                <>
                  <div>
                    <Label compact={inline}>{t('street')}</Label>
                    <SearchableSelect<any>
                      items={np.streets}
                      isLoading={np.streetsLoading}
                      value={payload.delivery_street_label || ''}
                      onChange={(item: any) =>
                        updatePayload({
                          delivery_street_ref: item.street_ref,
                          delivery_street_label: item.label,
                        })
                      }
                      searchQuery={np.streetQuery}
                      onSearchChange={np.setStreetQuery}
                      getKey={(item: any) => item.street_ref}
                      getLabel={(item: any) => item.label}
                      renderItem={(item: any) => (
                        <div className="font-medium leading-tight">
                          {item.street_type &&
                          item.label &&
                          !item.label.startsWith(item.street_type)
                            ? `${item.street_type}. ${item.label}`
                            : item.label}
                        </div>
                      )}
                      placeholder={t('street')}
                      minSearchLength={2}
                      noResultsMessage={t('novaposhta_no_results')}
                      typeToSearchMessage={t('novaposhta_type_to_search')}
                      dropdownInPopover
                      hideSearchIcon
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label compact={inline}>{t('house')}</Label>
                      <Input
                        value={payload.delivery_house || ''}
                        maxLength={20}
                        onChange={(e) =>
                          updatePayload({ delivery_house: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label compact={inline}>{t('apartment')}</Label>
                      <Input
                        value={payload.delivery_apartment || ''}
                        maxLength={20}
                        onChange={(e) =>
                          updatePayload({ delivery_apartment: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          ))}
      </div>
    ) : null

  const supportEditFields =
    code === 'support_edit' ? (
      <div>
        <Label required compact={inline}>
          {t('requests_fields_chat')}
        </Label>
        <SupportPicker payload={payload} updatePayload={updatePayload} />
      </div>
    ) : null

  const returnChangeFields =
    code === 'return_change' ? (
      <div className="space-y-3">
        <div>
          <Label required compact={inline}>
            {t('requests_fields_return')}
          </Label>
          <ReturnPicker payload={payload} updatePayload={updatePayload} />
        </div>
        {payload.return_id && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ReadonlyField
                label={t('requests_fields_phone')}
                value={
                  payload.client_phone
                    ? formatPhone(payload.client_phone)
                    : null
                }
              />
              <ReadonlyField
                label={tb('contact_last_name')}
                value={payload.client_last_name || null}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ReadonlyField
                label={tb('contact_first_name')}
                value={payload.client_first_name || null}
              />
              <ReadonlyField
                label={tb('contact_middle_name')}
                value={payload.client_middle_name || null}
              />
            </div>
            <ReadonlyField
              label={t('requests_fields_email')}
              value={payload.client_email || null}
            />
          </div>
        )}
      </div>
    ) : null

  return (
    <div className="space-y-3">
      {inline &&
        code !== 'order_final_status' &&
        code !== 'order_delete' &&
        code !== 'return_change' &&
        code !== 'support_edit' &&
        code !== 'pricing_change' &&
        descriptionField}
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
              <div className="flex items-center gap-1.5 mb-1">
                <Label required compact noMargin>
                  {t('requests_fields_date')}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>{t('requests_date_hint')}</TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-1.5 mb-1">
                <Label required compact noMargin>
                  {t('requests_fields_hours')}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>{t('requests_hours_hint')}</TooltipContent>
                </Tooltip>
              </div>
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
        </div>
      )}

      {code === 'ban_unban' &&
        (inline ? (
          <div className="space-y-3">
            {banClientField}
            {banActionField}
            {banReasonField}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            {banClientField}
            {banActionField}
            {banReasonField}
          </div>
        ))}

      {orderChangeFields}

      {returnChangeFields}

      {supportEditFields}

      {pricingChangeFields}

      {(!inline ||
        code === 'order_final_status' ||
        code === 'order_delete' ||
        code === 'return_change' ||
        code === 'support_edit' ||
        code === 'pricing_change') &&
        descriptionField}
    </div>
  )
}

'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowLeft,
  Building2,
  Check,
  FilePlus,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldBan,
  Timer,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import { can } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useRequirePerm } from '@/hooks/useRequirePerm'
import api from '@/lib/api'
import { formatMinutes, parseHoursToMinutes } from '@/lib/timesheetTime'
import { formatPhone } from '@/lib/phone'
import { ORDER_STATUS_LABELS, RETURN_STATUS_LABELS } from '@/lib/constants'
import { DeadlineCell, RequestsStatusCell } from './RequestsStatusBadge'
import {
  actorLabel,
  AUTOMATED_CATEGORY_CODES,
  type RequestCategory,
} from './shared'
import { categoryName } from '@/lib/requestCategories'
import { useRequestDate } from './useRequestDate'
import RequestFormFields, {
  SupportChatTile,
  requestFormError,
  type RequestFormValues,
  type SupportChatOption,
} from './RequestFormFields'

/** Цвета бейджей ролей — как в модалке заказа */
const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
  system: 'bg-black text-white dark:bg-white dark:text-black',
}

/** Иконки событий для истории */
const EVENT_ICON: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  created: FilePlus,
  taken: UserCheck,
  assigned: UserCheck,
  status: RefreshCw,
  status_changed: RefreshCw,
  updated: Pencil,
  comment: MessageSquare,
  approved: Check,
  rejected: X,
  deleted: Trash2,
  overdue: Timer,
  closed: Archive,
}

const EVENT_KEY: Record<string, string> = {
  created: 'requests_ev_created',
  taken: 'requests_ev_taken',
  assigned: 'requests_ev_assigned',
  status: 'requests_ev_status',
  status_changed: 'requests_ev_status',
  updated: 'requests_ev_updated',
  comment: 'requests_ev_comment',
  approved: 'requests_ev_approved',
  rejected: 'requests_ev_rejected',
  deleted: 'requests_ev_deleted',
  overdue: 'requests_ev_overdue',
  closed: 'requests_ev_closed',
}

interface RequestComment {
  id: number
  author_name: string | null
  author_group: string | null
  text: string
  created_at: string | null
}

interface RequestEvent {
  id: number
  event_type: string
  details: string | null
  author_name: string | null
  author_group: string | null
  created_at: string | null
}

interface RequestDetail {
  id: number
  number: string
  category: RequestCategory
  status: string
  description: string | null
  payload: Record<string, any> | null
  created_at: string | null
  updated_at: string | null
  created_by: any
  assignee: any
  resolved_by: any
  response_due_at: string | null
  due_at: string | null
  resolved_at: string | null
  deadline: string | null
  deadline_state: string
  minutes_left: number | null
  minutes_late: number | null
  comments: RequestComment[]
  events: RequestEvent[]
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['requests'] })
  qc.invalidateQueries({ queryKey: ['requests-alerts'] })
  qc.invalidateQueries({ queryKey: ['admin-notifications'] })
}

/** Карточка данных заявки (payload) — своя раскладка для известных категорий */
function PayloadCard({
  code,
  payload,
}: {
  code: string
  payload: Record<string, any> | null
}) {
  const t = useTranslations('admin')
  const tb = useTranslations('b2b')
  if (!payload || Object.keys(payload).length === 0) return null

  // B2B-заявка: компания; ЕДРПОУ + город; телефон + фамилия;
  // имя + отчество; email на всю ширину
  if (code === 'b2b_registration') {
    // Старые заявки: контакт одной строкой «Фамилия Имя Отчество»
    const legacy = (payload.contact_name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    const lastName = payload.contact_last_name || legacy[0]
    const firstName = payload.contact_first_name || legacy[1]
    const middleName =
      payload.contact_middle_name || (legacy.length > 2 ? legacy[2] : null)
    const emailField = payload.email ? (
      <a
        href={`mailto:${payload.email}`}
        className="text-primary underline-offset-2 hover:underline"
      >
        {payload.email}
      </a>
    ) : null
    return (
      <div className="space-y-3">
        <Field label={tb('company')} value={payload.company} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={tb('edrpou')} value={payload.edrpou} />
          <Field label={tb('city')} value={payload.city} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={tb('phone')}
            value={payload.phone ? formatPhone(payload.phone) : null}
          />
          <Field label={tb('contact_last_name')} value={lastName} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tb('contact_first_name')} value={firstName} />
          <Field label={tb('contact_middle_name')} value={middleName} />
        </div>
        <Field label={tb('email')} value={emailField} />
      </div>
    )
  }

  const rows: { label: string; value: React.ReactNode }[] = []

  if (code === 'ban_unban') {
    rows.push({
      label: t('requests_fields_action'),
      value:
        payload.action === 'unban'
          ? t('requests_ban_action_unban')
          : payload.action === 'whitelist'
            ? t('requests_ban_action_whitelist')
            : t('requests_ban_action_ban'),
    })
    if (payload.client_name || payload.email)
      rows.push({
        label: t('requests_fields_client'),
        value: `${payload.client_name || ''}${
          payload.email ? ` (${payload.email})` : ''
        }`.trim(),
      })
    if (payload.reason)
      rows.push({ label: t('requests_fields_reason'), value: payload.reason })
  } else if (code === 'timesheet_manual') {
    if (payload.user_name || payload.email)
      rows.push({
        label: t('requests_fields_user'),
        value: payload.user_name || payload.email,
      })
    if (payload.work_date)
      rows.push({ label: t('requests_fields_date'), value: payload.work_date })
    if (payload.minutes != null)
      rows.push({
        label: t('requests_fields_hours'),
        value: formatMinutes(Number(payload.minutes)),
      })
  } else if (code === 'order_final_status' || code === 'order_delete') {
    const statusInfo = ORDER_STATUS_LABELS[payload.order_status]
    const deliveryType = payload.delivery_type
    return (
      <div className="space-y-3">
        {payload.order_id && (
          <div className="flex items-center justify-between py-3 px-3 gap-2 rounded-lg border bg-muted/20">
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
                {new Intl.NumberFormat('uk-UA', {
                  maximumFractionDigits: 0,
                }).format(Number(payload.order_total || 0))}{' '}
                ₴
              </p>
              <AnimatedBadge swapKey={payload.order_status}>
                <Badge
                  className={`${statusInfo?.className || 'bg-gray-500 text-white'} border-0 text-sm whitespace-nowrap`}
                >
                  {payload.order_status
                    ? t(`order_${payload.order_status}`)
                    : '—'}
                </Badge>
              </AnimatedBadge>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('requests_fields_phone')}
            value={payload.phone ? formatPhone(payload.phone) : null}
          />
          <Field
            label={tb('contact_last_name')}
            value={payload.last_name || null}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={tb('contact_first_name')}
            value={payload.first_name || null}
          />
          <Field
            label={tb('contact_middle_name')}
            value={payload.middle_name || null}
          />
        </div>
        {deliveryType && (
          <>
            <Field label={t('delivery_info')} value={t(deliveryType as any)} />
            <Field label={t('city')} value={payload.delivery_city || null} />
            {deliveryType === 'warehouse' && (
              <Field
                label={t('warehouse')}
                value={payload.delivery_warehouse || null}
              />
            )}
            {deliveryType === 'courier' && (
              <>
                <Field
                  label={t('street')}
                  value={payload.delivery_street_label || null}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={t('house')}
                    value={payload.delivery_house || null}
                  />
                  <Field
                    label={t('apartment')}
                    value={payload.delivery_apartment || null}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    )
  } else if (code === 'support_edit') {
    const chat: SupportChatOption | null = payload.chat_id
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
    if (!chat) return null
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-3">
        <SupportChatTile chat={chat} />
      </div>
    )
  } else if (code === 'pricing_change') {
    const targetName =
      payload.pricing_target === 'category'
        ? payload.pricing_target_name ||
          (payload.pricing_category_id
            ? `#${payload.pricing_category_id}`
            : '—')
        : t('pricing_general')
    const oldMargin = payload.pricing_old_margin
    const newMargin = payload.margin_percent
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-3 space-y-1">
        <p className="text-sm font-semibold truncate">{targetName}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('pricing_margin')}:</span>
          <span className="font-mono">
            {oldMargin != null ? `${oldMargin}%` : '—'}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono font-semibold text-primary">
            {newMargin != null ? `${newMargin}%` : '—'}
          </span>
        </div>
      </div>
    )
  } else if (code === 'return_change') {
    const statusInfo = RETURN_STATUS_LABELS[payload.return_status]
    return (
      <div className="space-y-3">
        {payload.return_id && (
          <div className="flex items-center justify-between py-3 px-3 gap-2 rounded-lg border bg-muted/20">
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
                {new Intl.NumberFormat('uk-UA', {
                  maximumFractionDigits: 0,
                }).format(Number(payload.return_total_refund || 0))}{' '}
                ₴
              </p>
              <AnimatedBadge swapKey={payload.return_status}>
                <Badge
                  className={`${statusInfo?.className || 'bg-gray-500 text-white'} border-0 text-sm whitespace-nowrap`}
                >
                  {payload.return_status
                    ? t(`return_${payload.return_status}`)
                    : '—'}
                </Badge>
              </AnimatedBadge>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('requests_fields_phone')}
            value={
              payload.client_phone ? formatPhone(payload.client_phone) : null
            }
          />
          <Field
            label={tb('contact_last_name')}
            value={payload.client_last_name || null}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={tb('contact_first_name')}
            value={payload.client_first_name || null}
          />
          <Field
            label={tb('contact_middle_name')}
            value={payload.client_middle_name || null}
          />
        </div>
        <Field
          label={t('requests_fields_email')}
          value={payload.client_email || null}
        />
      </div>
    )
  } else {
    for (const [key, value] of Object.entries(payload)) {
      rows.push({
        label: key,
        value:
          value == null
            ? '—'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      })
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Первое поле — на всю ширину, остальные — по два в ряд, как в B2B-модалке */}
      <Field label={rows[0].label} value={rows[0].value} />
      {rows.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          {rows.slice(1).map((row, i) => (
            <Field key={i} label={row.label} value={row.value} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Поле с подписью — как в модалке пользователя (режим B2B) */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-muted-foreground text-sm truncate">{label}</p>
      <ReadonlyField value={value} />
    </div>
  )
}

/** Поле только для чтения — как в модалке пользователя (режим B2B) */
function ReadonlyField({ value }: { value: React.ReactNode }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
      <span className={empty ? 'truncate text-muted-foreground' : 'truncate'}>
        {empty ? '—' : value}
      </span>
    </div>
  )
}

export default function RequestDetailModal({
  requestId,
  categories,
  onClose,
  onCreated,
}: {
  requestId: number | null
  categories: RequestCategory[]
  onClose: () => void
  onCreated?: (id: number) => void
}) {
  const t = useTranslations('admin')
  const tb = useTranslations('b2b')
  const locale = useLocale()
  const { user } = useAuthStore()
  const reqPerm = useRequirePerm()
  const qc = useQueryClient()
  const fmtDate = useRequestDate()

  const [comment, setComment] = useState('')
  const [decision, setDecision] = useState<null | 'approve' | 'reject'>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [createCategoryId, setCreateCategoryId] = useState('')
  const [createAssigneeId, setCreateAssigneeId] = useState('none')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<RequestFormValues>({
    description: '',
    payload: {},
  })

  const activeId = requestId ?? createdId
  const isCreate = activeId == null

  const creatable = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.is_active &&
          (!c.allowed_roles ||
            c.allowed_roles.length === 0 ||
            (user?.role && c.allowed_roles.includes(user.role))),
      ),
    [categories, user?.role],
  )
  const createCategory =
    creatable.find((c) => String(c.id) === createCategoryId) || null

  useEffect(() => {
    if (!isCreate || createCategoryId || creatable.length === 0) return
    setCreateCategoryId(String(creatable[0].id))
  }, [isCreate, createCategoryId, creatable])

  const { data: detail, isLoading } = useQuery<RequestDetail>({
    queryKey: ['requests', 'detail', activeId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/requests/${activeId}`)
      return data
    },
    enabled: activeId != null,
  })

  const formCode = isCreate ? createCategory?.code : detail?.category?.code

  // Роль выбранного клиента — бейдж рядом с заголовком левой колонки
  const selectedClientRole =
    formCode === 'ban_unban'
      ? (isCreate || isEditing ? form.payload?.role : detail?.payload?.role) ||
        null
      : null

  const descriptionBlock =
    detail?.description && detail.category?.code !== 'ban_unban' ? (
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          {detail.category?.code === 'order_delete' ||
          detail.category?.code === 'pricing_change'
            ? t('requests_fields_reason')
            : t('requests_desc_label')}
        </p>
        <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
          {detail.description}
        </p>
      </div>
    ) : null

  const isAdmin = user?.role === 'admin'
  const canEditRequest = can(user, 'requests.edit')
  const canEditDetail =
    !!detail &&
    canEditRequest &&
    (isAdmin
      ? ['new', 'in_progress'].includes(detail.status)
      : detail.status === 'new' && !detail.assignee)

  const { data: assignees = [] } = useQuery<
    { id: number; name: string; email: string; role: string | null }[]
  >({
    queryKey: ['requests', 'assignees'],
    queryFn: async () => {
      const { data } = await api.get('/admin/requests/assignees')
      return data || []
    },
  })

  const actionMutation = useMutation({
    mutationFn: async ({
      url,
      body,
      okKey,
    }: {
      url: string
      body?: any
      okKey: string
    }) => {
      await api.post(url, body ?? {})
      return okKey
    },
    onSuccess: (okKey) => {
      invalidateAll(qc)
      toast.success(t(okKey))
    },
    onError: (err: any) => {
      const status = err?.response?.status
      const detailMsg = err?.response?.data?.detail
      if (status === 409) {
        toast.warning(
          typeof detailMsg === 'string'
            ? detailMsg
            : t('protection_cannot_ban_admin'),
        )
        return
      }
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const buildFormPayload = () => {
    const payload = { ...(form.payload || {}) }
    if (formCode === 'b2b_registration') {
      payload.locale = payload.locale || locale
      payload.email = String(payload.email || '')
        .trim()
        .toLowerCase()
      payload.company = String(payload.company || '').trim()
      payload.phone = String(payload.phone || '').trim()
      delete payload.comment
    }
    if (formCode === 'timesheet_manual') {
      payload.user_id = Number(payload.user_id)
      const minutes = parseHoursToMinutes(String(payload.minutes ?? ''))
      payload.minutes = minutes === -1 || minutes === null ? 0 : minutes
    }
    if (formCode === 'ban_unban') {
      payload.action = payload.action || 'ban'
      payload.reason = String(payload.reason || '').trim() || null
    }
    if (formCode === 'pricing_change') {
      const target =
        payload.pricing_target === 'category' ? 'category' : 'general'
      payload.pricing_target = target
      payload.pricing_category_id =
        target === 'category' ? Number(payload.pricing_category_id) : null
      payload.margin_percent = Number(payload.margin_percent ?? 0)
      payload.pricing_old_margin =
        payload.pricing_old_margin == null
          ? null
          : Number(payload.pricing_old_margin)
    }
    return payload
  }

  const buildFormDescription = () => {
    // У автоматизированных категорий описание не используется:
    // у защиты причина живёт только в payload.reason.
    if (
      formCode === 'b2b_registration' ||
      formCode === 'timesheet_manual' ||
      formCode === 'ban_unban'
    )
      return null
    return form.description.trim() || null
  }

  const checkForm = () => {
    if (isCreate && !createCategoryId) {
      toast.info(t('requests_form_required'))
      return false
    }
    const error = requestFormError(formCode, form)
    if (!error) return true
    if (error === 'email') toast.error(tb('error_email'))
    else if (error === 'phone') toast.error(tb('error_phone_required'))
    else if (error === 'time') toast.warning(t('requests_time_invalid'))
    else toast.info(t('requests_form_required'))
    return false
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/requests', {
        category_id: Number(createCategoryId),
        description: buildFormDescription(),
        payload: buildFormPayload(),
        assignee_id:
          createAssigneeId === 'none' ? null : Number(createAssigneeId),
      })
      return data as RequestDetail
    },
    onSuccess: (created) => {
      invalidateAll(qc)
      qc.setQueryData(['requests', 'detail', created.id], created)
      toast.success(t('requests_created_ok', { number: created?.number || '' }))
      setCreatedId(created.id)
      setIsEditing(false)
      setShowHistory(false)
      onCreated?.(created.id)
    },
    onError: (err: any) => {
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/admin/requests/${activeId}`, {
        description: buildFormDescription(),
        payload: buildFormPayload(),
      })
      return data as RequestDetail
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['requests', 'detail', activeId], fresh)
      invalidateAll(qc)
      setIsEditing(false)
      toast.success(t('requests_updated_ok'))
    },
    onError: (err: any) => {
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const submitForm = () => {
    if (!checkForm()) return
    if (isCreate) createMutation.mutate()
    else updateMutation.mutate()
  }
  const formPending = isCreate
    ? createMutation.isPending
    : updateMutation.isPending

  const startEditing = () => {
    if (!canEditDetail) return
    setForm({
      description: detail?.description ?? '',
      payload: { ...(detail?.payload || {}) },
    })
    setIsEditing(true)
    setShowHistory(false)
  }

  const changeCreateCategory = (id: string) => {
    setCreateCategoryId(id)
    setCreateAssigneeId('none')
    setForm({ description: '', payload: {} })
  }

  useEffect(() => {
    if (isEditing && !canEditDetail) setIsEditing(false)
  }, [canEditDetail, isEditing])

  // Комментарий отправляем оптимистично: он появляется в списке сразу,
  // запрос улетает в фоне, при ошибке — откат и возврат текста в поле.
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      const { data } = await api.post(`/admin/requests/${activeId}/comment`, {
        text,
      })
      return data as RequestDetail
    },
    onMutate: async (text) => {
      const key = ['requests', 'detail', activeId]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<RequestDetail>(key)
      if (prev) {
        const optimistic: RequestComment = {
          id: -Date.now(),
          author_name:
            user?.full_name || user?.first_name || user?.email || null,
          author_group: user?.role || null,
          text,
          created_at: new Date().toISOString(),
        }
        qc.setQueryData<RequestDetail>(key, {
          ...prev,
          comments: [...prev.comments, optimistic],
        })
      }
      setComment('')
      return { prev, text }
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['requests', 'detail', activeId], fresh)
      qc.invalidateQueries({ queryKey: ['admin-notifications'] })
      toast.success(t('requests_comment_ok'))
    },
    onError: (err: any, _text, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['requests', 'detail', activeId], ctx.prev)
      }
      setComment(ctx?.text ?? '')
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = commentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [comment])

  const automated = useMemo(() => {
    const code = detail?.category?.code
    return !!code && AUTOMATED_CATEGORY_CODES.includes(code)
  }, [detail?.category?.code])

  const isAssignedToMe = detail?.assignee?.user_id === user?.id

  const sendComment = () => {
    const text = comment.trim()
    if (!text) {
      toast.error(t('requests_comment_required'))
      return
    }
    commentMutation.mutate(text)
  }

  const submitDecision = () => {
    if (!decision) return
    actionMutation.mutate(
      {
        url: `/admin/requests/${activeId}/${decision}`,
        body: { note: decisionNote.trim() || null },
        okKey:
          decision === 'approve'
            ? 'requests_approved_ok'
            : 'requests_rejected_ok',
      },
      {
        onSuccess: () => {
          setDecision(null)
          setDecisionNote('')
        },
      },
    )
  }

  // Дата и время назначения исполнителя — «Назначен исполнитель» или «Взята в работу»
  const assignedAt = useMemo(() => {
    const ev = detail?.events
      ?.filter((e) => e.event_type === 'assigned' || e.event_type === 'taken')
      .pop()
    return ev?.created_at ?? null
  }, [detail?.events])

  const canProcess = can(user, 'requests.process')
  const canComment = can(user, 'requests.comment')
  // Доступ по категории: пустой список ролей — могут все с правом обработки
  const categoryTakeRoles = detail?.category?.take_roles || []
  const canTakeInCategory =
    categoryTakeRoles.length === 0 ||
    categoryTakeRoles.includes(user?.role || '')
  const canManage = can(user, 'requests.manage')
  // Назначать исполнителя вручную может только admin, и только если
  // настройки категории разрешают его роль и роль исполнителя.
  const assigneeRoles =
    (isCreate ? createCategory?.take_roles : detail?.category?.take_roles) || []
  const assigneeOptions = assignees.filter(
    (a) =>
      assigneeRoles.length === 0 ||
      (a.role != null && assigneeRoles.includes(a.role)),
  )
  const canAssignInCategory =
    user?.role === 'admin' &&
    (assigneeRoles.length === 0 || assigneeRoles.includes('admin'))
  const openStatuses = ['new', 'in_progress']
  const isOpen = !!detail && openStatuses.includes(detail.status)
  const isClosed = detail?.status === 'closed'

  const renderComments = (data: RequestDetail | null) => {
    const closed = data?.status === 'closed'
    const open = !!data && openStatuses.includes(data.status)
    return (
      <div className="border rounded-lg flex flex-col min-h-0 overflow-hidden">
        <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0 px-4 pt-4">
          <Send className="w-5 h-5" />
          {t('requests_comments_title')}
        </h4>

        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto px-4 pb-4 mt-3">
          {!data ? (
            <p className="text-sm text-muted-foreground">
              {t('requests_comments_after_create')}
            </p>
          ) : (
            <>
              {data.comments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('requests_comment_empty')}
                </p>
              )}
              {data.comments.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 bg-card">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    {c.author_group && (
                      <AnimatedBadge swapKey={c.author_group}>
                        <Badge
                          className={`${ROLE_BADGE_COLORS[c.author_group] || 'bg-gray-500 text-white'} border-0 text-sm`}
                        >
                          {t(c.author_group)}
                        </Badge>
                      </AnimatedBadge>
                    )}
                    <span className="font-medium text-foreground">
                      {c.author_name || t('system_actor')}
                    </span>
                    <span className="ml-auto tabular-nums">
                      {fmtDate(c.created_at, true)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                </div>
              ))}
            </>
          )}
        </div>

        {closed && (
          <div className="border-t p-4 text-sm text-muted-foreground flex-shrink-0">
            {t('requests_closed_readonly')}
          </div>
        )}
        {data && open && canComment && (
          <div className="flex items-end gap-2 border-t p-4 flex-shrink-0">
            <textarea
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!reqPerm('requests.comment')) return
                  if (!comment.trim()) return
                  sendComment()
                }
              }}
              placeholder={t('requests_comment_placeholder')}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[38px] max-h-[120px]"
              style={{ height: 'auto' }}
            />
            <Button
              size="icon"
              className="shrink-0"
              disabled={!comment.trim()}
              onClick={() => reqPerm('requests.comment') && sendComment()}
            >
              {commentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    )
  }

  /** Детали события истории — локализованные, без сырых статусов */
  const formatEventDetails = (e: RequestEvent): string | null => {
    const d = e.details || ''
    const statusKey: Record<string, string> = {
      new: 'requests_status_new',
      in_progress: 'requests_status_in_progress',
      resolved: 'requests_status_resolved',
      rejected: 'requests_status_rejected',
      closed: 'requests_status_closed',
    }
    const statusLabel = (value: string) =>
      statusKey[value] ? t(statusKey[value] as any) : value

    if (e.event_type === 'taken') {
      const m = d.match(/\(статус:\s*(\w+)\s*→\s*(\w+)\)/)
      return m ? `${statusLabel(m[1])} → ${statusLabel(m[2])}` : null
    }

    if (e.event_type === 'status_changed' || e.event_type === 'status') {
      const m = d.match(/статус:\s*(\w+)\s*→\s*(\w+)/)
      return m ? `${statusLabel(m[1])} → ${statusLabel(m[2])}` : null
    }

    if (e.event_type === 'updated') {
      return t('requests_ev_updated_details')
    }

    if (e.event_type === 'closed') {
      return t('requests_ev_auto_closed')
    }

    if (e.event_type === 'created') {
      if (!detail?.category) return null
      return `${t('requests_col_category')}: ${categoryName(
        t,
        detail.category.code,
        detail.category.name,
      )}`
    }

    if (e.event_type === 'assigned') {
      if (d === 'исполнитель снят') {
        return t('requests_ev_assignee_removed')
      }
      for (const prefix of [
        'исполнитель: ',
        'исполнитель назначен системой: ',
      ]) {
        if (d.startsWith(prefix)) {
          return d.slice(prefix.length).split(' (')[0]
        }
      }
      return null
    }

    if (e.event_type === 'overdue') {
      const m = d.match(/срок истёк\s+(\d+)\s+мин/)
      return m
        ? t('requests_ev_overdue_details', { minutes: Number(m[1]) })
        : null
    }

    if (
      e.event_type === 'email_sent' ||
      e.event_type === 'email_skipped' ||
      e.event_type === 'email_error'
    ) {
      const m =
        d.match(/письмо на\s+(\S+)/) || d.match(/ошибка отправки на\s+(\S+)/)
      if (!m) return null
      const key =
        e.event_type === 'email_sent'
          ? 'requests_ev_email_sent_details'
          : e.event_type === 'email_skipped'
            ? 'requests_ev_email_skipped_details'
            : 'requests_ev_email_error_details'
      return t(key as any, { email: m[1] })
    }

    return e.details
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      {/* Размер и заголовок — как в модалке заказа */}
      <DialogContent
        className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
          {showHistory ? (
            <div className="flex items-center gap-3">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                {detail?.number ?? `#${activeId}`}
              </DialogTitle>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    {isCreate
                      ? t('requests_create_title')
                      : (detail?.number ?? `#${activeId}`)}
                  </DialogTitle>
                  {detail && !isCreate && (
                    // Бейдж статуса как в таблице: просрочка заменяет статус
                    <RequestsStatusCell
                      status={detail.status}
                      deadlineState={detail.deadline_state}
                      minutesLate={detail.minutes_late}
                    />
                  )}
                  {isCreate ? (
                    <Select
                      value={createCategoryId}
                      onValueChange={changeCreateCategory}
                    >
                      <SelectTrigger className="w-[220px] h-10">
                        <SelectValue
                          placeholder={t('requests_filter_category')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {creatable.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {categoryName(t, c.code, c.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    detail?.category?.name && (
                      <Badge variant="outline" className="font-normal text-sm">
                        {categoryName(
                          t,
                          detail.category.code,
                          detail.category.name,
                        )}
                      </Badge>
                    )
                  )}
                </div>
                {detail && (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {fmtDate(detail.created_at, true)}
                  </p>
                )}
              </div>
              {detail && (
                <div className="flex items-center gap-3 shrink-0">
                  {/* Статус — только тому, кто назначен исполнителем */}
                  {isOpen && !isEditing && !automated && isAssignedToMe && (
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (!reqPerm('requests.process')) return
                        actionMutation.mutate({
                          url: `/admin/requests/${activeId}/status`,
                          body: { status: v },
                          okKey: 'requests_status_changed_ok',
                        })
                      }}
                    >
                      <SelectTrigger className="w-[180px] h-10">
                        <SelectValue placeholder={t('requests_status_label')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">
                          {t('requests_status_in_progress')}
                        </SelectItem>
                        <SelectItem value="resolved">
                          {t('requests_status_resolved')}
                        </SelectItem>
                        <SelectItem value="rejected">
                          {t('requests_status_rejected')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {/* Исполнитель — вручную назначает только администратор */}
                  {canProcess &&
                    !isClosed &&
                    !isEditing &&
                    canAssignInCategory && (
                      <Select
                        value={
                          detail.assignee
                            ? String(detail.assignee.user_id)
                            : 'none'
                        }
                        onValueChange={(v) => {
                          if (!reqPerm('requests.process')) return
                          actionMutation.mutate({
                            url: `/admin/requests/${activeId}/assign`,
                            body: {
                              assignee_id: v === 'none' ? null : Number(v),
                            },
                            okKey: 'requests_assigned_ok',
                          })
                        }}
                      >
                        <SelectTrigger className="w-[180px] h-10">
                          {/* Подпись-лейбл: имя исполнителя показываем рядом с бейджем */}
                          <SelectValue>
                            {t('requests_col_assignee')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">
                              {t('requests_assignee_none')}
                            </span>
                          </SelectItem>
                          {assigneeOptions.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  {/* Роль и имя исполнителя — как «кто изменил» в модалке заказа */}
                  {detail.assignee && (
                    <div className="flex flex-col items-end gap-0.5">
                      {detail.assignee.role && (
                        <AnimatedBadge swapKey={detail.assignee.role}>
                          <Badge
                            className={`${ROLE_BADGE_COLORS[detail.assignee.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t(detail.assignee.role)}
                          </Badge>
                        </AnimatedBadge>
                      )}
                      <span className="text-sm font-medium">
                        {actorLabel(detail.assignee)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {isCreate && canAssignInCategory && (
                <div className="flex items-center gap-3 shrink-0">
                  <Select
                    value={createAssigneeId}
                    onValueChange={setCreateAssigneeId}
                  >
                    <SelectTrigger className="w-[180px] h-10">
                      <SelectValue>{t('requests_col_assignee')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">
                          {t('requests_assignee_none')}
                        </span>
                      </SelectItem>
                      {assigneeOptions.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        {isCreate ? (
          <div className="flex-1 min-h-0 p-6">
            <div
              className="grid gap-6 h-full min-h-0"
              style={{
                gridTemplateColumns:
                  'calc((100% - 48px) / 3) calc((100% - 48px) * 2 / 3 + 24px)',
              }}
            >
              <div className="border rounded-lg p-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <Pencil className="w-5 h-5" />
                    {t('requests_details_title')}
                  </h4>
                  {selectedClientRole && (
                    <AnimatedBadge swapKey={selectedClientRole}>
                      <Badge
                        className={`${ROLE_BADGE_COLORS[selectedClientRole] || 'bg-gray-500 text-white'} border-0 text-sm`}
                      >
                        {t(selectedClientRole)}
                      </Badge>
                    </AnimatedBadge>
                  )}
                </div>
                <div className="flex-1 min-h-0 -ml-1 overflow-y-auto pl-1 pr-1 mt-3">
                  <RequestFormFields
                    inline
                    code={formCode}
                    values={form}
                    onChange={(patch) =>
                      setForm((prev) => ({ ...prev, ...patch }))
                    }
                    staff={assignees}
                  />
                </div>
              </div>
              {renderComments(null)}
            </div>
          </div>
        ) : isEditing && detail ? (
          <div className="flex-1 min-h-0 p-6">
            <div
              className="grid gap-6 h-full min-h-0"
              style={{
                gridTemplateColumns:
                  'calc((100% - 48px) / 3) calc((100% - 48px) * 2 / 3 + 24px)',
              }}
            >
              <div className="border rounded-lg p-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <Pencil className="w-5 h-5" />
                    {t('requests_edit_title')}
                  </h4>
                  {selectedClientRole && (
                    <AnimatedBadge swapKey={selectedClientRole}>
                      <Badge
                        className={`${ROLE_BADGE_COLORS[selectedClientRole] || 'bg-gray-500 text-white'} border-0 text-sm`}
                      >
                        {t(selectedClientRole)}
                      </Badge>
                    </AnimatedBadge>
                  )}
                </div>
                <div className="flex-1 min-h-0 -ml-1 overflow-y-auto pl-1 pr-1 mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={t('requests_col_author')}
                      value={
                        detail.created_by
                          ? actorLabel(detail.created_by)
                          : t('requests_source_storefront')
                      }
                    />
                    <Field
                      label={t('requests_col_created')}
                      value={fmtDate(detail.created_at, true)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={t('requests_assigned_at')}
                      value={assignedAt ? fmtDate(assignedAt, true) : '—'}
                    />
                    <Field
                      label={t('requests_col_assignee')}
                      value={
                        detail.assignee
                          ? actorLabel(detail.assignee)
                          : t('requests_assignee_none')
                      }
                    />
                  </div>
                  <RequestFormFields
                    inline
                    code={formCode}
                    values={form}
                    onChange={(patch) =>
                      setForm((prev) => ({ ...prev, ...patch }))
                    }
                    staff={assignees}
                  />
                </div>
              </div>
              {renderComments(detail)}
            </div>
          </div>
        ) : isLoading || !detail ? (
          <div className="p-6 space-y-4 flex-1">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : showHistory ? (
          // История — таймлайн как в модалке заказа
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6">
            <div className="relative pl-12 space-y-0">
              <div className="absolute left-[22px] top-2 bottom-2 w-[3px] bg-border" />
              {detail.events.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">—</p>
              ) : (
                // Свежие события — сверху, как в истории заказа
                [...detail.events].reverse().map((e, idx) => {
                  const dotColor =
                    e.event_type === 'approved' || e.event_type === 'created'
                      ? 'bg-green-500'
                      : e.event_type === 'rejected' ||
                          e.event_type === 'deleted' ||
                          e.event_type === 'overdue'
                        ? 'bg-red-500'
                        : e.event_type === 'closed'
                          ? 'bg-gray-500'
                          : idx === 0
                            ? 'bg-green-500'
                            : 'bg-blue-500'
                  const IconComponent = EVENT_ICON[e.event_type] ?? Timer
                  const detailsText = formatEventDetails(e)
                  const isSystem =
                    e.event_type === 'automation' ||
                    e.author_group === 'system' ||
                    (!e.author_group && !e.author_name)
                  return (
                    <div key={e.id} className="relative pb-6">
                      <div
                        className={`absolute -left-[34px] top-1.5 w-5 h-5 rounded-full border-[3px] border-background ${dotColor}`}
                      />
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isSystem ? (
                          <AnimatedBadge swapKey="system">
                            <Badge
                              className={`${ROLE_BADGE_COLORS.system} border-0 text-sm`}
                            >
                              {t('system')}
                            </Badge>
                          </AnimatedBadge>
                        ) : e.author_group ? (
                          <AnimatedBadge swapKey={e.author_group}>
                            <Badge
                              className={`${ROLE_BADGE_COLORS[e.author_group] || 'bg-orange-500 text-white'} border-0 text-sm`}
                            >
                              {t(e.author_group)}
                            </Badge>
                          </AnimatedBadge>
                        ) : null}
                        <span className="font-medium">
                          {isSystem
                            ? t('system_actor')
                            : e.author_name || t('system_actor')}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {fmtDate(e.created_at, true)}
                        </span>
                      </div>
                      <div className="text-muted-foreground pl-1 flex items-start gap-2">
                        <IconComponent className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="break-words">
                          {t(EVENT_KEY[e.event_type] ?? 'requests_ev_status')}
                          {detailsText ? ` · ${detailsText}` : ''}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 p-6">
            {/* Два блока: слева меньше (детали), справа больше (комментарии и история) */}
            <div
              className="grid gap-6 h-full min-h-0"
              style={{
                gridTemplateColumns:
                  'calc((100% - 48px) / 3) calc((100% - 48px) * 2 / 3 + 24px)',
              }}
            >
              {/* Блок 1: детали и данные заявки */}
              <div className="border rounded-lg p-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {t('requests_details_title')}
                  </h4>
                  {selectedClientRole && (
                    <AnimatedBadge swapKey={selectedClientRole}>
                      <Badge
                        className={`${ROLE_BADGE_COLORS[selectedClientRole] || 'bg-gray-500 text-white'} border-0 text-sm`}
                      >
                        {t(selectedClientRole)}
                      </Badge>
                    </AnimatedBadge>
                  )}
                </div>

                <div className="flex-1 min-h-0 -ml-1 overflow-y-auto pl-1 pr-1 mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={t('requests_col_author')}
                      value={
                        detail.created_by
                          ? actorLabel(detail.created_by)
                          : t('requests_source_storefront')
                      }
                    />
                    <Field
                      label={t('requests_col_created')}
                      value={fmtDate(detail.created_at, true)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={t('requests_assigned_at')}
                      value={assignedAt ? fmtDate(assignedAt, true) : '—'}
                    />
                    <Field
                      label={t('requests_col_assignee')}
                      value={
                        detail.assignee
                          ? actorLabel(detail.assignee)
                          : t('requests_assignee_none')
                      }
                    />
                  </div>

                  {detail.category?.code !== 'return_change' &&
                    detail.category?.code !== 'order_delete' &&
                    detail.category?.code !== 'support_edit' &&
                    detail.category?.code !== 'pricing_change' &&
                    descriptionBlock}

                  {detail.category?.code === 'ban_unban' ? (
                    <RequestFormFields
                      inline
                      readOnly
                      code={detail.category.code}
                      values={{
                        description: detail.description || '',
                        payload: detail.payload || {},
                      }}
                      onChange={() => {}}
                      staff={assignees}
                    />
                  ) : (
                    <PayloadCard
                      code={detail.category?.code}
                      payload={detail.payload}
                    />
                  )}

                  {(detail.category?.code === 'return_change' ||
                    detail.category?.code === 'order_delete' ||
                    detail.category?.code === 'support_edit' ||
                    detail.category?.code === 'pricing_change') &&
                    descriptionBlock}
                </div>
              </div>

              {/* Блок 2: комментарии и история */}
              {renderComments(detail ?? null)}
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t flex-row flex-wrap items-center gap-2 sm:justify-start">
          {showHistory ? (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowHistory(false)}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('back')}
            </Button>
          ) : isCreate || isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => (isCreate ? onClose() : setIsEditing(false))}
              >
                {t('cancel')}
              </Button>
              <Button
                className="gap-1.5 ml-auto"
                disabled={formPending}
                onClick={submitForm}
              >
                {formPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCreate ? (
                  <Plus className="w-4 h-4" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                {isCreate ? t('requests_create_submit') : t('requests_save')}
              </Button>
            </>
          ) : (
            <>
              {/* Редактировать — администратор до решения, остальные до взятия/назначения */}
              {detail && canEditDetail && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={startEditing}
                >
                  <Pencil className="w-4 h-4" />
                  {t('requests_edit')}
                </Button>
              )}

              {/* История */}
              {detail && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setShowHistory(true)}
                >
                  <History className="w-4 h-4" />
                  {t('requests_events_title')}
                </Button>
              )}

              {/* Взять — пока заявку не взяли в работу и роль разрешена в категории */}
              {detail &&
                canProcess &&
                detail.status === 'new' &&
                canTakeInCategory && (
                  <Button
                    className="gap-1.5"
                    disabled={actionMutation.isPending}
                    onClick={() =>
                      reqPerm('requests.process') &&
                      actionMutation.mutate({
                        url: `/admin/requests/${activeId}/take`,
                        okKey: 'requests_taken_ok',
                      })
                    }
                  >
                    {actionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    {t('requests_take')}
                  </Button>
                )}

              {/* Решение — только текущему исполнителю и после взятия в работу */}
              {detail &&
                detail.status === 'in_progress' &&
                canManage &&
                isAssignedToMe && (
                  <>
                    <Button
                      className="gap-1.5 bg-green-500 text-white hover:bg-green-600"
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        reqPerm('requests.manage') && setDecision('approve')
                      }
                    >
                      <Check className="w-4 h-4" />
                      {t('requests_approve')}
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-1.5"
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        reqPerm('requests.manage') && setDecision('reject')
                      }
                    >
                      <X className="w-4 h-4" />
                      {t('requests_reject')}
                    </Button>
                  </>
                )}

              {/* Автоматизация решения — в футере после кнопок решения */}
              {detail && isOpen && automated && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  {t('requests_automated_hint')}
                </p>
              )}

              {/* Справа: срок открытой заявки или фактическая дата решения */}
              {detail && (
                <div className="ml-auto">
                  {detail.resolved_at &&
                  ['resolved', 'rejected', 'closed'].includes(detail.status) ? (
                    <span
                      className="text-sm tabular-nums"
                      title={t('requests_decision_date')}
                    >
                      {fmtDate(detail.resolved_at, true)}
                    </span>
                  ) : (
                    <DeadlineCell
                      deadline={detail.deadline}
                      state={detail.deadline_state}
                      minutesLeft={detail.minutes_left}
                      minutesLate={detail.minutes_late}
                      closed={!isOpen}
                      overdueBadge={false}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Диалог решения — по паттерну диалога удаления */}
      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  decision === 'approve'
                    ? 'bg-green-500/10'
                    : 'bg-destructive/10'
                }`}
              >
                {decision === 'approve' ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div>
                <DialogTitle>
                  {decision === 'approve'
                    ? t('requests_approve')
                    : t('requests_reject')}
                </DialogTitle>
                <DialogDescription>
                  {decision === 'approve'
                    ? t('requests_approve_confirm')
                    : t('requests_reject_confirm')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {detail && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <strong className="font-mono">{detail.number}</strong>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground truncate">
                  {categoryName(t, detail.category.code, detail.category.name)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={t('requests_decision_note_placeholder')}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            {automated && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldBan className="w-3.5 h-3.5" />
                {t('requests_automated_hint')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant={decision === 'approve' ? 'default' : 'destructive'}
              disabled={actionMutation.isPending}
              className={`gap-2 ${decision === 'approve' ? 'bg-green-500 text-white hover:bg-green-600' : ''}`}
              onClick={submitDecision}
            >
              {actionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : decision === 'approve' ? (
                <Check className="w-4 h-4" />
              ) : (
                <X className="w-4 h-4" />
              )}
              {decision === 'approve'
                ? t('requests_approve')
                : t('requests_reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

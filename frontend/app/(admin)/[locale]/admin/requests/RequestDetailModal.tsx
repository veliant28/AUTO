'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { formatPhone } from '@/lib/phone'
import { DeadlineCell, RequestsStatusCell } from './RequestsStatusBadge'
import {
  actorLabel,
  AUTOMATED_CATEGORY_CODES,
  type RequestCategory,
} from './shared'
import { categoryName } from '@/lib/requestCategories'
import { useRequestDate } from './useRequestDate'

/** Цвета бейджей ролей — как в модалке заказа */
const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
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
  title: string
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

  // B2B-заявка: названия полей и раскладка — как в карточке компании
  // модалки пользователя (режим B2B): Компания + ЕДРПОУ; Фамилия + Город;
  // Имя + Телефон; Отчество + Email
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
        <div className="grid grid-cols-2 gap-3">
          {payload.company && (
            <Field label={tb('company')} value={payload.company} />
          )}
          {payload.edrpou && (
            <Field label={tb('edrpou')} value={payload.edrpou} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {lastName && (
            <Field label={tb('contact_last_name')} value={lastName} />
          )}
          {payload.city && <Field label={tb('city')} value={payload.city} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {firstName && (
            <Field label={tb('contact_first_name')} value={firstName} />
          )}
          {payload.phone && (
            <Field label={tb('phone')} value={formatPhone(payload.phone)} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {middleName && (
            <Field label={tb('contact_middle_name')} value={middleName} />
          )}
          {emailField && <Field label={tb('email')} value={emailField} />}
        </div>
        {payload.comment && (
          <Field label={t('requests_fields_comment')} value={payload.comment} />
        )}
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
        label: t('requests_fields_minutes'),
        value: `${payload.minutes} (${Math.floor(Number(payload.minutes) / 60)}ч ${String(
          Number(payload.minutes) % 60,
        ).padStart(2, '0')}м)`,
      })
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
  onClose,
}: {
  requestId: number
  categories: RequestCategory[]
  onClose: () => void
}) {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const reqPerm = useRequirePerm()
  const qc = useQueryClient()
  const fmtDate = useRequestDate()

  const [comment, setComment] = useState('')
  const [decision, setDecision] = useState<null | 'approve' | 'reject'>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const { data: detail, isLoading } = useQuery<RequestDetail>({
    queryKey: ['requests', 'detail', requestId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/requests/${requestId}`)
      return data
    },
  })

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
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  // Комментарий отправляем оптимистично: он появляется в списке сразу,
  // запрос улетает в фоне, при ошибке — откат и возврат текста в поле.
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      const { data } = await api.post(`/admin/requests/${requestId}/comment`, {
        text,
      })
      return data as RequestDetail
    },
    onMutate: async (text) => {
      const key = ['requests', 'detail', requestId]
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
      qc.setQueryData(['requests', 'detail', requestId], fresh)
      qc.invalidateQueries({ queryKey: ['admin-notifications'] })
      toast.success(t('requests_comment_ok'))
    },
    onError: (err: any, _text, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['requests', 'detail', requestId], ctx.prev)
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
        url: `/admin/requests/${requestId}/${decision}`,
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
  // Доступ по категории: пустой список ролей — могут все с правом обработки
  const categoryTakeRoles = detail?.category?.take_roles || []
  const canTakeInCategory =
    categoryTakeRoles.length === 0 ||
    categoryTakeRoles.includes(user?.role || '')
  const canManage = can(user, 'requests.manage')
  const openStatuses = ['new', 'in_progress']
  const isOpen = !!detail && openStatuses.includes(detail.status)
  const isClosed = detail?.status === 'closed'

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
                {detail?.number ?? `#${requestId}`}
              </DialogTitle>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    {detail?.number ?? `#${requestId}`}
                  </DialogTitle>
                  {detail && (
                    // Бейдж статуса как в таблице: просрочка заменяет статус
                    <RequestsStatusCell
                      status={detail.status}
                      deadlineState={detail.deadline_state}
                      minutesLate={detail.minutes_late}
                    />
                  )}
                  {detail?.category?.name && (
                    <Badge variant="outline" className="font-normal text-sm">
                      {categoryName(
                        t,
                        detail.category.code,
                        detail.category.name,
                      )}
                    </Badge>
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
                  {isOpen && !automated && isAssignedToMe && (
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (!reqPerm('requests.process')) return
                        actionMutation.mutate({
                          url: `/admin/requests/${requestId}/status`,
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
                  {/* Исполнитель — как селект статуса в модалке заказа;
                      менять исполнителя может только администратор */}
                  {canManage && !isClosed && (
                    <Select
                      value={
                        detail.assignee
                          ? String(detail.assignee.user_id)
                          : 'none'
                      }
                      onValueChange={(v) => {
                        if (!reqPerm('requests.process')) return
                        actionMutation.mutate({
                          url: `/admin/requests/${requestId}/assign`,
                          body: {
                            assignee_id: v === 'none' ? null : Number(v),
                          },
                          okKey: 'requests_assigned_ok',
                        })
                      }}
                    >
                      <SelectTrigger className="w-[180px] h-10">
                        {/* Подпись-лейбл: имя исполнителя показываем рядом с бейджем */}
                        <SelectValue>{t('requests_col_assignee')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">
                            {t('requests_assignee_none')}
                          </span>
                        </SelectItem>
                        {assignees.map((a) => (
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
                        <Badge
                          className={`${ROLE_BADGE_COLORS[detail.assignee.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                        >
                          {t(detail.assignee.role)}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">
                        {actorLabel(detail.assignee)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        {isLoading || !detail ? (
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
                  return (
                    <div key={e.id} className="relative pb-6">
                      <div
                        className={`absolute -left-[34px] top-1.5 w-5 h-5 rounded-full border-[3px] border-background ${dotColor}`}
                      />
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {e.author_group && (
                          <Badge
                            className={`${ROLE_BADGE_COLORS[e.author_group] || 'bg-orange-500 text-white'} border-0 text-sm`}
                          >
                            {t(e.author_group)}
                          </Badge>
                        )}
                        <span className="font-medium">
                          {e.author_name || t('system_actor')}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {fmtDate(e.created_at, true)}
                        </span>
                      </div>
                      <div className="text-muted-foreground pl-1 flex items-start gap-2">
                        <IconComponent className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="break-words">
                          {t(EVENT_KEY[e.event_type] ?? 'requests_ev_status')}
                          {e.details ? ` · ${e.details}` : ''}
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
                <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                  {t('requests_details_title')}
                </h4>

                <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-3 space-y-3">
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
                  {detail.resolved_at && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label={t('requests_resolved_at')}
                        value={`${fmtDate(detail.resolved_at, true)}${
                          detail.resolved_by
                            ? ` — ${actorLabel(detail.resolved_by)}`
                            : ''
                        }`}
                      />
                    </div>
                  )}

                  {detail.description && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm">
                        {t('requests_desc_label')}
                      </p>
                      <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
                        {detail.description}
                      </p>
                    </div>
                  )}

                  <PayloadCard
                    code={detail.category?.code}
                    payload={detail.payload}
                  />
                </div>
              </div>

              {/* Блок 2: комментарии и история */}
              <div className="border rounded-lg flex flex-col min-h-0 overflow-hidden">
                <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0 px-4 pt-4">
                  <Send className="w-5 h-5" />
                  {t('requests_comments_title')}
                </h4>

                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto px-4 pb-4 mt-3">
                  {detail.comments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t('requests_comment_empty')}
                    </p>
                  )}
                  {detail.comments.map((c) => (
                    <div key={c.id} className="rounded-lg border p-3 bg-card">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        {c.author_group && (
                          <Badge
                            className={`${ROLE_BADGE_COLORS[c.author_group] || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t(c.author_group)}
                          </Badge>
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
                </div>

                {/* Комментарий — внизу колонки: поле как в поддержке, Enter отправляет */}
                {isClosed && (
                  <div className="border-t p-4 text-sm text-muted-foreground flex-shrink-0">
                    {t('requests_closed_readonly')}
                  </div>
                )}
                {canProcess && isOpen && (
                  <div className="flex items-end gap-2 border-t p-4 flex-shrink-0">
                    <textarea
                      ref={commentRef}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (!reqPerm('requests.process')) return
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
                      onClick={() =>
                        reqPerm('requests.process') && sendComment()
                      }
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
          ) : (
            <>
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
                        url: `/admin/requests/${requestId}/take`,
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

              {/* Срок — на месте прежней кнопки удаления, без бейджа просрочки */}
              {detail && (
                <div className="ml-auto">
                  <DeadlineCell
                    deadline={detail.deadline}
                    state={detail.deadline_state}
                    minutesLeft={detail.minutes_left}
                    minutesLate={detail.minutes_late}
                    closed={!isOpen}
                    overdueBadge={false}
                  />
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
                  {detail.title}
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

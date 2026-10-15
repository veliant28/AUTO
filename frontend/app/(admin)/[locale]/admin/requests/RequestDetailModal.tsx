'use client'

import React, { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Check,
  ClipboardCheck,
  Loader2,
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
import { DeadlineCell, RequestsStatusBadge } from './RequestsStatusBadge'
import {
  actorLabel,
  AUTOMATED_CATEGORY_CODES,
  type RequestCategory,
} from './shared'
import { useRequestDate } from './useRequestDate'

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
  if (!payload || Object.keys(payload).length === 0) return null

  const rows: { label: string; value: React.ReactNode }[] = []

  if (code === 'b2b_registration') {
    if (payload.company)
      rows.push({ label: t('requests_fields_company'), value: payload.company })
    if (payload.edrpou)
      rows.push({ label: t('requests_fields_edrpou'), value: payload.edrpou })
    if (payload.contact_name)
      rows.push({
        label: t('requests_fields_contact'),
        value: payload.contact_name,
      })
    if (payload.phone)
      rows.push({ label: t('requests_fields_phone'), value: payload.phone })
    if (payload.email)
      rows.push({
        label: t('requests_fields_email'),
        value: (
          <a
            href={`mailto:${payload.email}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {payload.email}
          </a>
        ),
      })
    if (payload.city)
      rows.push({ label: t('requests_fields_city'), value: payload.city })
    if (payload.comment)
      rows.push({ label: t('requests_fields_comment'), value: payload.comment })
  } else if (code === 'ban_unban') {
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
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[130px_1fr] gap-2 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="break-words">{row.value}</span>
        </div>
      ))}
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
  const [deleteOpen, setDeleteOpen] = useState(false)

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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/admin/requests/${requestId}`)
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast.success(t('requests_deleted_ok'))
      setDeleteOpen(false)
      onClose()
    },
    onError: () => toast.error(t('requests_action_error')),
  })

  const automated = useMemo(() => {
    const code = detail?.category?.code
    return !!code && AUTOMATED_CATEGORY_CODES.includes(code)
  }, [detail?.category?.code])

  const isAssignedToMe = detail?.assignee?.user_id === user?.id

  const sendComment = () => {
    if (!comment.trim()) {
      toast.error(t('requests_comment_required'))
      return
    }
    actionMutation.mutate(
      {
        url: `/admin/requests/${requestId}/comment`,
        body: { text: comment.trim() },
        okKey: 'requests_comment_ok',
      },
      { onSuccess: () => setComment('') },
    )
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

  const canProcess = can(user, 'requests.process')
  const canManage = can(user, 'requests.manage')
  const openStatuses = ['new', 'in_progress']
  const isOpen = !!detail && openStatuses.includes(detail.status)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[96vw] max-w-[1200px] h-[88vh] max-h-[88vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
            <DialogTitle className="font-mono text-base">
              {detail?.number ?? `#${requestId}`}
            </DialogTitle>
            {detail && <RequestsStatusBadge status={detail.status} />}
            {detail?.category?.name && (
              <Badge variant="outline" className="font-normal">
                {detail.category.name}
              </Badge>
            )}
            {detail && (
              <div className="ml-auto">
                <DeadlineCell
                  deadline={detail.deadline}
                  state={detail.deadline_state}
                  minutesLeft={detail.minutes_left}
                  minutesLate={detail.minutes_late}
                  closed={!isOpen}
                />
              </div>
            )}
          </div>
          {detail && (
            <DialogDescription className="text-sm text-foreground">
              {detail.title}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="p-6 space-y-4 flex-1">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Левая колонка: детали и данные заявки */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="w-4 h-4 text-primary" />
                {t('requests_details_title')}
              </div>

              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="grid grid-cols-[130px_1fr] gap-2">
                  <span className="text-muted-foreground">
                    {t('requests_col_author')}
                  </span>
                  <span>
                    {detail.created_by
                      ? actorLabel(detail.created_by)
                      : t('requests_source_storefront')}
                  </span>
                </div>
                <div className="grid grid-cols-[130px_1fr] gap-2">
                  <span className="text-muted-foreground">
                    {t('requests_col_assignee')}
                  </span>
                  <span>
                    {detail.assignee ? (
                      actorLabel(detail.assignee)
                    ) : (
                      <span className="text-muted-foreground">
                        {t('requests_assignee_none')}
                      </span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-[130px_1fr] gap-2">
                  <span className="text-muted-foreground">
                    {t('requests_col_created')}
                  </span>
                  <span className="tabular-nums">
                    {fmtDate(detail.created_at, true)}
                  </span>
                </div>
                {detail.resolved_at && (
                  <div className="grid grid-cols-[130px_1fr] gap-2">
                    <span className="text-muted-foreground">
                      {t('requests_resolved_at')}
                    </span>
                    <span className="tabular-nums">
                      {fmtDate(detail.resolved_at, true)}
                      {detail.resolved_by
                        ? ` — ${actorLabel(detail.resolved_by)}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>

              {detail.description && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    {t('requests_desc_label')}
                  </p>
                  <p className="text-sm whitespace-pre-wrap rounded-lg border p-3 bg-muted/30">
                    {detail.description}
                  </p>
                </div>
              )}

              <PayloadCard
                code={detail.category?.code}
                payload={detail.payload}
              />

              {automated && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  {t('requests_automated_hint')}
                </p>
              )}
            </div>

            {/* Правая колонка: комментарии и история */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Send className="w-4 h-4 text-primary" />
                {t('requests_comments_title')}
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {detail.comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t('requests_comment_empty')}
                  </p>
                )}
                {detail.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 bg-card">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">
                        {c.author_name || '—'}
                      </span>
                      {c.author_group && (
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {c.author_group}
                        </Badge>
                      )}
                      <span className="ml-auto tabular-nums">
                        {fmtDate(c.created_at, true)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))}
              </div>

              {canProcess && isOpen && (
                <div className="flex items-end gap-2">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t('requests_comment_placeholder')}
                    rows={2}
                    className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={actionMutation.isPending}
                    onClick={() => reqPerm('requests.process') && sendComment()}
                  >
                    {actionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {t('requests_comment_send')}
                  </Button>
                </div>
              )}

              <Separator />

              <div className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="w-4 h-4 text-primary" />
                {t('requests_events_title')}
              </div>
              <div className="space-y-1.5">
                {detail.events.map((e) => (
                  <div key={e.id} className="flex items-start gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className="shrink-0 font-normal text-[10px]"
                    >
                      {t(EVENT_KEY[e.event_type] ?? 'requests_ev_status')}
                    </Badge>
                    <span className="text-muted-foreground break-words flex-1">
                      {e.details || ''}
                      {e.author_name ? ` · ${e.author_name}` : ''}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {fmtDate(e.created_at, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t flex-row flex-wrap items-center gap-2 sm:justify-start">
          {detail && canProcess && isOpen && !isAssignedToMe && (
            <Button
              size="sm"
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
              <UserCheck className="w-4 h-4" />
              {t('requests_take')}
            </Button>
          )}

          {detail && canProcess && (
            <Select
              value={detail.assignee ? String(detail.assignee.user_id) : 'none'}
              onValueChange={(v) => {
                if (!reqPerm('requests.process')) return
                actionMutation.mutate({
                  url: `/admin/requests/${requestId}/assign`,
                  body: { assignee_id: v === 'none' ? null : Number(v) },
                  okKey: 'requests_assigned_ok',
                })
              }}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder={t('requests_assign_placeholder')} />
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

          {detail && isOpen && !automated && canProcess && (
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
              <SelectTrigger className="w-[180px] h-9">
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

          {detail && isOpen && canManage && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-green-500/50 text-green-600 hover:text-green-600"
                disabled={actionMutation.isPending}
                onClick={() =>
                  reqPerm('requests.manage') && setDecision('approve')
                }
              >
                <Check className="w-4 h-4" />
                {t('requests_approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-red-500/50 text-red-600 hover:text-red-600"
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

          {detail && canManage && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-muted-foreground ml-auto"
              onClick={() => reqPerm('requests.manage') && setDeleteOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              {t('requests_delete')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Диалог решения: комментарий к одобрению/отклонению */}
      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decision === 'approve' ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <X className="w-5 h-5 text-red-600" />
              )}
              {decision === 'approve'
                ? t('requests_approve')
                : t('requests_reject')}
            </DialogTitle>
            {automated && (
              <DialogDescription className="flex items-center gap-1.5">
                <ShieldBan className="w-3.5 h-3.5" />
                {t('requests_automated_hint')}
              </DialogDescription>
            )}
          </DialogHeader>
          <textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={t('requests_decision_note_placeholder')}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={actionMutation.isPending}
              className="gap-1.5"
              onClick={submitDecision}
            >
              {actionMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {decision === 'approve'
                ? t('requests_approve')
                : t('requests_reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Удаление заявки */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('requests_delete')}</DialogTitle>
            <DialogDescription>
              {t('requests_delete_confirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t('requests_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

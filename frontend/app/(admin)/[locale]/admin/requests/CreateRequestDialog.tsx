'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
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
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import { categoryName } from '@/lib/requestCategories'
import { type AssigneeOption, type RequestCategory } from './shared'

interface ClientOption {
  id: number
  name: string
  email: string
}

export default function CreateRequestDialog({
  open,
  onOpenChange,
  categories,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: RequestCategory[]
  onCreated: (id: number) => void
}) {
  const t = useTranslations('admin')
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const roleName = user?.role || null

  const [categoryId, setCategoryId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState<string>('none')

  // payload-поля специальных категорий
  const [staffId, setStaffId] = useState<string>('')
  const [workDate, setWorkDate] = useState('')
  const [minutes, setMinutes] = useState('')
  const [banAction, setBanAction] = useState<'ban' | 'unban'>('ban')
  const [clientSearch, setClientSearch] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [client, setClient] = useState<ClientOption | null>(null)

  const creatable = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.is_active &&
          (!c.allowed_roles ||
            c.allowed_roles.length === 0 ||
            (roleName && c.allowed_roles.includes(roleName))),
      ),
    [categories, roleName],
  )

  const selected = creatable.find((c) => String(c.id) === categoryId)
  const code = selected?.code

  const { data: staff = [] } = useQuery<AssigneeOption[]>({
    queryKey: ['requests', 'assignees'],
    queryFn: async () => {
      const { data } = await api.get('/admin/requests/assignees')
      return data || []
    },
    enabled: open,
  })

  // Поиск клиента для бана/разбана
  useEffect(() => {
    const id = setTimeout(() => setClientQuery(clientSearch), 400)
    return () => clearTimeout(id)
  }, [clientSearch])

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['requests', 'client-search', clientQuery],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/users?page_size=10&search=${encodeURIComponent(clientQuery)}`,
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
    enabled: open && code === 'ban_unban',
  })

  const reset = () => {
    setCategoryId('')
    setTitle('')
    setDescription('')
    setAssigneeId('none')
    setStaffId('')
    setWorkDate('')
    setMinutes('')
    setBanAction('ban')
    setClientSearch('')
    setClientQuery('')
    setClient(null)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      let payload: Record<string, any> | null = null
      if (code === 'timesheet_manual') {
        const staffMember = staff.find((s) => String(s.id) === staffId)
        payload = {
          user_id: Number(staffId),
          user_name: staffMember?.name || null,
          email: staffMember?.email || null,
          work_date: workDate,
          minutes: Number(minutes),
        }
      } else if (code === 'ban_unban') {
        payload = {
          action: banAction,
          reason: description.trim() || null,
          user_id: client?.id ?? null,
          email: client?.email ?? null,
          client_name: client?.name ?? null,
        }
      }
      const { data } = await api.post('/admin/requests', {
        category_id: Number(categoryId),
        title: title.trim(),
        description: description.trim() || null,
        payload,
        assignee_id: assigneeId === 'none' ? null : Number(assigneeId),
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['requests-alerts'] })
      qc.invalidateQueries({ queryKey: ['admin-notifications'] })
      toast.success(t('requests_created_ok', { number: data?.number || '' }))
      onOpenChange(false)
      reset()
      if (data?.id) onCreated(data.id)
    },
    onError: (err: any) => {
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const submit = () => {
    if (!categoryId || title.trim().length < 3) {
      toast.error(t('requests_comment_required'))
      return
    }
    if (code === 'timesheet_manual' && (!staffId || !workDate || !minutes)) {
      toast.error(t('requests_comment_required'))
      return
    }
    if (code === 'ban_unban' && !client) {
      toast.error(t('requests_client_none'))
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            {t('requests_create_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('requests_filter_category')} *
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {creatable.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {categoryName(t, c.code, c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <>
              {code === 'timesheet_manual' && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('requests_payload_user')} *
                    </label>
                    <Select value={staffId} onValueChange={setStaffId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        {t('requests_fields_date')} *
                      </label>
                      <Input
                        type="date"
                        value={workDate}
                        onChange={(e) => setWorkDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        {t('requests_fields_minutes')} *
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t('requests_hours_hint')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {code === 'ban_unban' && (
                <div className="space-y-4 rounded-lg border p-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('requests_fields_action')} *
                    </label>
                    <Select
                      value={banAction}
                      onValueChange={(v) => setBanAction(v as 'ban' | 'unban')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ban">
                          {t('requests_ban_action_ban')}
                        </SelectItem>
                        <SelectItem value="unban">
                          {t('requests_ban_action_unban')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('requests_fields_client')} *
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder={t('requests_client_search')}
                        className="pl-9"
                      />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {client ? (
                        <button
                          type="button"
                          onClick={() => setClient(null)}
                          className="w-full text-left text-sm rounded-md border border-primary/50 bg-primary/5 px-3 py-2 cursor-pointer"
                        >
                          <span className="font-medium">{client.name}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            · {client.email}
                          </span>
                        </button>
                      ) : (
                        clients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setClient(c)}
                            className="w-full text-left text-sm rounded-md border px-3 py-2 hover:bg-accent cursor-pointer"
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {c.email}
                            </span>
                          </button>
                        ))
                      )}
                      {!client && clients.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t('no_results')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('requests_col_title')} *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('requests_col_title')}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {code === 'ban_unban'
                ? t('requests_fields_reason')
                : t('requests_desc_label')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={
                code === 'ban_unban'
                  ? t('requests_ban_reason_placeholder')
                  : t('requests_desc_label')
              }
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              {t('requests_col_assignee')}
            </label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">
                    {t('requests_assignee_none')}
                  </span>
                </SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={createMutation.isPending}
            className="gap-1.5"
            onClick={submit}
          >
            {createMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            <Plus className="w-4 h-4" />
            {t('requests_new_btn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

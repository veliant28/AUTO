'use client'

import React, { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HelpCircle, Loader2, Save, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { categoryName } from '@/lib/requestCategories'
import { AUTOMATED_CATEGORY_CODES, type RequestCategory } from './shared'

const STAFF_ROLES = ['admin', 'manager', 'operator'] as const

/** Названия категорий фиксированы переводами и не редактируются из UI */
interface Draft {
  response_minutes: string
  resolve_minutes: string
  is_active: boolean
  allowed_roles: string[]
  take_roles: string[]
}

export default function CategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('admin')
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})

  const { data: categories = [], isLoading } = useQuery<RequestCategory[]>({
    queryKey: ['requests', 'categories'],
    queryFn: async () => {
      const { data } = await api.get('/admin/requests/categories')
      return data || []
    },
    enabled: open,
  })

  useEffect(() => {
    if (!open || categories.length === 0) return
    const next: Record<number, Draft> = {}
    for (const c of categories) {
      next[c.id] = {
        response_minutes:
          c.response_minutes != null ? String(c.response_minutes) : '',
        resolve_minutes:
          c.resolve_minutes != null ? String(c.resolve_minutes) : '',
        is_active: c.is_active,
        allowed_roles: c.allowed_roles || [],
        take_roles: c.take_roles || [],
      }
    }
    setDrafts(next)
  }, [open, categories])

  // Одна кнопка в футере сохраняет все категории разом
  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = categories.filter((c) => drafts[c.id])
      await Promise.all(
        entries.map((c) =>
          api.patch(`/admin/requests/categories/${c.id}`, {
            // name не отправляем: название категории задаётся переводом по коду
            response_minutes:
              drafts[c.id].response_minutes === ''
                ? 0
                : Number(drafts[c.id].response_minutes),
            resolve_minutes:
              drafts[c.id].resolve_minutes === ''
                ? 0
                : Number(drafts[c.id].resolve_minutes),
            is_active: drafts[c.id].is_active,
            allowed_roles: drafts[c.id].allowed_roles,
            take_roles: drafts[c.id].take_roles,
          }),
        ),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] })
      toast.success(t('requests_cat_saved'))
    },
    onError: (err: any) => {
      const detailMsg = err?.response?.data?.detail
      toast.error(
        typeof detailMsg === 'string' ? detailMsg : t('requests_action_error'),
      )
    },
  })

  const toggleRole = (draft: Draft, role: string) => {
    const has = draft.allowed_roles.includes(role)
    return has
      ? draft.allowed_roles.filter((r) => r !== role)
      : [...draft.allowed_roles, role]
  }

  const toggleTakeRole = (draft: Draft, role: string) => {
    const has = draft.take_roles.includes(role)
    return has
      ? draft.take_roles.filter((r) => r !== role)
      : [...draft.take_roles, role]
  }

  /** Чекбоксы ролей для полей «Кто создаёт» и «Кто может брать в работу» */
  const roleChecks = (selected: string[], onToggle: (role: string) => void) => (
    <div className="flex flex-wrap items-center gap-3 min-h-10">
      {STAFF_ROLES.map((role) => (
        <label
          key={role}
          className="flex items-center gap-1.5 text-sm cursor-pointer"
        >
          <Checkbox
            className="cursor-pointer"
            checked={selected.includes(role)}
            onCheckedChange={() => onToggle(role)}
          />
          <span className="capitalize">{role}</span>
        </label>
      ))}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0">
        <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-primary" />
              {t('requests_categories_title')}
            </DialogTitle>
            {categories.length > 0 && (
              <Badge variant="secondary" className="text-sm">
                {categories.length}
              </Badge>
            )}
          </div>
          <DialogDescription>{t('requests_categories_hint')}</DialogDescription>
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {categories.map((c) => {
                const draft = drafts[c.id]
                if (!draft) return null
                return (
                  <div
                    key={c.id}
                    className="border rounded-lg p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      {AUTOMATED_CATEGORY_CODES.includes(c.code) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className="text-sm cursor-help"
                            >
                              {categoryName(t, c.code, c.name)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('requests_automated_hint')}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant="secondary" className="text-sm">
                          {categoryName(t, c.code, c.name)}
                        </Badge>
                      )}
                      {t.has(`requests_cat_desc_${c.code}`) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t(`requests_cat_desc_${c.code}`)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1">
                        <span className="text-sm text-muted-foreground">
                          {t('requests_cat_response_min')}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={draft.response_minutes}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...draft,
                                response_minutes: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>

                      <div className="grid gap-1">
                        <span className="text-sm text-muted-foreground">
                          {t('requests_cat_resolve_min')}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={draft.resolve_minutes}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...draft,
                                resolve_minutes: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <span className="text-sm text-muted-foreground">
                        {t('requests_cat_roles')}
                      </span>
                      {roleChecks(draft.allowed_roles, (role) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [c.id]: {
                            ...draft,
                            allowed_roles: toggleRole(draft, role),
                          },
                        })),
                      )}
                    </div>

                    <div className="grid gap-1">
                      <span className="text-sm text-muted-foreground">
                        {t('requests_cat_take_roles')}
                      </span>
                      {roleChecks(draft.take_roles, (role) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [c.id]: {
                            ...draft,
                            take_roles: toggleTakeRole(draft, role),
                          },
                        })),
                      )}
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('requests_cat_active')}
                      </span>
                      <Switch
                        checked={draft.is_active}
                        onCheckedChange={(v) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...draft, is_active: v },
                          }))
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator className="flex-shrink-0" />
        <div className="flex-shrink-0 p-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <span className="text-sm text-muted-foreground">
              {t('requests_cat_sla_hint')}
            </span>
            <Button
              className="gap-2 h-10"
              onClick={() => saveMutation.mutate()}
              disabled={isLoading || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

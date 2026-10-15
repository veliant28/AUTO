'use client'

import React, { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Settings2 } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { AUTOMATED_CATEGORY_CODES, type RequestCategory } from './shared'

const STAFF_ROLES = ['admin', 'manager', 'operator'] as const

interface Draft {
  name: string
  response_minutes: string
  resolve_minutes: string
  is_active: boolean
  allowed_roles: string[]
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
        name: c.name,
        response_minutes:
          c.response_minutes != null ? String(c.response_minutes) : '',
        resolve_minutes:
          c.resolve_minutes != null ? String(c.resolve_minutes) : '',
        is_active: c.is_active,
        allowed_roles: c.allowed_roles || [],
      }
    }
    setDrafts(next)
  }, [open, categories])

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: Draft }) => {
      await api.patch(`/admin/requests/categories/${id}`, {
        name: draft.name.trim(),
        response_minutes:
          draft.response_minutes === '' ? 0 : Number(draft.response_minutes),
        resolve_minutes:
          draft.resolve_minutes === '' ? 0 : Number(draft.resolve_minutes),
        is_active: draft.is_active,
        allowed_roles: draft.allowed_roles,
      })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[900px] max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            {t('requests_categories_title')}
          </DialogTitle>
          <DialogDescription>{t('requests_categories_hint')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {categories.map((c) => {
            const draft = drafts[c.id]
            if (!draft) return null
            return (
              <div key={c.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [c.id]: { ...draft, name: e.target.value },
                      }))
                    }
                    className="max-w-[320px]"
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.code}
                  </span>
                  {AUTOMATED_CATEGORY_CODES.includes(c.code) && (
                    <Badge variant="outline" className="text-[10px]">
                      {t('requests_automated_hint')}
                    </Badge>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate({ id: c.id, draft })}
                    >
                      <Save className="w-4 h-4" />
                      {t('save')}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {t('requests_cat_response_min')}
                    </label>
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
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {t('requests_cat_resolve_min')}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.resolve_minutes}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [c.id]: { ...draft, resolve_minutes: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {t('requests_cat_roles')}
                    </label>
                    <div className="flex flex-wrap items-center gap-3 pt-1.5">
                      {STAFF_ROLES.map((role) => (
                        <label
                          key={role}
                          className="flex items-center gap-1.5 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={draft.allowed_roles.includes(role)}
                            onCheckedChange={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [c.id]: {
                                  ...draft,
                                  allowed_roles: toggleRole(draft, role),
                                },
                              }))
                            }
                          />
                          <span className="capitalize">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">
            {t('requests_cat_sla_hint')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

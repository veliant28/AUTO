'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Pencil, Trash2, Loader2, AlertTriangle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface Category {
  id: number
  name: string
  tecdoc_id: number | null
  parent_id: number | null
  depth: number
}

const columnHelper = createColumnHelper<Category>()

export default function CategoriesPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const [hydrated, setHydrated] = useState(false)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: '', parent_id: 'null' })

  useEffect(() => {
    setHydrated(true)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories', page, pageSize, search],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (search) params.search = search
      const { data } = await api.get('/admin/categories', { params })
      return data as { items: Category[]; total: number }
    },
    enabled: !!user && hydrated,
  })

  const categories = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  // Build parent name lookup
  const parentMap = useMemo(() => {
    const map: Record<number, string> = {}
    for (const c of categories) {
      map[c.id] = c.name
    }
    return map
  }, [categories])

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { data } = await api.post('/admin/categories', {
        name: payload.name,
        parent_id:
          payload.parent_id && payload.parent_id !== 'null'
            ? Number(payload.parent_id)
            : null,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast.success(t('categories_created'))
      setCreateOpen(false)
      setForm({ name: '', parent_id: 'null' })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('save_error'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number
      payload: typeof form
    }) => {
      const { data } = await api.put(`/admin/categories/${id}`, {
        name: payload.name,
        parent_id:
          payload.parent_id && payload.parent_id !== 'null'
            ? Number(payload.parent_id)
            : null,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast.success(t('categories_updated'))
      setEditTarget(null)
      setForm({ name: '', parent_id: 'null' })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('save_error'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/categories/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toast.success(t('categories_deleted'))
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('categories_delete_error'))
    },
  })

  useEffect(() => {
    ;(window as any).__openCreateCategory = () => setCreateOpen(true)
    return () => {
      delete (window as any).__openCreateCategory
    }
  }, [])

  const resetForm = () => setForm({ name: '', parent_id: 'null' })

  const openEdit = (cat: Category) => {
    setEditTarget(cat)
    setForm({
      name: cat.name,
      parent_id: cat.parent_id ? String(cat.parent_id) : 'null',
    })
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'ID',
        size: 60,
      }),
      columnHelper.accessor('name', {
        header: t('categories_name'),
        cell: (info) => {
          const depth = info.row.original.depth
          return (
            <span
              className={`inline-flex items-center gap-1 ${depth > 0 ? `pl-${depth * 4}` : ''}`}
            >
              {depth > 0 && (
                <span className="text-muted-foreground">
                  {'—'.repeat(depth * 2)}
                </span>
              )}
              {info.getValue()}
            </span>
          )
        },
      }),
      columnHelper.accessor('parent_id', {
        header: t('categories_parent'),
        cell: (info) => {
          const pid = info.getValue()
          if (!pid) return <span className="text-muted-foreground">—</span>
          return (
            <Badge variant="outline" className="text-xs">
              {parentMap[pid] || `ID ${pid}`}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('tecdoc_id', {
        header: t('categories_tecdoc_id'),
        cell: (info) => {
          const val = info.getValue()
          return val ? (
            <Badge variant="outline" className="text-xs">
              {val}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 120,
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => openEdit(row.original)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [t, parentMap],
  )

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const parentOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }))

  if (!hydrated) return <Loader2 className="w-4 h-4 animate-spin" />

  return (
    <div className="p-6">
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (open) resetForm()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('categories_create')}</DialogTitle>
            <DialogDescription>{t('categories_create')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                {t('categories_name')}
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('categories_name')}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                {t('categories_parent')}
              </label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('categories_no_parent')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">
                    {t('categories_no_parent')}
                  </SelectItem>
                  {parentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.name}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t('save_footer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search & controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="500">500</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b bg-muted/50">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="text-left p-3 font-medium text-muted-foreground"
                          style={{ width: header.getSize() }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-muted-foreground text-sm"
                      >
                        {t('categories_empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {t('page_of', { page, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('prev_page')}
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number
                  if (totalPages <= 7) {
                    p = i + 1
                  } else if (page <= 4) {
                    p = i + 1
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i
                  } else {
                    p = page - 3 + i
                  }
                  return (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next_page')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Edit dialog */}
      {editTarget && (
        <Dialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('categories_edit')}</DialogTitle>
              <DialogDescription>{t('categories_edit')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  {t('categories_name')}
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  {t('categories_parent')}
                </label>
                <Select
                  value={form.parent_id}
                  onValueChange={(v) => setForm({ ...form, parent_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('categories_no_parent')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">
                      {t('categories_no_parent')}
                    </SelectItem>
                    {parentOptions
                      .filter((opt) => opt.value !== String(editTarget.id))
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() =>
                  updateMutation.mutate({ id: editTarget.id, payload: form })
                }
                disabled={updateMutation.isPending || !form.name}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t('save_footer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>
                  {t('categories_delete_confirm_title')}
                </DialogTitle>
                <DialogDescription>
                  {t('categories_delete_confirm_message')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <span className="font-medium">{deleteTarget.name}</span>
              {deleteTarget.tecdoc_id && (
                <Badge variant="outline" className="ml-2 text-xs">
                  TecDoc {deleteTarget.tecdoc_id}
                </Badge>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget!.id)}
              disabled={deleteMutation.isPending}
              className="gap-2"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

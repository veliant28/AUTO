'use client'
import { can } from '@/lib/permissions'
import { useRequirePerm } from '@/hooks/useRequirePerm'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  FileDown,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  XCircle,
  Loader,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TablePagination } from '@/components/admin/TablePagination'
import { PageSizeSelect } from '@/components/admin/PageSizeSelect'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useTimezone, formatDate } from '@/hooks/useTimezone'
import { supplierBadgeClass, supplierBadgeLabel } from '@/lib/suppliers'

const statusIcons: Record<string, any> = {
  complete: CheckCircle2,
  promoted: CheckCircle2,
  failed: XCircle,
  processing: Loader,
  in_queue: Clock,
}

const statusColors: Record<string, string> = {
  complete: 'bg-green-500 text-white',
  promoted: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
  processing: 'bg-blue-500 text-white',
  in_queue: 'bg-yellow-500 text-white',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const columnHelper = createColumnHelper<any>()

export default function ImportPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const reqPerm = useRequirePerm()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportSupplier, setExportSupplier] = useState('')
  const [exportBrands, setExportBrands] = useState<number[]>([])
  const [exportCategories, setExportCategories] = useState<string[]>([])
  const [exportParams, setExportParams] = useState<any>(null)
  const [exportParamsLoading, setExportParamsLoading] = useState(false)
  const [exportParamsLoaded, setExportParamsLoaded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    ;(window as any).__openImportExport = () => setExportDialogOpen(true)
    return () => {
      delete (window as any).__openImportExport
    }
  }, [])

  const exportRequestMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/imports/export-request', {
        supplier: exportSupplier,
        format: 'xlsx',
        visible_brands_ids: exportBrands,
        categories_ids: exportCategories,
      })
      return data
    },
    onSuccess: () => {
      toast.success(t('import_request_started'))
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] })
      setExportDialogOpen(false)
      setExportBrands([])
      setExportCategories([])
    },
    onError: () => toast.error(t('import_request_error')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/imports/${id}`)
    },
    onSuccess: () => {
      toast.success(t('import_deleted'))
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] })
      setDeleteTarget(null)
    },
    onError: () => toast.error(t('import_delete_error')),
  })

  const promoteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/admin/imports/${id}/promote`)
    },
    onSuccess: () => {
      toast.success(t('import_promote_started'))
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] })
    },
    onError: () => toast.error(t('import_promote_error')),
  })

  const { data } = useQuery({
    queryKey: ['admin-imports', page, pageSize, search, supplier, status],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (supplier) params.supplier = supplier
      if (status) params.status = status
      const { data } = await api.get('/admin/imports', { params })
      return data as { items: any[]; total: number }
    },
    refetchInterval: 5000,
    enabled: hydrated && !!user,
  })

  const imports = useMemo(() => data?.items || [], [data])

  const columns = useMemo(() => {
    function getImportError(item: any): string | null {
      if (!item.error_message) return null
      try {
        const parsed = JSON.parse(item.error_message)
        if (parsed.code && parsed.params) {
          const key = `import_error_${parsed.code}`
          return t(key, parsed.params) as string
        }
      } catch {
        // not JSON — show as-is
      }
      return item.error_message
    }

    return [
      columnHelper.accessor('supplier', {
        header: t('import_supplier'),
        size: 100,
        cell: (info) => (
          <Badge
            className={`${supplierBadgeClass(info.getValue())} border-0 text-sm`}
            title={info.getValue()}
          >
            {supplierBadgeLabel(info.getValue())}
          </Badge>
        ),
      }),
      columnHelper.accessor('status', {
        header: t('import_status'),
        size: 110,
        cell: (info) => {
          const item = info.row.original
          const StatusIcon = statusIcons[item.status] || Clock
          return item.matched_items > 0 ? (
            <AnimatedBadge swapKey="promoted">
              <Badge className="bg-green-500 text-white border-0 text-sm gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('import_promoted')}
              </Badge>
            </AnimatedBadge>
          ) : (
            <>
              <AnimatedBadge swapKey={item.status}>
                <Badge
                  className={`${statusColors[item.status] || 'bg-gray-500 text-white'} border-0 text-sm gap-1`}
                >
                  <StatusIcon
                    className={`w-3.5 h-3.5 ${item.status === 'processing' ? 'animate-spin' : ''}`}
                  />
                  {t(`import_${item.status}`)}
                </Badge>
              </AnimatedBadge>
              {item.status === 'failed' && getImportError(item) && (
                <div className="text-xs text-red-400 mt-1 max-w-[200px] leading-tight">
                  {getImportError(item)}
                </div>
              )}
            </>
          )
        },
      }),
      columnHelper.accessor('progress', {
        header: t('import_progress'),
        size: 200,
        cell: (info) => {
          const item = info.row.original
          return (
            <div className="flex items-center gap-3 pr-4">
              <Progress
                value={item.progress || 0}
                className="h-2 flex-1"
                indicatorClassName={
                  item.status === 'failed'
                    ? 'bg-red-500'
                    : item.status === 'complete' || item.status === 'promoted'
                      ? 'bg-green-500'
                      : 'bg-blue-500'
                }
              />
              <span className="text-sm font-mono text-muted-foreground w-8 text-right">
                {item.progress || 0}%
              </span>
            </div>
          )
        },
      }),
      columnHelper.accessor('total_items', {
        header: t('import_items'),
        size: 80,
        cell: (info) => (info.getValue() > 0 ? fmt(info.getValue()) : '—'),
      }),
      columnHelper.accessor('file_size', {
        header: t('import_size'),
        size: 80,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {formatBytes(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('created_at', {
        header: t('import_date'),
        size: 170,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(info.getValue(), tz)}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-2">
            {(row.original.status === 'complete' ||
              row.original.status === 'promoted') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (!reqPerm('imports.create')) return
                      promoteMutation.mutate(row.original.id)
                    }}
                    disabled={promoteMutation.isPending}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('import_promote')}</TooltipContent>
              </Tooltip>
            )}
            {(row.original.status === 'complete' ||
              row.original.status === 'promoted' ||
              (row.original.status === 'failed' && row.original.file_size)) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/admin/imports/${row.original.id}/download`}
                    target="_blank"
                  >
                    <Button variant="outline" size="icon">
                      <Download className="w-4 h-4" />
                    </Button>
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('import_download')}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    if (!reqPerm('imports.delete')) return
                    setDeleteTarget(row.original)
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('delete')}</TooltipContent>
            </Tooltip>
          </div>
        ),
      }),
    ]
  }, [t, tz, promoteMutation, reqPerm])

  const table = useReactTable({
    data: imports,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: page - 1, pageSize })
          : updater
      setPage(next.pageIndex + 1)
    },
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil((data?.total || 0) / pageSize)),
  })

  const loadExportParams = async (supplierName: string) => {
    setExportSupplier(supplierName)
    setExportParams(null)
    setExportParamsLoaded(false)
    setExportBrands([])
    setExportCategories([])
    try {
      setExportParamsLoading(true)
      const { data } = await api.get(
        `/admin/imports/export-params/${supplierName}`,
      )
      setExportParams(data)
      setExportParamsLoaded(true)
      if (data.categories?.length > 0) {
        // Autonova returns price lists as categories. Preselect only the
        // newest one so different price levels are not mixed together.
        const initial =
          supplierName === 'AUTONOVA-D'
            ? data.categories.slice(0, 1)
            : data.categories
        setExportCategories(initial.map((c: any) => String(c.id)))
      }
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        ''
      toast.error(
        String(detail).slice(0, 500) || t('import_export_params_error'),
      )
    } finally {
      setExportParamsLoading(false)
    }
  }

  const toggleBrand = (id: number) => {
    setExportBrands((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    )
  }

  const toggleCategory = (id: string) => {
    setExportCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const noAutonovaPriceLists =
    exportSupplier === 'AUTONOVA-D' &&
    exportParamsLoaded &&
    !(exportParams?.categories?.length > 0)

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!can(user, 'imports.view')) return null

  const supplierLabel = t('import_supplier')

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('import_search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('import_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="complete">{t('import_complete')}</SelectItem>
            <SelectItem value="processing">{t('import_processing')}</SelectItem>
            <SelectItem value="failed">{t('import_failed')}</SelectItem>
            <SelectItem value="in_queue">{t('import_in_queue')}</SelectItem>
            <SelectItem value="promoted">{t('import_promoted')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={supplier}
          onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={supplierLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="GPL">GPL</SelectItem>
            <SelectItem value="UTR">UTR</SelectItem>
            <SelectItem value="AUTONOVA-D">AUTONOVA-D</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                {(!data?.items || data.items.length === 0) && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="p-6 text-center text-muted-foreground text-sm"
                    >
                      {t('import_empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination table={table} />
        </CardContent>
      </Card>

      <Dialog
        open={!!exportDialogOpen}
        onOpenChange={(open) => !open && setExportDialogOpen(false)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                <FileDown className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <DialogTitle>{t('import_request_title')}</DialogTitle>
                <DialogDescription>
                  {t('import_request_desc')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-4">
              <div className="flex justify-center gap-3">
                {['GPL', 'UTR', 'AUTONOVA-D'].map((s) => (
                  <Button
                    key={s}
                    variant={exportSupplier === s ? undefined : 'outline'}
                    className={
                      exportSupplier === s
                        ? `${supplierBadgeClass(s)} hover:opacity-90`
                        : ''
                    }
                    title={s}
                    onClick={() => loadExportParams(s)}
                  >
                    {supplierBadgeLabel(s)}
                  </Button>
                ))}
              </div>

              {exportParams && (
                <>
                  {exportParams.brands?.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        {t('import_brands')}
                      </label>
                      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto border rounded-lg p-2 bg-background">
                        {exportParams.brands.slice(0, 100).map((b: any) => (
                          <Badge
                            key={b.id}
                            variant={
                              exportBrands.includes(b.id)
                                ? 'default'
                                : 'outline'
                            }
                            className="cursor-pointer text-sm"
                            onClick={() => toggleBrand(b.id)}
                          >
                            {b.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {exportParams.categories?.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        {exportSupplier === 'AUTONOVA-D'
                          ? t('import_price_lists')
                          : t('import_categories')}
                      </label>
                      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto border rounded-lg p-2 bg-background">
                        {exportParams.categories.slice(0, 100).map((c: any) => (
                          <Badge
                            key={c.id}
                            variant={
                              exportCategories.includes(String(c.id))
                                ? 'default'
                                : 'outline'
                            }
                            className="cursor-pointer text-sm"
                            onClick={() => toggleCategory(String(c.id))}
                          >
                            {c.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {noAutonovaPriceLists && (
                <p className="text-sm text-muted-foreground text-center">
                  {t('import_no_price_lists')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            {exportParamsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
              </div>
            ) : (
              <span />
            )}
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!reqPerm('imports.create')) return
                exportRequestMutation.mutate()
              }}
              disabled={
                !exportSupplier ||
                !exportParamsLoaded ||
                noAutonovaPriceLists ||
                exportRequestMutation.isPending
              }
              className="gap-2"
            >
              {exportRequestMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {t('import_request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <DialogTitle>{t('import_delete_confirm_title')}</DialogTitle>
                <DialogDescription>
                  {t('import_delete_confirm_message')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge
                  className={`${supplierBadgeClass(deleteTarget.supplier)} border-0 text-sm`}
                  title={deleteTarget.supplier}
                >
                  {supplierBadgeLabel(deleteTarget.supplier)}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  {formatDate(deleteTarget.created_at, tz)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
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

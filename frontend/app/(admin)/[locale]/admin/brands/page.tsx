'use client'
import { can } from '@/lib/permissions'

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface BrandItem {
  id: number
  name: string
  total: number
  matched: number
  unmatched: number
  with_applicability: number
}

const columnHelper = createColumnHelper<BrandItem>()

function CoverageCell({ matched, total }: { matched: number; total: number }) {
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0
  let barColor: string
  if (pct >= 70) barColor = 'bg-green-500'
  else if (pct >= 30) barColor = 'bg-yellow-500'
  else if (pct >= 1) barColor = 'bg-orange-500'
  else barColor = 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <Progress
        value={pct}
        className="h-2.5 flex-1 max-w-[140px]"
        indicatorClassName={barColor}
      />
      <span
        className={`text-sm font-semibold w-8 text-right ${barColor.replace('bg-', 'text-')}`}
      >
        {pct}%
      </span>
    </div>
  )
}

export default function AdminBrandsPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-brands', page, pageSize, search],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (search) params.search = search
      const { data } = await api.get('/admin/brands', { params })
      return data as { items: BrandItem[]; total: number }
    },
    enabled: hydrated && !!user,
  })

  // Стабильная ссылка массива: иначе TanStack пересчитывает строки
  // на каждый рендер и страница крутит лишние перерисовки
  const items = useMemo(() => data?.items || [], [data])
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Колонки — те же дефиниции и рендер, что в таблице заказов
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: t('brands_brand'),
        size: 320,
        cell: (info) => (
          <span className="font-semibold text-sm">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('id', {
        header: t('brands_id'),
        size: 90,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('total', {
        header: t('brands_total'),
        size: 90,
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor('matched', {
        header: t('brands_matched'),
        size: 130,
        cell: (info) => (
          <span className="text-sm text-green-600">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('with_applicability', {
        header: t('brands_with_app'),
        size: 150,
        cell: (info) => (
          <span className="text-sm text-blue-600 font-semibold">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('unmatched', {
        header: t('brands_unmatched'),
        size: 130,
        cell: (info) => (
          <span className="text-sm text-red-500">{info.getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: 'coverage',
        header: t('brands_coverage'),
        size: 250,
        cell: ({ row }) => (
          <CoverageCell
            matched={row.original.with_applicability}
            total={row.original.total}
          />
        ),
      }),
    ],
    [t],
  )

  const table = useReactTable({
    data: items,
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
    pageCount: totalPages,
  })

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!can(user, 'brands.view')) return null

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder={t('brands_search')}
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
          <SelectTrigger className="w-[100px] h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="500">500</SelectItem>
            <SelectItem value="1000">1000</SelectItem>
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
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-b last:border-0">
                      <td colSpan={columns.length} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && items.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="p-6 text-center text-muted-foreground text-sm"
                    >
                      {t('brands_empty')}
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  table.getRowModel().rows.map((row) => (
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
              </tbody>
            </table>
          </div>
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
                  onClick={() => table.previousPage()}
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
                      onClick={() => table.setPageIndex(p - 1)}
                    >
                      {p}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => table.nextPage()}
                >
                  {t('next_page')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

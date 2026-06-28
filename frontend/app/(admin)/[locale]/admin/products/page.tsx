'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package,
  Loader2,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  Plus,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
}

const SNAKE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#e11d48',
  '#a855f7',
  '#10b981',
]

const WAREHOUSE_LABELS: Record<string, string> = {
  '1': 'Полтава',
  '2': 'Тернополь',
  '4': 'Борисполь',
}

function StockSnake({ offers }: { offers: any[] }) {
  const segments: { supplier: string; key: string; value: number }[] = []
  for (const offer of offers) {
    const entries = Object.entries(offer.stock_regions || {}).filter(
      ([, v]) => typeof v === 'number',
    )
    for (const [key, value] of entries) {
      segments.push({
        supplier: offer.supplier_name,
        key,
        value: Number(value),
      })
    }
  }
  if (!segments.length)
    return <span className="text-xs text-muted-foreground">—</span>
  const getColor = (qty: number) => {
    if (qty <= 0) return '#d1d5db'
    if (qty <= 3) return '#ef4444'
    if (qty <= 6) return '#f59e0b'
    return '#22c55e'
  }
  const sorted = segments
    .map((s) => ({ ...s }))
    .sort((a, b) => {
      const rank = (v: number) => (v >= 7 ? 1 : v >= 4 ? 2 : v >= 1 ? 3 : 4)
      const ra = rank(a.value),
        rb = rank(b.value)
      return ra !== rb ? ra - rb : b.value - a.value
    })
  return (
    <div className="max-w-full overflow-x-auto py-0.5">
      <div className="inline-flex min-w-max flex-nowrap items-center gap-px rounded-lg border p-px bg-muted/30">
        {sorted.map((seg, i) => {
          const color = getColor(seg.value)
          return (
            <Tooltip key={`${seg.supplier}-${seg.key}-${i}`}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-[3px] px-1 text-[11px] font-semibold leading-none text-white"
                  style={{ backgroundColor: color }}
                >
                  {seg.value > 99 ? '99+' : seg.value}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-0.5 text-xs">
                  <span className="font-semibold">{seg.supplier}</span>
                  <span className="text-muted-foreground">
                    {WAREHOUSE_LABELS[seg.key] ?? seg.key}: {seg.value}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

interface ProcessingOrder {
  id: number
  order_number: string
}

function AddToOrderDropdown({
  productId,
  t,
}: {
  productId: number
  t: (key: string) => string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['admin-processing-orders'],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders', {
        params: { status: 'processing', page_size: 500 },
      })
      return data as { items: ProcessingOrder[] }
    },
    enabled: open,
    staleTime: 30000,
  })

  const addMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await api.post(`/admin/orders/${orderId}/items`, {
        part_id: productId,
        quantity: 1,
      })
    },
    onSuccess: () => {
      toast.success(t('product_added_to_order'))
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-detail'] })
      setOpen(false)
      setSearch('')
    },
    onError: () => {
      toast.error(t('product_add_to_order_error'))
    },
  })

  const filteredOrders = useMemo(() => {
    if (!ordersData?.items) return []
    const q = search.toLowerCase()
    return ordersData.items.filter((o) =>
      o.order_number.toLowerCase().includes(q),
    )
  }, [ordersData, search])

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIdx(0)
  }, [search])

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (itemRefs.current[highlightedIdx]) {
      itemRefs.current[highlightedIdx]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [highlightedIdx])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIdx((prev) =>
          Math.min(prev + 1, filteredOrders.length - 1),
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIdx((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && filteredOrders[highlightedIdx]) {
        e.preventDefault()
        addMutation.mutate(filteredOrders[highlightedIdx].id)
      }
    },
    [filteredOrders, highlightedIdx, addMutation],
  )

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setSearch('')
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('add_to_order')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-[320px] p-2"
        align="end"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <Input
          placeholder={t('add_to_order_search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 mb-1"
          autoFocus
        />
        <div
          ref={listRef}
          className="max-h-[300px] overflow-y-auto space-y-0.5"
          role="listbox"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('no_processing_orders')}
            </p>
          ) : (
            filteredOrders.map((order, idx) => (
              <div
                key={order.id}
                ref={(el) => {
                  itemRefs.current[idx] = el
                }}
                role="option"
                aria-selected={idx === highlightedIdx}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  idx === highlightedIdx
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                }`}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onClick={() => addMutation.mutate(order.id)}
              >
                <span className="font-mono text-sm">{order.order_number}</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function AdminProductsPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [editProduct, setEditProduct] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    article: '',
    brand: '',
    name: '',
    sku: '',
    description: '',
    category_id: null as number | null,
    is_active: true,
    image_url: '',
  })
  useEffect(() => {
    setHydrated(true)
  }, [])

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/products/${id}`)
    },
    onSuccess: () => {
      toast.success(t('products_delete_success'))
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      setDeleteTarget(null)
    },
    onError: () => {
      toast.error(t('products_delete_error'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await api.put(`/admin/products/${id}`, data)
    },
    onSuccess: () => {
      toast.success(t('saved'))
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      setEditProduct(null)
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data } = await api.get('/admin/categories', {
        params: { page: 1, page_size: 500 },
      })
      return data?.items || []
    },
  })

  const openEdit = (product: any) => {
    setEditForm({
      article: product.article || '',
      brand: product.brand || '',
      name: product.name || '',
      sku: product.sku || '',
      description: product.description || '',
      category_id: product.category_id || null,
      is_active: product.is_active ?? true,
      image_url: product.image_url || '',
    })
    setEditProduct(product)
  }

  const { data } = useQuery({
    queryKey: ['admin-products', page, pageSize, search, supplier, status],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (search) params.search = search
      if (supplier) params.supplier = supplier
      if (status) params.status = status
      const { data } = await api.get('/admin/products', { params })
      return data
    },
    enabled: hydrated && !!user,
  })

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('search_users')}
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
            <SelectItem value="1000">1000</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('products_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="active">{t('products_active')}</SelectItem>
            <SelectItem value="inactive">{t('products_inactive')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={supplier}
          onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('products_supplier')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="UTR">UTR</SelectItem>
            <SelectItem value="GPL">GPL</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {!data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground w-[50px]">
                        SKU
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[150px]">
                        {t('products_article')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        {t('products_name')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[110px]">
                        {t('products_brand')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">
                        {t('products_supplier')}
                      </th>
                      <th className="text-center p-3 font-medium text-muted-foreground w-[100px]">
                        {t('products_status')}
                      </th>
                      <th className="text-right p-3 font-medium text-muted-foreground w-[110px]">
                        {t('products_price')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[250px]">
                        {t('products_stock')}
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground w-[110px]">
                        {t('actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items?.map((item: any) => (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="p-3 font-mono text-sm truncate">
                          {item.sku || '—'}
                        </td>
                        <td className="p-3 font-mono text-sm">
                          {item.article}
                        </td>
                        <td className="p-3 text-sm truncate">
                          {item.name || '—'}
                        </td>
                        <td className="p-3 text-sm font-semibold truncate">
                          {item.brand || '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {item.offers?.map((o: any) => (
                              <Badge
                                key={o.supplier_name}
                                className={`${supplierColors[o.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}
                              >
                                {o.supplier_name}
                              </Badge>
                            ))}
                            {(!item.offers || item.offers.length === 0) && (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-left">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {item.is_active ? (
                                <Badge className="bg-green-500 text-white border-0 text-sm">
                                  {t('products_active')}
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-500 text-white border-0 text-sm">
                                  {t('products_inactive')}
                                </Badge>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.is_active
                                ? t('products_active')
                                : t('products_inactive')}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="p-3 text-right text-sm">
                          {item.min_price != null ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-blue-500 text-white border-0 text-sm font-semibold cursor-pointer">
                                  {Number(item.min_price).toFixed(2)} UAH
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1 text-xs">
                                  {item.final_price != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold">
                                        FIN:
                                      </span>
                                      <span>
                                        {Number(item.final_price).toFixed(2)}{' '}
                                        UAH
                                        {item.margin_percent != null && (
                                          <span className="text-muted-foreground">
                                            {' '}
                                            (+{item.margin_percent}%)
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {item.offers?.map((o: any, i: number) => (
                                    <div key={i}>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">
                                          {o.supplier_name}:
                                        </span>
                                        <span>
                                          {Number(o.price).toFixed(2)}{' '}
                                          {o.currency || 'UAH'}
                                        </span>
                                      </div>
                                      <div className="leading-tight">
                                        {o.updated_at
                                          ? new Date(
                                              o.updated_at + 'Z',
                                            ).toLocaleString()
                                          : '—'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3">
                          <StockSnake offers={item.offers || []} />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <AddToOrderDropdown productId={item.id} t={t} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => openEdit(item)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('edit')}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('delete')}</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!data?.items || data.items.length === 0) && (
                      <tr>
                        <td
                          colSpan={9}
                          className="p-6 text-center text-muted-foreground text-sm"
                        >
                          {t('products_empty') || t('roles_empty')}
                        </td>
                      </tr>
                    )}
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
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editProduct}
        onOpenChange={(open) => !open && setEditProduct(null)}
      >
        <DialogContent
          className="w-[90vw] max-w-[1000px] h-[85vh] overflow-hidden flex flex-col !p-0 !gap-0"
          aria-describedby={undefined}
        >
          <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
            <DialogTitle className="text-2xl font-bold">
              {t('edit')}
            </DialogTitle>
          </DialogHeader>
          <Separator className="flex-shrink-0" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-[300px_1fr] gap-6 h-full">
              {/* Left: Photo */}
              <div className="space-y-4">
                <div
                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600 cursor-pointer hover:opacity-90 transition-opacity relative overflow-hidden"
                  onClick={() =>
                    document.getElementById('product-image-input')?.click()
                  }
                >
                  {editProduct?.image_url ? (
                    <img
                      src={editProduct.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-6xl font-bold text-white/40 select-none">
                      {editForm.brand
                        ? editForm.brand.charAt(0).toUpperCase()
                        : '?'}
                    </span>
                  )}
                </div>
                <input
                  id="product-image-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const url = URL.createObjectURL(file)
                      setEditForm((f) => ({ ...f, image_url: url }))
                    }
                  }}
                />
                <Input
                  placeholder="URL фото"
                  value={editForm.image_url}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, image_url: e.target.value }))
                  }
                />
              </div>
              {/* Right: Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      {t('brand')}
                    </span>
                    <Input
                      value={editForm.brand}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, brand: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      {t('article')}
                    </span>
                    <Input
                      value={editForm.article}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, article: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className="text-sm text-muted-foreground">
                    {t('name')}
                  </span>
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">SKU</span>
                    <Input
                      value={editForm.sku || ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, sku: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      {t('category')}
                    </span>
                    <Select
                      value={editForm.category_id?.toString() || ''}
                      onValueChange={(v) =>
                        setEditForm((f) => ({
                          ...f,
                          category_id: v ? Number(v) : null,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {(categories || []).map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      Цена поставщика
                    </span>
                    <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm h-10">
                      {editProduct?.min_price
                        ? `${editProduct.min_price} ₴`
                        : '—'}
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      Цена с наценкой
                    </span>
                    <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm h-10">
                      {editProduct?.final_price
                        ? `${editProduct.final_price} ₴`
                        : '—'}
                      {editProduct?.margin_percent != null &&
                        editProduct.final_price != null && (
                          <span className="text-muted-foreground ml-1">
                            (+{editProduct.margin_percent}%)
                          </span>
                        )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {t('status')}
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={editForm.is_active}
                      onCheckedChange={(checked) =>
                        setEditForm((f) => ({ ...f, is_active: !!checked }))
                      }
                      className="cursor-pointer"
                    />
                    <span className="text-sm cursor-pointer">
                      {editForm.is_active ? 'Активен' : 'Деактивирован'}
                    </span>
                  </label>
                </div>
                {!editForm.is_active && editProduct?.deactivation_reason && (
                  <div className="grid gap-1">
                    <span className="text-sm text-muted-foreground">
                      Причина деактивации
                    </span>
                    <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm h-10">
                      {editProduct.deactivation_reason}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Separator className="flex-shrink-0" />
          <div className="flex-shrink-0 p-4 pt-3 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditProduct(null)}>
              {t('cancel')}
            </Button>
            <Button
              className="gap-2"
              onClick={() =>
                updateMutation.mutate({ id: editProduct.id, data: editForm })
              }
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t('save')}
            </Button>
          </div>
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
                <DialogTitle>{t('products_delete_confirm_title')}</DialogTitle>
                <DialogDescription>
                  {t('products_delete_confirm_message')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium truncate min-w-0">
                  <span className="font-semibold">{deleteTarget.brand}</span>{' '}
                  <span className="font-mono">{deleteTarget.article}</span>
                </span>
                <div className="flex gap-1 shrink-0 ml-2">
                  {deleteTarget.offers?.map((o: any) => (
                    <Badge
                      key={o.supplier_name}
                      className={`${supplierColors[o.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}
                    >
                      {o.supplier_name}
                    </Badge>
                  ))}
                </div>
              </div>
              {deleteTarget.name && (
                <p className="mt-1 text-muted-foreground truncate">
                  {deleteTarget.name}
                </p>
              )}
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

'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Loader2, CheckCircle2, XCircle, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
};

const SNAKE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#e11d48', '#a855f7', '#10b981'];

function StockSnake({ offers }: { offers: any[] }) {
  const segments: { supplier: string; key: string; value: number }[] = [];
  for (const offer of offers) {
    const entries = Object.entries(offer.stock_regions || {}).filter(([, v]) => typeof v === 'number');
    for (const [key, value] of entries) {
      segments.push({ supplier: offer.supplier_name, key, value: Number(value) });
    }
  }
  if (!segments.length) return <span className="text-xs text-muted-foreground">—</span>;
  const getColor = (qty: number) => {
    if (qty <= 0) return '#d1d5db';
    if (qty <= 3) return '#ef4444';
    if (qty <= 6) return '#f59e0b';
    return '#22c55e';
  };
  const sorted = segments
    .map((s) => ({ ...s }))
    .sort((a, b) => {
      const rank = (v: number) => v >= 7 ? 1 : v >= 4 ? 2 : v >= 1 ? 3 : 4;
      const ra = rank(a.value), rb = rank(b.value);
      return ra !== rb ? ra - rb : b.value - a.value;
    });
  return (
    <div className="max-w-full overflow-x-auto py-0.5">
      <div className="inline-flex min-w-max flex-nowrap items-center gap-px rounded-lg border p-px bg-muted/30">
        {sorted.map((seg, i) => {
          const color = getColor(seg.value);
          return (
            <Tooltip key={`${seg.supplier}-${seg.key}-${i}`}>
              <TooltipTrigger asChild>
                <span className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-[3px] px-1 text-[11px] font-semibold leading-none text-white" style={{ backgroundColor: color }}>
                  {seg.value > 99 ? '99+' : seg.value}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-0.5 text-xs">
                  <span className="font-semibold">{seg.supplier}</span>
                  <span className="text-muted-foreground">{seg.key}: {seg.value}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  useEffect(() => { setHydrated(true); }, []);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/products/${id}`);
    },
    onSuccess: () => {
      toast.success(t('products_delete_success'));
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error(t('products_delete_error'));
    },
  });

  const { data } = useQuery({
    queryKey: ['admin-products', page, pageSize, search, supplier, status],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (search) params.search = search;
      if (supplier) params.supplier = supplier;
      if (status) params.status = status;
      const { data } = await api.get('/admin/products', { params });
      return data;
    },
    enabled: hydrated && !!user,
  });

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('search_users')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="500">500</SelectItem>
            <SelectItem value="1000">1000</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('products_status')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="active">{t('products_active')}</SelectItem><SelectItem value="inactive">{t('products_inactive')}</SelectItem></SelectContent>
        </Select>
        <Select value={supplier} onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('products_supplier')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="UTR">UTR</SelectItem><SelectItem value="GPL">GPL</SelectItem></SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground w-[120px]">{t('products_sku')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[90px]">{t('products_article')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[220px]">{t('products_name')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[110px]">{t('products_brand')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">{t('products_supplier')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[20px]">{t('products_status')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[110px]">{t('products_price')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[250px]">{t('products_stock')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[80px]">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item: any) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-sm truncate">{item.sku || '—'}</td>
                    <td className="p-3 font-mono text-sm">{item.article}</td>
                    <td className="p-3 text-sm truncate">{item.name || '—'}</td>
                    <td className="p-3 text-sm font-semibold truncate">{item.brand || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {item.offers?.map((o: any) => (
                          <Badge key={o.supplier_name} className={`${supplierColors[o.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}>{o.supplier_name}</Badge>
                        ))}
                        {(!item.offers || item.offers.length === 0) && <span className="text-sm text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {item.total_stock > 0 ? (
                            <Badge className="bg-green-500 border-0 h-6 w-6 p-0 flex items-center justify-center"><CheckCircle2 className="w-3.5 h-3.5" /></Badge>
                          ) : (
                            <Badge className="bg-gray-400 border-0 h-6 w-6 p-0 flex items-center justify-center"><XCircle className="w-3.5 h-3.5" /></Badge>
                          )}
                        </TooltipTrigger>
                        <TooltipContent>{item.total_stock > 0 ? t('products_active') : t('products_inactive')}</TooltipContent>
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
                            <div className="grid gap-1.5 text-xs">
                              {item.offers?.map((o: any, i: number) => (
                                <div key={i}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{o.supplier_name}:</span>
                                    <span>{Number(o.price).toFixed(2)} {o.currency || 'UAH'}</span>
                                  </div>
                                    <div className="leading-tight">
                                    {o.updated_at ? new Date(o.updated_at + 'Z').toLocaleString() : '—'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : '—'}
                    </td>
                    <td className="p-3"><StockSnake offers={item.offers || []} /></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger><TooltipContent>{t('edit')}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger><TooltipContent>{t('delete')}</TooltipContent></Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-sm">{t('products_empty') || t('roles_empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('prev_page')}</Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('next_page')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('products_delete_confirm_title')}</DialogTitle>
                <DialogDescription>{t('products_delete_confirm_message')}</DialogDescription>
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
                    <Badge key={o.supplier_name} className={`${supplierColors[o.supplier_name] || 'bg-gray-500 text-white'} border-0 text-sm`}>{o.supplier_name}</Badge>
                  ))}
                </div>
              </div>
              {deleteTarget.name && <p className="mt-1 text-muted-foreground truncate">{deleteTarget.name}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} className="gap-2">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

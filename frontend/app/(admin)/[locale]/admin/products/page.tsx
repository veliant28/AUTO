'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Package, Loader2, CheckCircle2, XCircle, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
};

const SNAKE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#e11d48', '#a855f7', '#10b981'];

function StockSnake({ regions, supplier }: { regions: Record<string, number> | null; supplier: string }) {
  const entries = Object.entries(regions || {}).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return <span className="text-xs text-muted-foreground">—</span>;
  const getColor = (qty: number) => {
    if (qty <= 0) return '#d1d5db';
    if (qty <= 3) return '#ef4444';
    if (qty <= 6) return '#f59e0b';
    return '#22c55e';
  };
  const sorted = entries
    .map(([key, value]) => ({ key, value: Number(value) }))
    .sort((a, b) => {
      const rank = (v: number) => v >= 7 ? 1 : v >= 4 ? 2 : v >= 1 ? 3 : 4;
      const ra = rank(a.value), rb = rank(b.value);
      return ra !== rb ? ra - rb : b.value - a.value;
    });
  return (
    <div className="max-w-full overflow-x-auto py-0.5">
      <div className="inline-flex min-w-max flex-nowrap items-center gap-px rounded-lg border p-px bg-muted/30">
        {sorted.map((wh) => {
          const color = getColor(wh.value);
          return (
            <Tooltip key={wh.key}>
              <TooltipTrigger asChild>
                <span className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-[3px] px-1 text-[11px] font-semibold leading-none text-white" style={{ backgroundColor: color }}>
                  {wh.value > 99 ? '99+' : wh.value}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-0.5 text-xs">
                  <span className="font-semibold">{supplier}</span>
                  <span className="text-muted-foreground">{wh.key}: {wh.value}</span>
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

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
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('products_status')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="active">{t('products_active')}</SelectItem><SelectItem value="inactive">{t('products_inactive')}</SelectItem></SelectContent>
        </Select>
        <Select value={supplier} onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('products_supplier')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="UTR">UTR</SelectItem><SelectItem value="GPL">GPL</SelectItem></SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground w-[130px]">{t('products_article')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('products_name')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[180px]">{t('products_brand')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[90px]">{t('products_supplier')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">{t('products_status')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[130px]">{t('products_price')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('products_stock')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[90px]">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item: any) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{item.article}</td>
                    <td className="p-3 text-xs max-w-[200px] truncate">{item.name || '—'}</td>
                    <td className="p-3 text-xs font-semibold">{item.brand || '—'}</td>
                    <td className="p-3"><Badge className={`${supplierColors[item.supplier] || 'bg-gray-500 text-white'} border-0 text-xs`}>{item.supplier}</Badge></td>
                    <td className="p-3 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {item.stock_total > 0 ? (
                            <Badge className="bg-green-500 border-0 h-6 w-6 p-0 flex items-center justify-center"><CheckCircle2 className="w-3.5 h-3.5" /></Badge>
                          ) : (
                            <Badge className="bg-gray-400 border-0 h-6 w-6 p-0 flex items-center justify-center"><XCircle className="w-3.5 h-3.5" /></Badge>
                          )}
                        </TooltipTrigger>
                        <TooltipContent>{item.stock_total > 0 ? t('products_active') : t('products_inactive')}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="p-3 text-right text-xs">{item.price != null ? <Badge className="bg-blue-500 text-white border-0 text-xs font-semibold">{Number(item.price).toFixed(2)} {item.currency || ''}</Badge> : '—'}</td>
                    <td className="p-3"><StockSnake regions={item.stock_regions} supplier={item.supplier} /></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger><TooltipContent>{t('edit')}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger><TooltipContent>{t('delete')}</TooltipContent></Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">{t('products_empty') || t('roles_empty')}</td></tr>
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
    </div>
  );
}

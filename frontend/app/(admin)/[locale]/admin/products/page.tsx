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

function StockSnake({ regions, supplier }: { regions: Record<string, number> | null; supplier: string }) {
  const entries = Object.entries(regions || {}).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return <span className="text-xs text-muted-foreground">—</span>;
  const resolveTone = (qty: number) => {
    if (qty <= 0) return { bg: '#e5e7eb', text: '#6b7280' };
    if (qty <= 3) return { bg: '#fecaca', text: '#dc2626' };
    if (qty <= 6) return { bg: '#fed7aa', text: '#ea580c' };
    return { bg: '#bbf7d0', text: '#16a34a' };
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
          const tone = resolveTone(wh.value);
          return (
            <Tooltip key={wh.key}>
              <TooltipTrigger asChild>
                <span className="inline-flex h-6 min-w-6 cursor-default items-center justify-center rounded-[3px] px-1 text-[11px] font-semibold leading-none" style={{ backgroundColor: tone.bg, color: tone.text }}>
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
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const { data } = useQuery({
    queryKey: ['admin-products', page, search, supplier, status],
    queryFn: async () => {
      const params: any = { page, page_size: 25 };
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

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('search_users')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={supplier} onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('products_supplier')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="UTR">UTR</SelectItem><SelectItem value="GPL">GPL</SelectItem></SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('products_status')} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('products_filter_all')}</SelectItem><SelectItem value="active">{t('products_active')}</SelectItem><SelectItem value="inactive">{t('products_inactive')}</SelectItem></SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground w-[130px]">{t('products_article')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('products_name')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[90px]">{t('products_brand')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[80px]">{t('products_supplier')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[85px]">{t('products_status')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[100px]">{t('products_price')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('products_stock')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[75px]">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item: any) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{item.article}</td>
                    <td className="p-3 text-xs max-w-[200px] truncate">{item.name || '—'}</td>
                    <td className="p-3 text-xs">{item.brand || '—'}</td>
                    <td className="p-3"><Badge className="bg-blue-500 text-white border-0 text-xs">{item.supplier}</Badge></td>
                    <td className="p-3"><span className="flex items-center gap-1 text-xs">{item.stock_total > 0 ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" />{t('products_active')}</> : <><XCircle className="w-3.5 h-3.5 text-muted-foreground" />{t('products_inactive')}</>}</span></td>
                    <td className="p-3 text-right text-xs">{item.price != null ? `${item.price} ${item.currency || ''}` : '—'}</td>
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
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Tag, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface BrandItem {
  id: number;
  name: string;
  total: number;
  matched: number;
  unmatched: number;
  with_applicability: number;
}

function CoverageCell({ matched, total }: { matched: number; total: number }) {
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  let barColor: string;
  if (pct >= 70) barColor = 'bg-green-500';
  else if (pct >= 30) barColor = 'bg-yellow-500';
  else if (pct >= 1) barColor = 'bg-orange-500';
  else barColor = 'bg-red-500';

  return (
    <div className="flex items-center gap-3 justify-center px-2">
      <Progress value={pct} className="h-2.5 flex-1 max-w-[140px]" indicatorClassName={barColor} />
      <span className={`text-sm font-semibold w-8 text-right ${barColor.replace('bg-', 'text-')}`}>{pct}%</span>
    </div>
  );
}

export default function AdminBrandsPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const { data } = useQuery({
    queryKey: ['admin-brands', page, pageSize, search],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (search) params.search = search;
      const { data } = await api.get('/admin/brands', { params });
      return data as { items: BrandItem[]; total: number };
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
          <Input className="pl-9" placeholder={t('brands_search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="500">500</SelectItem><SelectItem value="1000">1000</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('brands_brand')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">{t('brands_id')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">{t('brands_total')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[100px]">{t('brands_matched')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[100px]">{t('brands_with_app')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[110px]">{t('brands_unmatched')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-[250px]">{t('brands_coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-semibold text-sm">{item.name}</td>
                    <td className="p-3 text-center text-sm text-muted-foreground">{item.id}</td>
                    <td className="p-3 text-center text-sm">{item.total}</td>
                    <td className="p-3 text-center text-sm text-green-600">{item.matched}</td>
                    <td className="p-3 text-center text-sm text-blue-600 font-semibold">{item.with_applicability}</td>
                    <td className="p-3 text-center text-sm text-red-500">{item.unmatched}</td>
                    <td className="p-3"><CoverageCell matched={item.with_applicability} total={item.total} /></td>
                  </tr>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">{t('brands_empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('prev_page')}</Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) { p = i + 1; }
                  else if (page <= 4) { p = i + 1; }
                  else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
                  else { p = page - 3 + i; }
                  return <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p}</Button>;
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

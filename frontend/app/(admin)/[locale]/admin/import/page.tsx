'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown, Loader2, Search, Trash2, AlertTriangle, CheckCircle2, Clock, Download, XCircle, Loader, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useTimezone, formatDate } from '@/hooks/useTimezone';

const supplierColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
};

const statusIcons: Record<string, any> = {
  complete: CheckCircle2,
  failed: XCircle,
  processing: Loader,
  in_queue: Clock,
};

const statusColors: Record<string, string> = {
  complete: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
  processing: 'bg-blue-500 text-white',
  in_queue: 'bg-yellow-500 text-white',
};

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const tz = useTimezone();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSupplier, setExportSupplier] = useState('');
  const [exportBrands, setExportBrands] = useState<number[]>([]);
  const [exportCategories, setExportCategories] = useState<string[]>([]);
  const [exportParams, setExportParams] = useState<any>(null);
  const [exportParamsLoading, setExportParamsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    (window as any).__openImportExport = () => setExportDialogOpen(true);
    return () => { delete (window as any).__openImportExport; };
  }, []);

  const exportRequestMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/imports/export-request', {
        supplier: exportSupplier,
        format: 'xlsx',
        visible_brands_ids: exportBrands,
        categories_ids: exportCategories,
      });
      return data;
    },
    onSuccess: () => {
      toast.success(t('import_request_started'));
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] });
      setExportDialogOpen(false);
      setExportBrands([]);
      setExportCategories([]);
    },
    onError: () => toast.error(t('import_request_error')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/imports/${id}`);
    },
    onSuccess: () => {
      toast.success(t('import_deleted'));
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('import_delete_error')),
  });

  const promoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/admin/imports/${id}/promote`);
      return data as { ok: boolean; promoted: number };
    },
    onSuccess: (result) => {
      toast.success(t('import_promote_success', { count: result.promoted }));
      queryClient.invalidateQueries({ queryKey: ['admin-imports'] });
    },
    onError: () => toast.error(t('import_promote_error')),
  });

  const { data } = useQuery({
    queryKey: ['admin-imports', page, pageSize, search, supplier, status],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (supplier) params.supplier = supplier;
      if (status) params.status = status;
      const { data } = await api.get('/admin/imports', { params });
      return data as { items: any[]; total: number };
    },
    refetchInterval: 5000,
    enabled: hydrated && !!user,
  });

  const loadExportParams = async (supplierName: string) => {
    setExportSupplier(supplierName);
    setExportParams(null);
    setExportBrands([]);
    setExportCategories([]);
    try {
      setExportParamsLoading(true);
      const { data } = await api.get(`/admin/imports/export-params/${supplierName}`);
      setExportParams(data);
      if (data.categories?.length > 0) {
        setExportCategories(data.categories.map((c: any) => String(c.id)));
      }
    } catch {
      toast.error(t('import_export_params_error'));
    } finally {
      setExportParamsLoading(false);
    }
  };

  const toggleBrand = (id: number) => {
    setExportBrands((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: string) => {
    setExportCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const supplierLabel = t('import_supplier');

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('import_search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="500">500</SelectItem><SelectItem value="1000">1000</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('import_status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="complete">{t('import_complete')}</SelectItem>
            <SelectItem value="processing">{t('import_processing')}</SelectItem>
            <SelectItem value="failed">{t('import_failed')}</SelectItem>
            <SelectItem value="in_queue">{t('import_in_queue')}</SelectItem>
            <SelectItem value="promoted">{t('import_promoted')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplier} onValueChange={(v) => setSupplier(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={supplierLabel} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products_filter_all')}</SelectItem>
            <SelectItem value="GPL">GPL</SelectItem>
            <SelectItem value="UTR">UTR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground w-[100px]">{supplierLabel}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[110px]">{t('import_status')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[200px]">{t('import_progress')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[80px]">{t('import_items')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground w-[80px]">{t('import_size')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[170px]">{t('import_date')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-[80px]">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((item: any) => {
                  const StatusIcon = statusIcons[item.status] || Clock;
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <Badge className={`${supplierColors[item.supplier] || 'bg-gray-500 text-white'} border-0 text-sm`}>
                          {item.supplier}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {item.matched_items > 0 ? (
                          <Badge className="bg-green-500 text-white border-0 text-sm gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('import_promoted')}
                          </Badge>
                        ) : (
                          <Badge className={`${statusColors[item.status] || 'bg-gray-500 text-white'} border-0 text-sm gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {t(`import_${item.status}`)}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3 pr-4">
                          <Progress
                            value={item.progress || 0}
                            className="h-2 flex-1"
                            indicatorClassName={
                              item.status === 'failed' ? 'bg-red-500' :
                              item.status === 'complete' ? 'bg-green-500' :
                              'bg-blue-500'
                            }
                          />
                          <span className="text-sm font-mono text-muted-foreground w-8 text-right">{item.progress || 0}%</span>
                        </div>
                      </td>
                       <td className="p-3 text-right text-sm">{item.total_items > 0 ? item.total_items.toLocaleString() : '—'}</td>
                      <td className="p-3 text-right text-sm text-muted-foreground">{formatBytes(item.file_size)}</td>
                      <td className="p-3 text-sm text-muted-foreground">{formatDate(item.created_at, tz)}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {item.status === 'complete' && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => promoteMutation.mutate(item.id)} disabled={promoteMutation.isPending}>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('import_promote')}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/imports/${item.id}/download`} target="_blank">
                                    <Button variant="outline" size="icon" className="h-7 w-7">
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>{t('import_download')}</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(item)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('delete')}</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!data?.items || data.items.length === 0) && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">{t('import_empty')}</td></tr>
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
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p}</Button>;
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('next_page')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!exportDialogOpen} onOpenChange={(open) => !open && setExportDialogOpen(false)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                <FileDown className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <DialogTitle>{t('import_request_title')}</DialogTitle>
                <DialogDescription>{t('import_request_desc')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-4">
              <div className="flex justify-center gap-3">
                {['GPL', 'UTR'].map((s) => (
                  <Button
                    key={s}
                    variant={exportSupplier === s ? undefined : 'outline'}
                    className={exportSupplier === s ? `${supplierColors[s] || 'bg-gray-500'} text-white hover:opacity-90` : ''}
                    onClick={() => loadExportParams(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              {exportParams && (
                <>
                  {exportParams.brands?.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">{t('import_brands')}</label>
                      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto border rounded-lg p-2 bg-background">
                        {exportParams.brands.slice(0, 100).map((b: any) => (
                          <Badge
                            key={b.id}
                            variant={exportBrands.includes(b.id) ? 'default' : 'outline'}
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
                      <label className="text-sm font-medium mb-1 block">{t('import_categories')}</label>
                      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto border rounded-lg p-2 bg-background">
                        {exportParams.categories.slice(0, 100).map((c: any) => (
                          <Badge
                            key={c.id}
                            variant={exportCategories.includes(String(c.id)) ? 'default' : 'outline'}
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
            </div>
          </div>

          <DialogFooter>
            {exportParamsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
              </div>
            ) : <span />}
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>{t('cancel')}</Button>
            <Button
              onClick={() => exportRequestMutation.mutate()}
              disabled={!exportSupplier || exportRequestMutation.isPending}
              className="gap-2"
            >
              {exportRequestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {t('import_request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('import_delete_confirm_title')}</DialogTitle>
                <DialogDescription>{t('import_delete_confirm_message')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={`${supplierColors[deleteTarget.supplier] || 'bg-gray-500 text-white'} border-0 text-sm`}>
                  {deleteTarget.supplier}
                </Badge>
                <span className="text-muted-foreground text-sm">{formatDate(deleteTarget.created_at, tz)}</span>
              </div>
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

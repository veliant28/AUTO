'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Play, Square, Minus, Plus, CheckSquare, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Save, Plug, Copy, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import api from '@/lib/api';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type Tab = 'dashboard' | 'batch' | 'settings';

interface DashboardData {
  used: number;
  remaining: number;
  limit: number;
  exhausted: boolean;
  hourly: { hour: string; count: number }[];
}

interface ArticleItem {
  id: number;
  supplier: string;
  article: string;
  brand: string | null;
  name: string | null;
  price: number | null;
  currency: string | null;
  stock_total: number;
  match_status: string;
  attempts: number;
  last_attempt_at: string | null;
}

type PieLabelLayoutParams = {
  dataIndex?: number;
  viewRect?: { x: number; y: number; width: number; height: number };
  labelRect?: { x: number; y: number; width: number; height: number };
  rect?: { x: number; y: number; width: number; height: number };
};

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let n = angle % twoPi;
  if (n <= -Math.PI) n += twoPi;
  else if (n > Math.PI) n -= twoPi;
  return n;
}

function shiftPieLabelAlongArcNearEdge(params: PieLabelLayoutParams, sliceValues: number[]) {
  const labelRect = params.labelRect;
  const pieRect = params.rect;
  const viewRect = params.viewRect || params.rect;
  if (!labelRect || !pieRect || !viewRect) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const };
  }

  const minX = viewRect.x + 6;
  const maxX = Math.max((viewRect.x + viewRect.width) - 6, minX + labelRect.width + 4);
  const leftOverflow = Math.max(minX - labelRect.x, 0);
  const rightOverflow = Math.max((labelRect.x + labelRect.width) - maxX, 0);
  if (leftOverflow <= 0 && rightOverflow <= 0) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const };
  }

  const centerX = pieRect.x + (pieRect.width / 2);
  const centerY = pieRect.y + (pieRect.height / 2);
  const labelCenterX = labelRect.x + (labelRect.width / 2);
  const labelCenterY = labelRect.y + (labelRect.height / 2);
  const dx = labelCenterX - centerX;
  const dy = labelCenterY - centerY;
  const radius = Math.max(Math.hypot(dx, dy), 1);
  const sourceAngle = Math.atan2(dy, dx);

  const total = Math.max(sliceValues.reduce((acc, v) => acc + Math.max(v, 0), 0), 1);
  const dataIndex = Math.max(0, Math.min(Number(params.dataIndex ?? 0), sliceValues.length - 1));
  const currentSliceValue = Math.max(sliceValues[dataIndex] ?? 0, 0);
  const beforeSliceValue = sliceValues.slice(0, dataIndex).reduce((acc, v) => acc + Math.max(v, 0), 0);
  const fullCircle = Math.PI * 2;
  const sliceStart = (-Math.PI / 2) + ((beforeSliceValue / total) * fullCircle);
  const sliceSpan = (currentSliceValue / total) * fullCircle;
  const sliceEnd = sliceStart + sliceSpan;
  const sliceCenter = sliceStart + (sliceSpan / 2);
  const sourceAngleUnwrapped = sourceAngle + (Math.round((sliceCenter - sourceAngle) / fullCircle) * fullCircle);
  const slicePad = Math.min(0.14, Math.max(0.02, sliceSpan * 0.2));
  const lowerBound = sliceStart + slicePad;
  const upperBound = sliceEnd - slicePad;
  const boundedSource = sliceSpan > (slicePad * 2)
    ? Math.max(lowerBound, Math.min(upperBound, sourceAngleUnwrapped))
    : sliceCenter;

  const evaluateOverflow = (angleUnwrapped: number) => {
    const nx = centerX + (Math.cos(angleUnwrapped) * radius) - (labelRect.width / 2);
    const left = Math.max(minX - nx, 0);
    const right = Math.max((nx + labelRect.width) - maxX, 0);
    return { total: left + right, x: nx, y: centerY + (Math.sin(angleUnwrapped) * radius) - (labelRect.height / 2) };
  };

  const sourceOverflow = evaluateOverflow(boundedSource);
  let bestAngle = boundedSource;
  let best = sourceOverflow;
  if (sourceOverflow.total > 0 && sliceSpan > (slicePad * 2)) {
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const probe = lowerBound + ((upperBound - lowerBound) * ratio);
      const evaluated = evaluateOverflow(probe);
      if (evaluated.total < best.total) {
        best = evaluated;
        bestAngle = probe;
      } else if (evaluated.total === best.total) {
        const currentDistance = Math.abs(probe - boundedSource);
        const bestDistance = Math.abs(bestAngle - boundedSource);
        if (currentDistance < bestDistance) {
          best = evaluated;
          bestAngle = probe;
        }
      }
    }
  }

  const normalizedBestAngle = normalizeAngle(bestAngle);
  const nextCenterX = centerX + (Math.cos(normalizedBestAngle) * radius);
  const nextCenterY = centerY + (Math.sin(normalizedBestAngle) * radius);

  return {
    x: nextCenterX - (labelRect.width / 2),
    y: nextCenterY - (labelRect.height / 2),
    hideOverlap: false as const,
    moveOverlap: 'shiftY' as const,
  };
}

function CountdownBadge({ exhausted, t }: { exhausted: boolean; t: (k: string) => string }) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!exhausted) return;
    const tick = () => {
      const next = Math.ceil(Date.now() / 3600000) * 3600000;
      setMs(Math.max(0, next - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [exhausted]);

  if (!exhausted) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Badge className="bg-red-600 text-white text-sm px-3 py-1 gap-2 animate-pulse">
      <Clock className="w-4 h-4" />
      {pad(h)}:{pad(m)}:{pad(s)} {t('tecdoc_until_reset')}
    </Badge>
  );
}

function DashboardTab({ t }: { t: (k: string) => string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { data, isLoading } = useQuery({
    queryKey: ['tecdoc-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/dashboard');
      return data as DashboardData;
    },
    refetchInterval: 10000,
  });

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</div>;
  }

  const sliceValues = [data.used, Math.max(0, data.remaining)];
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280';
  const chartBg = isDark ? 'transparent' : '#fff';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const donutOption = {
    backgroundColor: chartBg,
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie' as const,
      radius: ['50%', '70%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 4, borderColor: borderColor, borderWidth: 2 },
      label: {
        show: true,
        position: 'outside' as const,
        alignTo: 'labelLine' as const,
        margin: 2,
        bleedMargin: 4,
        formatter: '{d}%',
        fontSize: 12,
        color: axisTextColor,
        fontWeight: 500,
      },
      labelLine: { show: true, length: 18, length2: 14, smooth: false, lineStyle: { color: axisTextColor } },
      labelLayout: (params: PieLabelLayoutParams) => shiftPieLabelAlongArcNearEdge(params, sliceValues),
      emphasis: { label: { fontSize: 16, fontWeight: 'bold' as const } },
      data: [
        { value: data.used, name: t('tecdoc_used'), itemStyle: { color: '#0ea5e9' } },
        { value: Math.max(0, data.remaining), name: t('tecdoc_remaining'), itemStyle: { color: '#22c55e' } },
      ],
    }],
    graphic: [{
      type: 'text' as const,
      left: 'center',
      top: 'center',
      style: {
        text: `${data.used} / ${data.limit}`,
        textAlign: 'center' as const,
        fill: isDark ? '#e5e7eb' : '#374151',
        fontSize: 20,
        fontWeight: 'bold' as const,
      },
    }],
  };

  const lineOption = {
    backgroundColor: chartBg,
    xAxis: {
      type: 'category' as const,
      data: data.hourly.map((h) => h.hour),
      axisLabel: { color: axisTextColor },
      axisLine: { lineStyle: { color: borderColor } },
    },
    yAxis: {
      type: 'value' as const,
      max: data.limit,
      axisLabel: { color: axisTextColor },
      splitLine: { lineStyle: { color: borderColor } },
    },
    series: [{
      data: data.hourly.map((h) => h.count),
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.15, color: '#0ea5e9' },
      lineStyle: { color: '#0ea5e9', width: 2 },
      itemStyle: { color: '#0ea5e9' },
    }],
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={data.exhausted ? 'destructive' : 'outline'} className={data.exhausted ? 'text-base px-3' : data.remaining > 600 ? 'text-base px-3 border-green-500 text-green-600' : 'text-base px-3 border-yellow-500 text-yellow-600'}>
          {data.exhausted ? (
            <><AlertTriangle className="w-4 h-4 mr-1" /> {t('tecdoc_limit_exceeded')}</>
          ) : (
            <>{data.used} / {data.limit}</>
          )}
        </Badge>
        <CountdownBadge exhausted={data.exhausted} t={t} />
        <span className="text-sm text-muted-foreground">
          {t('tecdoc_remaining')}: {data.remaining}
        </span>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-2">
            <ReactECharts option={donutOption} style={{ width: '100%', height: 370 }} />
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-0"><CardTitle className="text-sm">{t('tecdoc_hourly_usage')}</CardTitle></CardHeader>
          <CardContent className="p-2">
            <ReactECharts option={lineOption} style={{ height: 310 }} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BatchTab({ t }: { t: (k: string) => string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchSize, setBatchSize] = useState(25);

  const statuses = [
    { value: 'all', label: t('tecdoc_filter_all') },
    { value: 'matched', label: t('tecdoc_matched') },
    { value: 'unmatched', label: t('tecdoc_unmatched') },
    { value: 'not_found', label: t('tecdoc_not_found') },
    { value: 'pending', label: t('tecdoc_pending') },
  ];

  const statusIcons: Record<string, React.ReactNode> = {
    matched: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    unmatched: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    not_found: <XCircle className="w-4 h-4 text-red-500" />,
    pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  };

  const { data } = useQuery({
    queryKey: ['tecdoc-articles', page, status, search],
    queryFn: async () => {
      const params: any = { page, page_size: 25 };
      if (status) params.status = status;
      if (search) params.search = search;
      const { data } = await api.get('/admin/tecdoc/articles', { params });
      return data as { items: ArticleItem[]; total: number };
    },
  });

  const { data: batchState } = useQuery({
    queryKey: ['tecdoc-batch-status'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/batch/status');
      return data as { running: boolean; task_id: string | null; processed: number; total: number; size: number };
    },
    refetchInterval: (query) => query.state.data?.running ? 3000 : false,
  });

  const refreshAfterBatch = () => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['tecdoc-articles'] });
      queryClient.invalidateQueries({ queryKey: ['tecdoc-batch-status'] });
    }, 1000);
  };

  const batchStart = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/batch/start', { size: batchSize });
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`${t('tecdoc_batch_started')}`);
      refreshAfterBatch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('save_error')),
  });

  const batchStartSelected = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/batch/start-selected', { ids: Array.from(selected) });
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`${t('tecdoc_batch_started')}`);
      setSelected(new Set());
      refreshAfterBatch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || t('save_error')),
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data?.items) return;
    const allIds = data.items.map((a) => a.id);
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('search_users')} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => batchStart.mutate()} disabled={batchStart.isPending}>
              {batchStart.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </Button>
          </TooltipTrigger><TooltipContent>{t('tecdoc_batch_start')}</TooltipContent></Tooltip>

          <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
            <Square className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBatchSize(Math.max(1, batchSize - 1))}>
            <Minus className="w-3 h-3" />
          </Button>
          <span className="text-sm font-medium w-8 text-center">{batchSize}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBatchSize(batchSize + 1)}>
            <Plus className="w-3 h-3" />
          </Button>

          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => batchStartSelected.mutate()} disabled={batchStartSelected.isPending || selected.size === 0}>
              {batchStartSelected.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            </Button>
          </TooltipTrigger><TooltipContent>{t('tecdoc_batch_start_selected')}</TooltipContent></Tooltip>
        </div>
      </div>

      {batchState?.running && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-blue-600 font-medium">{t('tecdoc_batch_progress')}: {batchState.processed} / {batchState.total}</span>
            {batchState.total > 0 && (
              <span className="text-muted-foreground">({Math.round((batchState.processed / batchState.total) * 100)}%)</span>
            )}
            {batchState.task_id && <span className="text-xs text-muted-foreground font-mono">ID: {batchState.task_id.slice(0, 8)}...</span>}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full"
              style={{ width: batchState.total ? `${(batchState.processed / batchState.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <input type="checkbox" className="cursor-pointer"
                      checked={data?.items && data.items.length > 0 && selected.size === data.items.length}
                      onChange={toggleAll} />
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('tecdoc_col_article')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('tecdoc_col_name')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('tecdoc_col_brand')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('tecdoc_col_status')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground w-16">{t('tecdoc_col_attempts')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground w-32">{t('tecdoc_col_last')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3"><input type="checkbox" className="cursor-pointer" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} /></td>
                    <td className="p-3 font-mono text-xs">{a.article}</td>
                    <td className="p-3 text-xs max-w-[200px] truncate">{a.name || '—'}</td>
                    <td className="p-3 text-xs">{a.brand || '—'}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-xs">
                        {statusIcons[a.match_status]}
                        {t('tecdoc_' + a.match_status) || a.match_status}
                      </span>
                    </td>
                    <td className="p-3 text-center text-xs">{a.attempts}</td>
                    <td className="p-3 text-xs text-muted-foreground">{a.last_attempt_at ? new Date(a.last_attempt_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">{t('tecdoc_articles_empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data && data.total > 25 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">{(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} of {data.total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ t }: { t: (k: string) => string }) {
  const queryClient = useQueryClient();
  const [apiUrl, setApiUrl] = useState('');
  const [dbHost, setDbHost] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPass, setDbPass] = useState('');
  const [dbHasPass, setDbHasPass] = useState(false);
  const [dbPassLen, setDbPassLen] = useState(0);

  const { data } = useQuery({
    queryKey: ['tecdoc-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/settings');
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setApiUrl(data.api_url || '');
      setDbHost(data.db_host || '');
      setDbName(data.db_name || '');
      setDbUser(data.db_user || '');
      setDbPass('');
      setDbHasPass(data.db_has_pass || false);
      setDbPassLen(data.db_pass_length || 0);
    }
  }, [data]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('copied') || 'Copied');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { api_url: apiUrl, db_host: dbHost, db_name: dbName, db_user: dbUser };
      if (dbPass) payload.db_pass = dbPass;
      await api.put('/admin/tecdoc/settings', payload);
    },
    onSuccess: () => {
      toast.success(t('tecdoc_settings_saved'));
      queryClient.invalidateQueries({ queryKey: ['tecdoc-settings'] });
    },
    onError: () => toast.error(t('save_error')),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/tecdoc/settings/test');
      return data;
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`${t('tecdoc_test_ok')}${res.latency_ms ? ` (${res.latency_ms}ms)` : ''}`);
      } else if (res.message?.includes('403') || res.message?.includes('Forbidden')) {
        toast.error(t('tecdoc_test_403'));
      } else {
        toast.error(t('tecdoc_test_fail'));
      }
    },
    onError: () => toast.error(t('tecdoc_test_fail')),
  });

  const Field = ({ label, value, onChange, type = 'text', passLen }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; passLen?: number;
  }) => (
    <div>
      <label className="text-sm text-muted-foreground mb-1 block">{label}</label>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={passLen ? '•'.repeat(passLen) : undefined}
          className="pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => copyToClipboard(value)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('copy') || 'Copy'}
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Card className="max-w-md">
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('tecdoc_api_title')}</p>
        <Field label={t('tecdoc_settings_url')} value={apiUrl} onChange={setApiUrl} />

        <hr />
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('tecdoc_settings_db_title')}</p>
        <Field label={t('tecdoc_settings_db_host')} value={dbHost} onChange={setDbHost} />
        <Field label={t('tecdoc_settings_db_name')} value={dbName} onChange={setDbName} />
        <Field label={t('tecdoc_settings_db_user')} value={dbUser} onChange={setDbUser} />
        <Field label={t('tecdoc_settings_db_pass')} value={dbPass} onChange={setDbPass} type="password" passLen={dbPassLen} />

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="gap-2">
            {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            {t('tecdoc_settings_test')}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('tecdoc_settings_save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TecDocPageInner() {
  const t = useTranslations('admin');
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') || 'dashboard') as Tab;

  return (
    <div className="p-6">
      {tab === 'dashboard' && <DashboardTab t={t} />}
      {tab === 'batch' && <BatchTab t={t} />}
      {tab === 'settings' && <SettingsTab t={t} />}
    </div>
  );
}

export default function TecDocPage() {
  return <TecDocPageInner />;
}

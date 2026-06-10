'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { Loader2, Save, Play, Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface CategoryRule {
  category_id: number;
  category_name: string;
  margin_percent: number | null;
  is_active: boolean;
}

interface HistoryItem {
  id: number;
  price_rule_id: number;
  old_percent: number;
  new_percent: number;
  changed_at: string;
}

interface GeneralRule {
  id: number;
  type: string;
  margin_percent: number;
  is_active: boolean;
}

export default function PricingPage() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [generalMargin, setGeneralMargin] = useState<number>(0);
  const [categoryMargins, setCategoryMargins] = useState<Record<number, number | null>>({});
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'general' | number>('general');

  // Fetch general rule
  const { data: generalRule, isLoading: generalLoading } = useQuery<GeneralRule>({
    queryKey: ['pricing-general'],
    queryFn: async () => {
      const res = await api.get('/admin/pricing/general');
      return res.data;
    },
  });

  // Fetch category rules
  const { data: categoryRules, isLoading: categoriesLoading } = useQuery<CategoryRule[]>({
    queryKey: ['pricing-categories'],
    queryFn: async () => {
      const res = await api.get('/admin/pricing/categories');
      return res.data;
    },
  });

  // Fetch history
  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ['pricing-history', chartType],
    queryFn: async () => {
      const params = chartType === 'general'
        ? { type: 'general' }
        : { type: 'category', category_id: chartType };
      const res = await api.get('/admin/pricing/history', { params });
      return res.data;
    },
    enabled: !!generalRule,
  });

  useEffect(() => {
    if (generalRule) {
      setGeneralMargin(generalRule.margin_percent || 0);
    }
  }, [generalRule]);

  useEffect(() => {
    if (categoryRules) {
      const map: Record<number, number | null> = {};
      categoryRules.forEach((c) => {
        map[c.category_id] = c.margin_percent ?? null;
      });
      setCategoryMargins(map);
    }
  }, [categoryRules]);

  // Poll task status
  useEffect(() => {
    if (!taskId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/admin/pricing/task-status/${taskId}`);
        setTaskStatus(res.data.status);
        if (res.data.status === 'SUCCESS' || res.data.status === 'FAILURE') {
          clearInterval(interval);
          if (res.data.status === 'SUCCESS') {
            toast.success(t('pricing_applied_success'));
          } else {
            toast.error(t('pricing_applied_error'));
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [taskId]);

  const applyMargins = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/pricing/apply');
      return res.data;
    },
    onSuccess: (data) => {
      setTaskId(data.task_id);
      setTaskStatus('PENDING');
      toast.success(t('pricing_queued'));
    },
    onError: () => toast.error(t('pricing_apply_error')),
  });

  // Expose actions to TopBar — must be AFTER useMutation definitions
  useEffect(() => {
    (window as any).__applyPricing = () => applyMargins.mutate();
    (window as any).__savePricing = () => saveAll.mutate();
    return () => {
      delete (window as any).__applyPricing;
      delete (window as any).__savePricing;
    };
  }, [applyMargins.mutate, saveAll.mutate]);

  const chartData = history || [];
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0];
        return `${new Date(p.value[0]).toLocaleString()}<br/>${t('pricing_margin')}: ${p.value[1]}%`;
      },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: isDark ? '#888' : '#ccc' } },
      axisLabel: { color: isDark ? '#aaa' : '#666' },
    },
    yAxis: {
      type: 'value',
      name: '%',
      axisLine: { lineStyle: { color: isDark ? '#888' : '#ccc' } },
      axisLabel: { color: isDark ? '#aaa' : '#666' },
      splitLine: { lineStyle: { color: isDark ? '#333' : '#eee' } },
    },
    series: [
      {
        type: 'line',
        data: chartData.map((h) => [h.changed_at, h.new_percent]),
        smooth: true,
        lineStyle: { color: '#3b82f6', width: 3 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.3)' },
              { offset: 1, color: 'rgba(59,130,246,0.05)' },
            ],
          },
        },
      },
    ],
  };

  const columnHelper = createColumnHelper<CategoryRule>();
  const columns = [
    columnHelper.accessor('category_id', {
      header: 'ID',
      cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
      size: 60,
    }),
    columnHelper.accessor('category_name', {
      header: t('pricing_category'),
      cell: (info) => <span className="text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('margin_percent', {
      header: `${t('pricing_margin')} %`,
      cell: (info) => {
        const catId = info.row.original.category_id;
        const val = categoryMargins[catId] ?? '';
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCategoryMargins((prev) => ({ ...prev, [catId]: (prev[catId] || 0) - 1 }))}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Input
              type="number"
              className="w-20 h-8 text-sm text-center"
              value={val ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                setCategoryMargins((prev) => ({ ...prev, [catId]: v }));
              }}
              placeholder="—"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCategoryMargins((prev) => ({ ...prev, [catId]: (prev[catId] || 0) + 1 }))}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: categoryRules || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const statusBadge = () => {
    if (!taskStatus) return null;
    const map: Record<string, { label: string; color: string; icon: any }> = {
      PENDING: { label: t('status_pending'), color: 'bg-yellow-500 text-white', icon: Clock },
      PROGRESS: { label: t('status_progress'), color: 'bg-orange-500 text-white', icon: Loader2 },
      SUCCESS: { label: t('status_success'), color: 'bg-green-500 text-white', icon: CheckCircle2 },
      FAILURE: { label: t('status_error'), color: 'bg-red-500 text-white', icon: XCircle },
    };
    const s = map[taskStatus] || { label: taskStatus, color: 'bg-gray-500 text-white', icon: AlertTriangle };
    const Icon = s.icon;
    return (
      <Badge className={`${s.color} border-0 gap-1`}>
        <Icon className="w-3.5 h-3.5" />
        {s.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Status badge row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {statusBadge()}
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('pricing_history')}</CardTitle>
          <Select
            value={String(chartType)}
            onValueChange={(v) => setChartType(v === 'general' ? 'general' : Number(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t('pricing_select_category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">{t('pricing_general')}</SelectItem>
              {(categoryRules || []).map((c) => (
                <SelectItem key={c.category_id} value={String(c.category_id)}>
                  {c.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ReactECharts option={chartOption} style={{ height: 300 }} />
        </CardContent>
      </Card>

      {/* Categories Table with General Margin inline */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg">{t('pricing_categories')}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">{t('pricing_general')}:</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setGeneralMargin((v) => v - 1)}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Input
              type="number"
              className="w-20 h-8 text-sm text-center"
              value={generalMargin}
              onChange={(e) => setGeneralMargin(Number(e.target.value))}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setGeneralMargin((v) => v + 1)}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <span className="text-muted-foreground">%</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/50">
                    {hg.headers.map((header) => (
                      <th key={header.id} className="text-left p-3 font-medium text-muted-foreground" style={{ width: header.getSize() }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(!categoryRules || categoryRules.length === 0) && (
              <div className="p-6 text-center text-muted-foreground text-sm">{t('pricing_empty')}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

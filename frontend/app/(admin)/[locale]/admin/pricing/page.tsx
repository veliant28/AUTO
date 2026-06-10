'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { Loader2, Save, Play, Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp, Minus, Plus, LineChart, FolderTree, SlidersHorizontal, Percent } from 'lucide-react';
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
  const [otpDigits, setOtpDigits] = useState<string[]>(['0', '0', '0']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);
  const [categoryMargins, setCategoryMargins] = useState<Record<number, number | null>>({});
  const [categoryOtp, setCategoryOtp] = useState<Record<number, string[]>>({});
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

  interface AppliedSnapshot {
    id: number;
    applied_at: string;
    general_margin: number | null;
    category_margins: Record<string, number> | null;
  }

  // Fetch applied (snapshots after real Apply)
  const { data: appliedHistory } = useQuery<AppliedSnapshot[]>({
    queryKey: ['pricing-applied-history'],
    queryFn: async () => {
      const res = await api.get('/admin/pricing/applied-history');
      return res.data;
    },
    enabled: !!generalRule,
  });

  // Fetch raw history (for save-time line chart, kept for reference)
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
    const str = String(Math.min(100, Math.max(0, generalMargin))).padStart(3, '0');
    setOtpDigits(str.split(''));
  }, [generalMargin]);

  useEffect(() => {
    if (categoryRules) {
      const map: Record<number, number | null> = {};
      const otpMap: Record<number, string[]> = {};
      categoryRules.forEach((c) => {
        map[c.category_id] = c.margin_percent ?? null;
        const num = Math.min(100, Math.max(0, c.margin_percent ?? 0));
        otpMap[c.category_id] = String(num).padStart(3, '0').split('');
      });
      setCategoryMargins(map);
      setCategoryOtp(otpMap);
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

  const saveAll = useMutation({
    mutationFn: async () => {
      await api.put('/admin/pricing/general', { margin_percent: generalMargin });
      const rules = Object.entries(categoryMargins)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([category_id, margin_percent]) => ({
          category_id: Number(category_id),
          margin_percent,
        }));
      await api.post('/admin/pricing/categories/bulk', { rules });
    },
    onSuccess: () => {
      toast.success(t('pricing_saved'));
      queryClient.invalidateQueries({ queryKey: ['pricing-general'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-categories'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-history'] });
    },
    onError: () => toast.error(t('pricing_save_error')),
  });

  const applyMargins = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/pricing/apply');
      return res.data;
    },
    onSuccess: (data) => {
      setTaskId(data.task_id);
      setTaskStatus('PENDING');
      queryClient.invalidateQueries({ queryKey: ['pricing-applied-history'] });
      toast.success(t('pricing_queued'));
    },
    onError: () => toast.error(t('pricing_apply_error')),
  });

  // Expose actions + task status + OTP state to TopBar
  useEffect(() => {
    (window as any).__applyPricing = () => applyMargins.mutate();
    (window as any).__savePricing = () => saveAll.mutate();
    (window as any).__pricingTaskStatus = taskStatus;
    (window as any).__pricingOtpDigits = otpDigits;
    (window as any).__pricingSetGeneralMargin = setGeneralMargin;
    return () => {
      delete (window as any).__applyPricing;
      delete (window as any).__savePricing;
      delete (window as any).__pricingTaskStatus;
      delete (window as any).__pricingOtpDigits;
      delete (window as any).__pricingSetGeneralMargin;
    };
  }, [applyMargins.mutate, saveAll.mutate, taskStatus, otpDigits]);

  const appliedData = (appliedHistory || []).filter((s) => {
    if (chartType === 'general') return s.general_margin != null;
    return s.category_margins && s.category_margins[String(chartType)] != null;
  });
  const axisTextColor = isDark ? '#9ca3af' : '#6b7280';
  const chartBg = isDark ? 'transparent' : '#fff';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const displayData = appliedData.slice(-20);
  const uniqueCatIds = new Set<number>();
  displayData.forEach((s) => {
    if (s.category_margins) {
      Object.keys(s.category_margins).forEach((k) => uniqueCatIds.add(Number(k)));
    }
  });
  const sortedCatIds = [...uniqueCatIds].sort((a, b) => a - b);
  const CAT_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];

  const series: any[] = [{
    name: t('pricing_general'),
    type: 'bar',
    stack: 'total',
    data: displayData.map((s) => s.general_margin ?? 0),
    itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
  }];
  sortedCatIds.forEach((catId, i) => {
    const cat = categoryRules?.find((c) => c.category_id === catId);
    series.push({
      name: cat?.category_name || `#${catId}`,
      type: 'bar',
      stack: 'total',
      data: displayData.map((s) => s.category_margins?.[String(catId)] ?? 0),
      itemStyle: { color: CAT_COLORS[i % CAT_COLORS.length], borderRadius: [4, 4, 0, 0] },
    });
  });

  const chartOption = {
    backgroundColor: chartBg,
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1f2937' : '#fff',
      borderColor: borderColor,
      formatter: (params: any) => {
        const snap = displayData[params[0].dataIndex];
        if (!snap) return '';
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${axisTextColor}">${new Date(snap.applied_at).toLocaleString()}</div>`;
        if (snap.general_margin != null) {
          html += `<div style="color:${axisTextColor};display:flex;align-items:center;gap:4px;margin-top:2px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e"></span>${t('pricing_general')}: <b>${snap.general_margin}%</b></div>`;
        }
        if (snap.category_margins) {
          const cats = categoryRules || [];
          Object.entries(snap.category_margins).forEach(([catId, val]) => {
            const cat = cats.find((c) => c.category_id === Number(catId));
            const name = cat ? cat.category_name : `#${catId}`;
            const color = CAT_COLORS[sortedCatIds.indexOf(Number(catId)) % CAT_COLORS.length];
            html += `<div style="color:${axisTextColor};display:flex;align-items:center;gap:4px;margin-top:2px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color}"></span>${name}: <b>${val}%</b></div>`;
          });
        }
        return html;
      },
    },
    grid: { top: 20, right: 20, bottom: 50, left: 50 },
    xAxis: {
      type: 'category' as const,
      data: displayData.map((s) => s.applied_at),
      axisLabel: {
        color: axisTextColor,
        formatter: (value: string) => {
          const d = new Date(value);
          return d.toLocaleDateString() + '\n' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
      },
      axisLine: { lineStyle: { color: borderColor } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: axisTextColor, formatter: '{value}%' },
      splitLine: { lineStyle: { color: borderColor } },
    },
    series,
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
        const digits = categoryOtp[catId] || ['0', '0', '0'];
        const updateVal = (newDigits: string[]) => {
          setCategoryOtp((prev) => ({ ...prev, [catId]: newDigits }));
          const num = Math.min(100, Math.max(0, Number(newDigits.join(''))));
          setCategoryMargins((prev) => ({ ...prev, [catId]: num }));
        };
        return (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => {
                const current = categoryMargins[catId] || 0;
                const newVal = Math.max(0, current - 1);
                updateVal(String(newVal).padStart(3, '0').split(''));
              }}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <div className="flex items-center gap-0.5">
              {digits.map((digit, i) => (
                <Input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  value={digit}
                  className="w-7 h-8 text-center text-xs font-mono p-0 rounded-md border-2 focus:border-primary"
                  onFocus={(e) => e.target.select()}
                  onBeforeInput={(e) => {
                    const char = (e as any).data;
                    if (char && /\d/.test(char)) {
                      e.preventDefault();
                      const next = [...digits];
                      next[i] = char;
                      updateVal(next);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      e.preventDefault();
                      const next = [...digits];
                      next[i] = '0';
                      setCategoryOtp((prev) => ({ ...prev, [catId]: next }));
                      const num = Math.min(100, Math.max(0, Number(next.join(''))));
                      setCategoryMargins((prev) => ({ ...prev, [catId]: num }));
                    }
                  }}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => {
                const current = categoryMargins[catId] || 0;
                const newVal = Math.min(100, current + 1);
                updateVal(String(newVal).padStart(3, '0').split(''));
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <span className="text-base font-semibold text-foreground">%</span>
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
      <Badge className={`${s.color} border-0 text-sm gap-1`}>
        <Icon className="w-3.5 h-3.5" />
        {s.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <LineChart className="w-5 h-5 text-primary" />
            {t('pricing_history')}
            {statusBadge()}
          </CardTitle>
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

      {/* Categories Table */}
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
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  Loader2, Clock, XCircle, AlertTriangle, CheckCircle2, Activity, Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const SLOT_COLORS = ['#ef4444', '#3b82f6', '#f97316', '#22c55e'];
const SLOT_BG = ['bg-red-500', 'bg-blue-500', 'bg-orange-500', 'bg-green-500'];
const slotColor = (idx: number) => idx >= 0 ? SLOT_COLORS[idx % 4] : '#9ca3af';
const slotBg = (idx: number) => idx >= 0 ? SLOT_BG[idx % 4] : 'bg-gray-400';
const STUCK_THRESHOLD = 3600;
const PROGRESS_THRESHOLD = 60;

interface TaskItem {
  id: string;
  name: string;
  worker: string;
  status: string;
  runtime_seconds: number;
  time_start: number | null;
  slot_index: number;
  import_progress: number | null;
  import_status: string | null;
  import_stage: string | null;
  stage_progress_start: number | null;
  stage_started_at: number | null;
}

interface WorkerStatus {
  name: string;
  status: string;
  active_count: number;
  reserved_count: number;
  concurrency: number;
  cpu_percent: number;
}

interface WorkersData {
  worker: WorkerStatus;
  tasks: TaskItem[];
  stuck_tasks: TaskItem[];
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

function RuntimeTimer({ timeStart }: { timeStart: number }) {
  const [runtime, setRuntime] = useState(() => Math.round((Date.now() / 1000) - timeStart));
  useEffect(() => {
    const id = setInterval(() => {
      setRuntime(Math.round((Date.now() / 1000) - timeStart));
    }, 1000);
    return () => clearInterval(id);
  }, [timeStart]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(runtime / 3600);
  const m = Math.floor((runtime % 3600) / 60);
  const s = runtime % 60;
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <span className="font-mono text-sm">{display}</span>
  );
}

function formatRuntime(totalSec: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function statusLabel(t: (k: string) => string, status: string): string {
  const map: Record<string, string> = {
    active: t('workers_active'),
    reserved: t('workers_reserved'),
    scheduled: t('workers_scheduled'),
  };
  return map[status] || status;
}

function statusBadge(t: (k: string) => string, status: string, runtimeSec: number, slotIdx: number) {
  const isStuck = status === 'active' && runtimeSec > STUCK_THRESHOLD;
  const errorStatuses = ['error', 'failure', 'revoked', 'stopped'];
  const isError = errorStatuses.includes(status.toLowerCase());
  const color = isStuck || isError
    ? 'bg-red-500 text-white animate-pulse'
    : status === 'active'
      ? 'bg-blue-500 text-white'
      : status === 'reserved'
        ? 'bg-yellow-500 text-white'
        : 'bg-gray-500 text-white';
  const Icon = isStuck || isError ? AlertTriangle : status === 'active' ? Activity : Clock;
  return (
    <Badge className={`${color} border-0 gap-1 text-sm`}>
      <Icon className="w-3.5 h-3.5" />
      {isStuck || isError ? t('workers_stuck') : statusLabel(t, status)}
    </Badge>
  );
}

export default function WorkersTab() {
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [activeHistory, setActiveHistory] = useState<{ time: number; value: number }[]>(() => {
    const now = Date.now();
    return Array.from({ length: 50 }, (_, i) => ({
      time: now - (49 - i) * 3000,
      value: 0,
    }));
  });
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setClock(Date.now());
      setActiveHistory((prev) => prev.map(p => ({ ...p, time: p.time + 1000 })));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading, refetch } = useQuery<WorkersData>({
    queryKey: ['admin-workers'],
    queryFn: async () => {
      const { data } = await api.get('/admin/workers');
      return data;
    },
    refetchInterval: 3000,
  });

  const w = data?.worker;
  const workerOnline = w?.status === 'online';
  const activeCount = w?.active_count ?? 0;
  const reservedCount = w?.reserved_count ?? 0;
  const concurrency = w?.concurrency ?? 4;
  const freeSlots = Math.max(0, concurrency - activeCount);

  useEffect(() => {
    if (!data?.worker) return;
    setActiveHistory((prev) => {
      const lastTime = prev[prev.length - 1]?.time ?? Date.now();
      const next = [...prev, { time: lastTime + 1, value: data.worker.active_count }];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, [data]);

  useEffect(() => {
    (window as any).__refreshWorkers = () => refetch();
    (window as any).__workerActiveCount = activeCount;
    (window as any).__workerReservedCount = reservedCount;
    return () => {
      delete (window as any).__refreshWorkers;
      delete (window as any).__workerActiveCount;
      delete (window as any).__workerReservedCount;
    };
  }, [activeCount, reservedCount]);

  const revokeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await api.post(`/admin/workers/tasks/${taskId}/revoke`);
      return data;
    },
    onSuccess: () => {
      toast.success(t('workers_revoke_success'));
    },
    onError: () => toast.error(t('workers_revoke_error')),
  });

  const axisTextColor = isDark ? '#9ca3af' : '#6b7280';
  const chartBg = isDark ? 'transparent' : '#fff';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const activeSlots = (data?.tasks || []).filter(t => t.status === 'active');
  const slotSet = new Set(activeSlots.map(t => t.slot_index));
  const donutData: any[] = [];
  if (activeCount === 0) {
    donutData.push({
      value: 1,
      name: '',
      itemStyle: { color: '#9ca3af', opacity: 0.12, borderRadius: 6 },
    });
  } else {
    for (let i = 0; i < concurrency; i++) {
      if (slotSet.has(i)) {
        donutData.push({
          value: 1 / activeCount,
          name: `${t('workers_slot')} ${i + 1}`,
          itemStyle: {
            color: SLOT_COLORS[i % 4],
            borderRadius: 6,
            borderColor: '#ffffff',
            borderWidth: 3,
            shadowBlur: 8,
            shadowColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)',
          },
        });
      }
    }
  }

  const donutOption = {
    backgroundColor: chartBg,
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie' as const,
      radius: ['48%', '70%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: borderColor, borderWidth: 3 },
      label: {
        show: activeCount > 0,
        position: 'outside' as const,
        alignTo: 'labelLine' as const,
        margin: 2,
        bleedMargin: 4,
        formatter: (params: any) => params.name || '',
        fontSize: 11,
        color: axisTextColor,
        fontWeight: 600,
      },
      labelLine: {
        show: activeCount > 0,
        length: 18,
        length2: 14,
        smooth: false,
        lineStyle: { color: axisTextColor },
      },
      labelLayout: (params: PieLabelLayoutParams) => shiftPieLabelAlongArcNearEdge(params, donutData.map(d => d.value)),
      emphasis: { label: { fontSize: 14, fontWeight: 'bold' as const } },
      data: donutData,
    }],
    graphic: [{
      type: 'text' as const,
      left: 'center',
      top: 'center',
      style: {
        text: `${activeCount} / ${concurrency}`,
        textAlign: 'center' as const,
        fill: isDark ? '#e5e7eb' : '#374151',
        fontSize: 22,
        fontWeight: 'bold' as const,
      },
    }],
  };

  const dataMin = activeHistory[0]?.time ?? Date.now();
  const dataMax = activeHistory[activeHistory.length - 1]?.time ?? Date.now();
  const activeSlotsOption = {
    backgroundColor: chartBg,
    xAxis: {
      type: 'time' as const,
      min: dataMin - 3000,
      max: dataMax + 3000,
      axisLabel: {
        color: axisTextColor,
        formatter: (v: number) => {
          const d = new Date(v);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        },
      },
      axisLine: { lineStyle: { color: borderColor } },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 4,
      axisLabel: { color: axisTextColor },
      splitLine: { lineStyle: { color: borderColor } },
    },
    series: [{
      data: activeHistory.map(p => [p.time, p.value]),
      type: 'line' as const,
      smooth: true,
      symbol: 'none',
      areaStyle: { opacity: 0.15, color: '#0ea5e9' },
      lineStyle: { color: '#0ea5e9', width: 2 },
    }],
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
  };

  const columnHelper = createColumnHelper<TaskItem>();
  const columns = [
    columnHelper.display({
      id: 'color',
      header: '',
      size: 8,
      cell: ({ row }) => (
          <div className={`w-1.5 h-8 rounded-full ${slotBg(row.original.slot_index)}`} />
      ),
    }),
    columnHelper.accessor('id', {
      header: t('workers_task_id'),
      cell: (info) => (
        <span className="font-mono text-xs truncate max-w-[140px] block" title={info.getValue()}>
          {info.getValue().slice(0, 8)}...
        </span>
      ),
    }),
    columnHelper.accessor('name', {
      header: t('workers_task_name'),
      cell: (info) => {
        const stage = info.row.original.import_stage;
        return (
          <span className="text-sm truncate max-w-[200px] block" title={stage || undefined}>
            {stage || '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: t('workers_status'),
      cell: (info) => statusBadge(t, info.row.original.status, info.row.original.runtime_seconds, info.row.original.slot_index),
    }),
    columnHelper.accessor('runtime_seconds', {
      header: t('workers_progress'),
      cell: (info) => {
        const task = info.row.original;
        const isStuck = task.runtime_seconds > STUCK_THRESHOLD;
        if (task.import_progress !== null && task.import_progress !== undefined) {
          const ip = task.import_progress;
          const isFailed = task.import_status === 'failed';
          return (
            <div className="flex items-center gap-2 min-w-[180px]">
              <Badge className={`border-0 gap-1 text-sm font-mono ${isFailed ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                <Clock className="w-3.5 h-3.5" />
                {task.time_start ? <RuntimeTimer timeStart={task.time_start} /> : formatRuntime(task.runtime_seconds)}
              </Badge>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[60px]">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${isFailed ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${ip}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">{ip}%</span>
            </div>
          );
        }
        const pct = Math.min(100, Math.round((task.runtime_seconds / PROGRESS_THRESHOLD) * 100));
        return (
          <div className="flex items-center gap-2 min-w-[180px]">
            <Badge className={`border-0 gap-1 text-sm font-mono ${isStuck ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
              <Clock className="w-3.5 h-3.5" />
              {task.time_start ? <RuntimeTimer timeStart={task.time_start} /> : formatRuntime(task.runtime_seconds)}
            </Badge>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[60px]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${isStuck ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: t('actions'),
      size: 60,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => revokeMutation.mutate(row.original.id)}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('workers_revoke')}</TooltipContent>
          </Tooltip>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.tasks || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const stuck = data?.stuck_tasks || [];

  return (
    <div className="space-y-4">
      {/* Top row: donut + CPU */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-2">
            <ReactECharts option={donutOption} style={{ width: '100%', height: 320 }} />
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2 shrink-0">
              <Cpu className="w-5 h-5 text-blue-500" />
              {t('workers_active_slots')}
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Badge className={`border-0 gap-1 text-sm ${workerOnline ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}`}>
                <div className={`w-2 h-2 rounded-full ${workerOnline ? 'bg-white' : 'bg-gray-300'}`} />
                {workerOnline ? t('workers_online') : t('workers_offline')}
              </Badge>
              <Badge className="bg-blue-500 text-white border-0 gap-1 text-sm">
                <Activity className="w-3.5 h-3.5" />
                {t('workers_active')}: {activeCount}
              </Badge>
              <Badge className="bg-yellow-500 text-white border-0 gap-1 text-sm">
                <Clock className="w-3.5 h-3.5" />
                {t('workers_reserved')}: {reservedCount}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <ReactECharts option={activeSlotsOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
      </div>

      {/* Tasks table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {(!data?.tasks || data.tasks.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                      {t('workers_no_tasks')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Stuck tasks */}
      {stuck.length > 0 && (
        <Card className="overflow-hidden border-red-200 dark:border-red-900">
          <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-sm text-red-500">{t('workers_stuck_title')}</CardTitle>
            <Badge className="bg-red-500 text-white border-0 ml-auto">{stuck.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-red-50 dark:bg-red-950/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('workers_task_id')}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('workers_task_name')}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('workers_progress')}</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stuck.map((task) => (
                    <tr key={task.id} className="border-b last:border-0 hover:bg-red-50 dark:hover:bg-red-950/20">
                      <td className="p-3 font-mono text-xs">{task.id.slice(0, 8)}...</td>
                      <td className="p-3 text-sm">{task.import_stage || '—'}</td>
                      <td className="p-3">
                        <Badge className="bg-red-500 text-white border-0 gap-1 text-sm font-mono animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                          {formatRuntime(task.runtime_seconds)}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => revokeMutation.mutate(task.id)}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('workers_revoke')}</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

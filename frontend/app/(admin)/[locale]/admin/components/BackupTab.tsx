'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@wrksz/themes/client'
import {
  Download,
  Trash2,
  Loader2,
  Play,
  Clock,
  AlertTriangle,
  Database,
  HardDrive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
  in_progress: 'bg-blue-500 text-white',
}

const STATUS_LABEL_KEY: Record<string, string> = {
  completed: 'backup_status_completed',
  failed: 'backup_status_failed',
  in_progress: 'backup_status_in_progress',
}

// TimePicker component (from suppliers/page.tsx pattern)
function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [hours, minutes] = (value || '02:00').split(':')
  const hoursRef = React.useRef<HTMLDivElement>(null)
  const minutesRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        hoursRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
        minutesRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-24 font-normal text-center mx-auto cursor-pointer gap-1 text-base"
          disabled={disabled}
        >
          <span className="flex-1">{value || '02:00'}</span>
          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit p-2" align="center" sideOffset={4}>
        <div className="flex gap-1">
          <div
            ref={hoursRef}
            className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {Array.from({ length: 24 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((h) => (
              <button
                key={h}
                type="button"
                data-selected={h === hours || undefined}
                className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                  h === hours
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-accent text-foreground'
                }`}
                onClick={() => {
                  onChange(`${h}:${minutes}`)
                  setOpen(false)
                }}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="w-px bg-border self-stretch" />
          <div
            ref={minutesRef}
            className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {Array.from({ length: 60 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((m) => (
              <button
                key={m}
                type="button"
                data-selected={m === minutes || undefined}
                className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                  m === minutes
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-accent text-foreground'
                }`}
                onClick={() => {
                  onChange(`${hours}:${m}`)
                  setOpen(false)
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface BackupRecord {
  id: number
  filename: string
  file_size: number
  status: string
  type: string
  created_at: string | null
  completed_at: string | null
}

export default function BackupTab() {
  const t = useTranslations('admin')
  const { user, isAuthenticated } = useAuthStore()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
  const [backupTime, setBackupTime] = useState('02:00')
  const [chartHydrated, setChartHydrated] = useState(false)

  useEffect(() => {
    setChartHydrated(true)
  }, [])

  // Fetch backups
  const { data: backups = [], isLoading } = useQuery<BackupRecord[]>({
    queryKey: ['admin-backups'],
    queryFn: async () => {
      const { data } = await api.get('/admin/backups')
      return data
    },
    enabled: isAuthenticated && ['admin', 'manager'].includes(user?.role ?? ''),
    refetchInterval: 10000,
  })

  // Fetch config
  const { data: config } = useQuery<{ run_at_time: string }>({
    queryKey: ['admin-backups-config'],
    queryFn: async () => {
      const { data } = await api.get('/admin/backups/config')
      return data
    },
    enabled: isAuthenticated && ['admin', 'manager'].includes(user?.role ?? ''),
  })

  useEffect(() => {
    if (config?.run_at_time) {
      setBackupTime(config.run_at_time)
    }
  }, [config?.run_at_time])

  // Expose functions and state to window for TopBar
  useEffect(() => {
    const win = window as any
    win.__triggerBackup = () => {
      runBackupMutation.mutate()
    }
    win.__saveBackupConfig = () => {
      saveConfigMutation.mutate({ run_at_time: backupTime })
    }
    win.__setBackupTime = (t: string) => setBackupTime(t)
    return () => {
      delete win.__triggerBackup
      delete win.__saveBackupConfig
      delete win.__setBackupTime
    }
  }, [backupTime])

  // Sync backupTime to window for TopBar TimePicker display
  useEffect(() => {
    ;(window as any).__backupTime = backupTime
  }, [backupTime])

  // Run backup mutation
  const runBackupMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/backups/run')
      return data
    },
    onSuccess: () => {
      toast.success(t('backup_run_success'))
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ['admin-backups'] }),
        1000,
      )
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('backup_run_error'))
    },
  })

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (body: { run_at_time: string }) => {
      const { data } = await api.put('/admin/backups/config', body)
      return data
    },
    onSuccess: () => {
      toast.success(t('backup_config_saved'))
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('backup_save_error'))
    },
  })

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/admin/backups/${id}`)
      return data
    },
    onSuccess: () => {
      toast.success(t('backup_delete_success'))
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('backup_delete_error'))
    },
  })

  const completedBackups = backups.filter((b) => b.status === 'completed')
  const hasData = completedBackups.length > 0

  // Chart data: last 7 days by date
  const chartData = React.useMemo(() => {
    const days: { date: string; size: number; count: number }[] = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = format(d, 'dd.MM')
      const dayBackups = completedBackups.filter((b) => {
        if (!b.created_at) return false
        const bd = new Date(b.created_at)
        return (
          bd.getDate() === d.getDate() &&
          bd.getMonth() === d.getMonth() &&
          bd.getFullYear() === d.getFullYear()
        )
      })
      const totalSize = dayBackups.reduce((sum, b) => sum + b.file_size, 0)
      days.push({ date: dateStr, size: totalSize, count: dayBackups.length })
    }
    return days
  }, [completedBackups])

  const textColor = isDark ? '#e5e7eb' : '#64748b'
  const gridColor = isDark ? '#1e293b' : '#f1f5f9'

  const chartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark
        ? 'rgba(30,41,59,0.95)'
        : 'rgba(255,255,255,0.95)',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: isDark ? '#e5e7eb' : '#1e293b', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        const day = chartData[Number(p.dataIndex)]
        if (!day || day.count === 0) return `${p.axisValue}<br/>Нет бэкапов`
        const sizeStr = formatFileSize(day.size)
        return `${p.axisValue}<br/>${day.count} бэкап(ов)<br/>${sizeStr}`
      },
    },
    grid: { left: 50, right: 20, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: chartData.map((d) => d.date),
      axisLabel: { color: textColor, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLabel: {
        color: textColor,
        fontSize: 11,
        formatter: (v: number) => formatFileSize(v),
      },
    },
    series: [
      {
        type: 'bar',
        name: 'Размер бэкапа',
        data: chartData.map((d) => d.size),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#6366f1' },
            ],
          } as any,
          borderRadius: [4, 4, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#2563eb' },
                { offset: 1, color: '#4f46e5' },
              ],
            } as any,
          },
        },
        label: {
          show: true,
          position: 'top',
          color: textColor,
          fontSize: 10,
          formatter: (p: any) => {
            const day = chartData[Number(p.dataIndex)]
            if (!day || day.count === 0) return ''
            return formatFileSize(day.size)
          },
        },
      },
    ],
  }

  if (!user || !['admin', 'manager'].includes(user?.role ?? '')) return null

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            {t('backup_history')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartHydrated && hasData ? (
            <ReactECharts
              option={chartOption}
              style={{ height: 280, width: '100%' }}
              notMerge
            />
          ) : chartHydrated && !hasData ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              {t('backup_empty')}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px]">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            {t('backup_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t('backup_empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground w-40">
                      {t('backup_date')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      {t('backup_filename')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground w-24">
                      {t('backup_size')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground w-28">
                      {t('backup_status')}
                    </th>
                    <th className="text-right p-3 font-medium text-muted-foreground w-28">
                      {t('backup_actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((rec) => (
                    <tr
                      key={rec.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {rec.created_at
                          ? new Date(rec.created_at + 'Z').toLocaleString(
                              'uk-UA',
                              { timeZone: 'Europe/Kyiv', hour12: false },
                            )
                          : '—'}
                      </td>
                      <td className="p-3 font-mono text-xs truncate max-w-[300px]">
                        {rec.filename}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {formatFileSize(rec.file_size)}
                      </td>
                      <td className="p-3">
                        <Badge
                          className={`${STATUS_BADGE[rec.status] || 'bg-gray-500 text-white'} border-0 text-sm whitespace-nowrap gap-1`}
                        >
                          {rec.status === 'in_progress' && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {t(
                            STATUS_LABEL_KEY[rec.status] ||
                              'backup_status_unknown',
                          )}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          {rec.status === 'completed' && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/backups/${rec.id}/download`}
                                    target="_blank"
                                  >
                                    <Button variant="outline" size="icon">
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <p>{t('backup_download')}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => setDeleteTarget(rec)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <p>{t('backup_delete')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-destructive/10 p-2 rounded-full">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('backup_delete_confirm_title')}</DialogTitle>
                <DialogDescription>
                  {t('backup_delete_confirm_message')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">
                  {t('backup_filename')}:
                </span>{' '}
                <span className="font-mono">{deleteTarget.filename}</span>
              </p>
              <p>
                <span className="text-muted-foreground">
                  {t('backup_date')}:
                </span>{' '}
                {deleteTarget.created_at
                  ? format(
                      new Date(deleteTarget.created_at),
                      'dd.MM.yyyy HH:mm',
                    )
                  : '—'}
              </p>
              <p>
                <span className="text-muted-foreground">
                  {t('backup_size')}:
                </span>{' '}
                {formatFileSize(deleteTarget.file_size)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget!.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              {t('backup_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

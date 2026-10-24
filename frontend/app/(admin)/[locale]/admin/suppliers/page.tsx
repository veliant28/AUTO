'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { TablePagination } from '@/components/admin/TablePagination'
import {
  Loader2,
  Eye,
  EyeOff,
  Key,
  ShieldCheck,
  Clock,
  RefreshCw,
  Play,
  Check,
  X,
  CalendarClock,
  Loader,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { AnimatedPercent, AnimatedProgress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { TimePicker } from '@/components/ui/TimePicker'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useTimezone, formatDate } from '@/hooks/useTimezone'
import { useRequirePerm } from '@/hooks/useRequirePerm'

const supplierMeta: Record<
  string,
  { label: string; fullName: string; color: string }
> = {
  GPL: { label: 'GPL', fullName: 'GPL', color: 'bg-orange-500' },
  UTR: { label: 'UTR', fullName: 'UTR', color: 'bg-red-500' },
  'AUTONOVA-D': {
    label: 'AND',
    fullName: 'AUTONOVA-D',
    color: 'bg-blue-500',
  },
}

const scheduleStatusColors: Record<string, string> = {
  waiting: 'bg-orange-500 text-white',
  in_progress: 'bg-blue-500 text-white',
  success: 'bg-green-500 text-white',
  done: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  disabled: 'bg-gray-400 text-white',
}

function scheduleStatusLabel(status: string, t: any): string {
  const map: Record<string, string> = {
    waiting: t('schedule_waiting'),
    in_progress: t('schedule_in_progress'),
    success: t('schedule_success'),
    done: t('schedule_done'),
    error: t('schedule_error'),
    disabled: t('schedule_disabled'),
  }
  return map[status] || status
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const columnHelper = createColumnHelper<any>()

function TokenBadge({
  supplier,
  onRefresh,
}: {
  supplier: string
  onRefresh: () => void
}) {
  const ta = useTranslations('admin')
  const expiresAtRef = React.useRef<number | null>(null)

  const { data } = useQuery({
    queryKey: ['token-status', supplier],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/suppliers/${supplier}/token-status`,
      )
      return data as {
        token_status: string
        seconds_remaining: number | null
        token_expires_at: string | null
      }
    },
    refetchInterval: 60000,
    staleTime: 30000,
  })

  React.useEffect(() => {
    if (data?.token_expires_at) {
      expiresAtRef.current = new Date(data.token_expires_at + 'Z').getTime()
      setSecondsLeft(
        Math.max(0, Math.floor((expiresAtRef.current - Date.now()) / 1000)),
      )
    } else {
      expiresAtRef.current = null
      setSecondsLeft(null)
    }
  }, [data?.token_expires_at])

  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null)

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!expiresAtRef.current) {
        setSecondsLeft(null)
        return
      }
      setSecondsLeft(
        Math.max(0, Math.floor((expiresAtRef.current - Date.now()) / 1000)),
      )
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const activeSeconds =
    secondsLeft !== null && secondsLeft > 0 ? secondsLeft : null
  const isExpired =
    data?.token_status === 'expired' ||
    (secondsLeft === 0 && data?.token_status)
  const stateKey =
    activeSeconds !== null ? 'active' : isExpired ? 'expired' : 'none'

  let content: React.ReactNode
  let tooltip: string

  if (activeSeconds !== null) {
    const shortLived = supplier === 'AUTONOVA-D'
    const isWarning = activeSeconds < (shortLived ? 180 : 3600)
    const isCritical = activeSeconds < (shortLived ? 60 : 300)
    content = (
      <Badge
        className={`supplier-token-badge gap-1.5 text-sm font-mono border-0 justify-center ${
          isCritical
            ? 'bg-red-500 text-white'
            : isWarning
              ? 'bg-yellow-500 text-white'
              : 'bg-green-500 text-white'
        }`}
      >
        <Clock className="w-3.5 h-3.5" />
        <span className="supplier-token-text">
          {formatCountdown(activeSeconds)}
        </span>
      </Badge>
    )
    tooltip = formatCountdown(activeSeconds)
  } else if (isExpired) {
    content = (
      <button
        type="button"
        onClick={onRefresh}
        aria-label={ta('settings_token_refresh')}
        className="supplier-token-badge inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 bg-orange-500 px-2.5 py-0.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span className="supplier-token-text">
          {ta('settings_token_refresh')}
        </span>
      </button>
    )
    tooltip = ta('settings_token_refresh')
  } else {
    content = (
      <Badge className="supplier-token-badge gap-1.5 whitespace-nowrap text-sm bg-muted text-muted-foreground border-0">
        <Key className="w-3.5 h-3.5" />
        <span className="supplier-token-text">{ta('settings_token_none')}</span>
      </Badge>
    )
    tooltip = ta('settings_token_none')
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <AnimatedBadge swapKey={stateKey}>{content}</AnimatedBadge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function SupplierCard({ supplier }: { supplier: string }) {
  const ta = useTranslations('admin')
  const reqPerm = useRequirePerm()
  const queryClient = useQueryClient()
  const meta = supplierMeta[supplier] || {
    label: supplier,
    fullName: supplier,
    color: 'bg-gray-500',
  }
  const isAutonova = supplier === 'AUTONOVA-D'
  const [login, setLogin] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [clientId, setClientId] = React.useState('')
  const [environment, setEnvironment] = React.useState<'dev' | 'stable'>('dev')

  const { data: config, isLoading } = useQuery({
    queryKey: ['supplier-config', supplier],
    queryFn: async () => {
      const { data } = await api.get('/admin/suppliers')
      const all = data as any[]
      return all.find((c: any) => c.supplier === supplier) || null
    },
    staleTime: 0,
  })

  React.useEffect(() => {
    if (config?.login) setLogin(config.login)
  }, [config?.login])

  React.useEffect(() => {
    if (config?.client_id) setClientId(config.client_id)
  }, [config?.client_id])

  React.useEffect(() => {
    if (isAutonova) {
      setEnvironment(config?.api_url?.includes('/stable') ? 'stable' : 'dev')
    }
  }, [config?.api_url, isAutonova])

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/suppliers/${supplier}/refresh`)
      return data as {
        success: boolean
        token_expires_at: string
        seconds_remaining: number
        message?: string
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(ta('settings_refresh_success', { supplier: meta.label }))
        queryClient.setQueryData(['token-status', supplier], {
          token_status: 'active',
          seconds_remaining: result.seconds_remaining,
          token_expires_at: result.token_expires_at,
        })
      } else {
        toast.error(
          result.message ||
            ta('settings_refresh_error', { supplier: meta.label }),
        )
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || ta('settings_refresh_error', { supplier: meta.label }))
    },
  })

  const environmentMutation = useMutation({
    mutationFn: async (next: 'dev' | 'stable') => {
      const apiUrl =
        next === 'dev'
          ? 'https://api.autonovad.ua/dev'
          : 'https://api.autonovad.ua/stable'
      await api.put(`/admin/suppliers/${supplier}`, { api_url: apiUrl })
      return next
    },
    onSuccess: (next) => {
      setEnvironment(next)
      queryClient.invalidateQueries({
        queryKey: ['supplier-config', supplier],
      })
      queryClient.invalidateQueries({
        queryKey: ['token-status', supplier],
      })
      toast.success(ta('settings_environment_changed'))
    },
    onError: (err: any, next) => {
      setEnvironment(next === 'dev' ? 'stable' : 'dev')
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || ta('settings_environment_error'))
    },
  })

  const handleTokenRefresh = () => {
    if (!reqPerm('suppliers.edit')) return
    refreshMutation.mutate()
  }

  const revealPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get(`/admin/suppliers/${supplier}/password`)
      return data.password as string
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || ta('settings_password_reveal_error'))
    },
  })

  const handleTogglePassword = async () => {
    if (!reqPerm('suppliers.edit')) return
    if (showPassword) {
      setShowPassword(false)
      return
    }
    if (password) {
      setShowPassword(true)
      return
    }
    if (!config?.has_password) {
      setShowPassword(true)
      return
    }
    try {
      const savedPassword = await revealPasswordMutation.mutateAsync()
      setPassword(savedPassword)
      setShowPassword(true)
    } catch {
      // The mutation already shows the error toast.
    }
  }

  const authMutation = useMutation({
    mutationFn: async () => {
      if (login) {
        const payload: any = { login }
        if (password) payload.password = password
        if (isAutonova) payload.client_id = clientId.trim()
        await api.put(`/admin/suppliers/${supplier}`, payload)
      }
      const { data } = await api.post(`/admin/suppliers/${supplier}/auth`)
      return data as {
        success: boolean
        token_expires_at: string
        seconds_remaining: number
        message?: string
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(ta('settings_auth_success', { supplier: meta.label }))
        queryClient.invalidateQueries({
          queryKey: ['supplier-config', supplier],
        })
        queryClient.setQueryData(['token-status', supplier], {
          token_status: 'active',
          seconds_remaining: result.seconds_remaining,
          token_expires_at: result.token_expires_at,
        })
      } else {
        toast.error(
          result.message || ta('settings_auth_error', { supplier: meta.label }),
        )
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || ''
      toast.error(msg || ta('settings_auth_error', { supplier: meta.label }))
    },
  })

  return (
    <Card>
      <CardHeader>
        <div className="supplier-token-row flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              className={`${meta.color} border-0 text-white text-sm shrink-0`}
            >
              {meta.label}
            </Badge>
            <CardTitle className="text-lg truncate">
              {ta('settings_supplier_title', { supplier: meta.label })}
            </CardTitle>
          </div>
          <TokenBadge supplier={supplier} onRefresh={handleTokenRefresh} />
        </div>
        {isAutonova ? (
          config?.api_url ? (
            <div className="mt-1 flex items-center gap-1.5">
              <CardDescription
                className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                title={config.api_url}
              >
                {config.api_url}
              </CardDescription>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={environment === 'dev'}
                  onCheckedChange={(enabled) => {
                    if (!reqPerm('suppliers.edit')) return
                    const next = enabled ? 'dev' : 'stable'
                    if (next === environment) return
                    setEnvironment(next)
                    environmentMutation.mutate(next)
                  }}
                  disabled={
                    environmentMutation.isPending || authMutation.isPending
                  }
                  aria-label={ta('settings_environment')}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 shrink-0 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {ta('settings_environment_hint')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : null
        ) : config?.api_url ? (
          <CardDescription className="text-sm text-muted-foreground truncate mt-1">
            {config.api_url}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div
                className={isAutonova ? 'grid grid-cols-3 gap-2' : undefined}
              >
                {isAutonova && (
                  <div className="col-span-1">
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {ta('settings_client_id')}
                    </label>
                    <Input
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder={ta('settings_client_id_placeholder')}
                    />
                  </div>
                )}
                <div className={isAutonova ? 'col-span-2' : undefined}>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {ta('settings_login')}
                  </label>
                  <Input
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder={
                      supplier === 'GPL'
                        ? ta('settings_login_placeholder_gpl')
                        : isAutonova
                          ? ta('settings_login_placeholder_username')
                          : ta('settings_login_placeholder_email')
                    }
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-sm text-muted-foreground">
                    {ta('settings_password')}
                  </label>
                  {config?.has_password && !password && (
                    <span className="text-xs text-muted-foreground">
                      {ta('settings_password_saved')}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      password ? '•'.repeat(password.length) : '••••••'
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={handleTogglePassword}
                    disabled={revealPasswordMutation.isPending}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer disabled:cursor-wait"
                  >
                    {revealPasswordMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                if (!reqPerm('suppliers.edit')) return
                authMutation.mutate()
              }}
              disabled={
                authMutation.isPending ||
                environmentMutation.isPending ||
                !login ||
                (isAutonova && !clientId.trim())
              }
              className="w-full gap-2"
            >
              {authMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {ta('settings_auth_button')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PlaceholderCard() {
  const ta = useTranslations('admin')
  return (
    <Card className="opacity-40 border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge className="bg-gray-400 border-0 text-white text-sm">???</Badge>
          <CardTitle className="text-lg text-muted-foreground">
            {ta('settings_supplier_placeholder')}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
        </div>
        <div className="h-10 rounded-lg bg-muted" />
      </CardContent>
    </Card>
  )
}

export default function SuppliersPage() {
  const t = useTranslations('admin')

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SupplierCard supplier="GPL" />
        <SupplierCard supplier="UTR" />
        <SupplierCard supplier="AUTONOVA-D" />
        <PlaceholderCard />
      </div>

      <ScheduleSection />
    </div>
  )
}

function ScheduleSection() {
  const t = useTranslations('admin')
  const tz = useTimezone()
  const queryClient = useQueryClient()

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['admin-schedules'],
    queryFn: async () => {
      const { data } = await api.get('/admin/schedules')
      return data as any[]
    },
    refetchInterval: 5000,
  })

  const toggleMutation = useMutation({
    mutationFn: async ({
      supplier,
      enabled,
    }: {
      supplier: string
      enabled: boolean
    }) => {
      const { data } = await api.put(`/admin/schedules/${supplier}`, {
        enabled,
      })
      return data
    },
    onSuccess: (_: any, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-schedules'] })
      toast.success(
        vars.enabled
          ? t('settings_schedule_enabled', { supplier: vars.supplier })
          : t('settings_schedule_disabled', { supplier: vars.supplier }),
      )
    },
    onError: () => toast.error(t('settings_schedule_toggle_error')),
  })

  const timeMutation = useMutation({
    mutationFn: async ({
      supplier,
      run_at_time,
    }: {
      supplier: string
      run_at_time: string
    }) => {
      await api.put(`/admin/schedules/${supplier}`, { run_at_time })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-schedules'] }),
    onError: () => toast.error(t('settings_schedule_time_error')),
  })

  const runMutation = useMutation({
    mutationFn: async (supplier: string) => {
      await api.post(`/admin/schedules/${supplier}/run`)
    },
    onSuccess: (_: any, supplier: string) => {
      toast.success(t('settings_schedule_run_success', { supplier }))
      queryClient.invalidateQueries({ queryKey: ['admin-schedules'] })
    },
    onError: () => toast.error(t('settings_schedule_run_error')),
  })

  const scheduleRows = React.useMemo(() => schedules || [], [schedules])

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('supplier', {
        header: t('import_supplier'),
        size: 85,
        cell: (info) => {
          const s = info.row.original
          const meta = supplierMeta[s.supplier]
          const color = meta?.color || 'bg-gray-500'
          return (
            <Badge
              className={`${color} border-0 text-white text-sm`}
              title={meta?.fullName || s.supplier}
            >
              {meta?.label || s.supplier}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('run_at_time', {
        header: t('settings_schedule_time'),
        size: 80,
        cell: (info) => {
          const s = info.row.original
          return (
            <TimePicker
              value={s.run_at_time}
              onChange={(run_at_time) =>
                timeMutation.mutate({ supplier: s.supplier, run_at_time })
              }
              disabled={!s.enabled}
            />
          )
        },
      }),
      columnHelper.accessor('schedule_status', {
        header: t('import_status'),
        size: 120,
        cell: (info) => {
          const s = info.row.original
          const ssColor =
            scheduleStatusColors[s.schedule_status] || 'bg-gray-400 text-white'
          const statusLabel = scheduleStatusLabel(s.schedule_status, t)
          return (
            <AnimatedBadge swapKey={s.schedule_status}>
              <Badge className={`${ssColor} border-0 text-sm gap-1`}>
                {s.schedule_status === 'in_progress' && (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                )}
                {s.schedule_status === 'done' && (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {s.schedule_status === 'error' && (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                {s.schedule_status === 'waiting' && (
                  <Clock className="w-3.5 h-3.5" />
                )}
                {statusLabel}
              </Badge>
            </AnimatedBadge>
          )
        },
      }),
      columnHelper.accessor('next_run_utc', {
        header: t('settings_schedule_next'),
        size: 130,
        cell: (info) => {
          const s = info.row.original
          return s.enabled ? (
            <ScheduleTimer nextRunUtc={s.next_run_utc} />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor('last_run_at', {
        header: t('settings_schedule_last'),
        size: 170,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(info.getValue(), tz)}
          </span>
        ),
      }),
      columnHelper.accessor('last_import_progress', {
        header: t('import_progress'),
        size: 190,
        cell: (info) => {
          const s = info.row.original
          return (
            <div className="flex items-center gap-2 pr-2">
              <AnimatedProgress
                value={s.last_import_progress || 0}
                className="h-2 flex-1"
                indicatorClassName={
                  s.last_import_status === 'failed'
                    ? 'bg-red-500'
                    : s.last_import_status === 'complete'
                      ? 'bg-green-500'
                      : 'bg-blue-500'
                }
              />
              <AnimatedPercent
                value={s.last_import_progress || 0}
                className="text-sm font-mono text-muted-foreground w-8 text-right"
              />
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('actions'),
        size: 100,
        cell: (info) => {
          const s = info.row.original
          const color = supplierMeta[s.supplier]?.color || 'bg-gray-500'
          return (
            <div className="flex gap-2 justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className={`${s.enabled ? `${color} text-white` : ''}`}
                    variant={s.enabled ? undefined : 'outline'}
                    onClick={() =>
                      toggleMutation.mutate({
                        supplier: s.supplier,
                        enabled: !s.enabled,
                      })
                    }
                  >
                    {s.enabled ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {s.enabled
                    ? t('settings_schedule_disabled_short')
                    : t('settings_schedule_enabled_short')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => runMutation.mutate(s.supplier)}
                      disabled={
                        !s.enabled || s.schedule_status === 'in_progress'
                      }
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {s.schedule_status === 'in_progress'
                    ? t('settings_schedule_run_in_progress')
                    : t('settings_schedule_run')}
                </TooltipContent>
              </Tooltip>
            </div>
          )
        },
      }),
    ],
    [t, tz, toggleMutation, timeMutation, runMutation],
  )

  const table = useReactTable({
    data: scheduleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })

  if (isLoading || !schedules) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <CardHeader className="border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          {t('settings_schedule_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b bg-muted/50">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left p-3 font-medium text-muted-foreground"
                      style={{ width: header.getSize() }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination table={table} />
      </CardContent>
    </Card>
  )
}

function ScheduleTimer({ nextRunUtc }: { nextRunUtc: string | null }) {
  const nextRunRef = React.useRef<number | null>(null)
  const [left, setLeft] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (nextRunUtc) {
      nextRunRef.current = new Date(nextRunUtc + 'Z').getTime()
      setLeft(Math.max(0, Math.floor((nextRunRef.current - Date.now()) / 1000)))
    } else {
      nextRunRef.current = null
      setLeft(null)
    }
  }, [nextRunUtc])

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!nextRunRef.current) {
        setLeft(null)
        return
      }
      setLeft(Math.max(0, Math.floor((nextRunRef.current - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  if (!nextRunUtc)
    return <span className="text-sm text-muted-foreground">—</span>

  const isStarting = left !== null && left <= 0
  const stateKey = isStarting ? 'starting' : `countdown:${nextRunUtc}`

  if (left === null)
    return (
      <AnimatedBadge swapKey={stateKey}>
        <Badge className="text-sm font-mono border-0 gap-1.5 bg-blue-500/20 text-blue-400 min-w-[85px] justify-center">
          <Clock className="w-3.5 h-3.5" />
          00:00:00
        </Badge>
      </AnimatedBadge>
    )
  if (isStarting)
    return (
      <AnimatedBadge swapKey={stateKey}>
        <Badge className="text-sm font-mono bg-green-500 text-white border-0 gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Запуск...
        </Badge>
      </AnimatedBadge>
    )

  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60

  return (
    <AnimatedBadge swapKey={stateKey}>
      <Badge className="text-sm font-mono border-0 gap-1.5 bg-blue-500 text-white min-w-[85px] justify-center">
        <Clock className="w-3.5 h-3.5" />
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:
        {String(s).padStart(2, '0')}
      </Badge>
    </AnimatedBadge>
  )
}

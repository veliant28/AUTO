'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, Eye, EyeOff, Key, ShieldCheck, Clock, RefreshCw, Settings, Play, Check, X, CalendarClock, Loader, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useTimezone, formatDate } from '@/hooks/useTimezone';

const supplierMeta: Record<string, { label: string; color: string }> = {
  GPL: { label: 'GPL', color: 'bg-orange-500' },
  UTR: { label: 'UTR', color: 'bg-red-500' },
};

const TZS = [
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'Europe/Kiev', 'Europe/Moscow', 'Europe/Warsaw',
  'Europe/Berlin', 'Europe/Paris', 'Europe/London',
  'Europe/Istanbul', 'Asia/Tbilisi', 'Asia/Yerevan',
  'UTC',
].filter((v, i, a) => a.indexOf(v) === i);

const scheduleStatusColors: Record<string, string> = {
  waiting: 'bg-orange-500 text-white',
  in_progress: 'bg-blue-500 text-white',
  success: 'bg-green-500 text-white',
  done: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  disabled: 'bg-gray-400 text-white',
};

function scheduleStatusLabel(status: string, t: any): string {
  const map: Record<string, string> = {
    waiting: t('schedule_waiting'),
    in_progress: t('schedule_in_progress'),
    success: t('schedule_success'),
    done: t('schedule_done'),
    error: t('schedule_error'),
    disabled: t('schedule_disabled'),
  };
  return map[status] || status;
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function TokenBadge({ supplier, onRefresh }: { supplier: string; onRefresh: () => void }) {
  const ta = useTranslations('admin');
  const expiresAtRef = React.useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ['token-status', supplier],
    queryFn: async () => {
      const { data } = await api.get(`/admin/suppliers/${supplier}/token-status`);
      return data as { token_status: string; seconds_remaining: number | null; token_expires_at: string | null };
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  React.useEffect(() => {
    if (data?.token_expires_at) {
      expiresAtRef.current = new Date(data.token_expires_at + 'Z').getTime();
      setSecondsLeft(Math.max(0, Math.floor((expiresAtRef.current - Date.now()) / 1000)));
    } else {
      expiresAtRef.current = null;
      setSecondsLeft(null);
    }
  }, [data?.token_expires_at]);

  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!expiresAtRef.current) { setSecondsLeft(null); return; }
      setSecondsLeft(Math.max(0, Math.floor((expiresAtRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (secondsLeft !== null && secondsLeft > 0) {
    const isWarning = secondsLeft < 3600;
    const isCritical = secondsLeft < 300;
    return (
      <Badge className={`gap-1.5 text-sm font-mono border-0 min-w-[85px] justify-center ${
        isCritical ? 'bg-red-500 text-white' : isWarning ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'
      }`}>
        <Clock className="w-3.5 h-3.5" />
        {formatCountdown(secondsLeft)}
      </Badge>
    );
  }

  if (data?.token_status === 'expired' || (secondsLeft === 0 && data?.token_status)) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5 text-red-500 border-red-300" onClick={onRefresh}>
        <RefreshCw className="w-3 h-3" />
        {ta('settings_token_refresh')}
      </Button>
    );
  }

  return <Badge className="gap-1.5 text-sm bg-muted text-muted-foreground border-0"><Key className="w-3.5 h-3.5" />{ta('settings_token_none')}</Badge>;
}

function SupplierCard({ supplier }: { supplier: string }) {
  const ta = useTranslations('admin');
  const queryClient = useQueryClient();
  const meta = supplierMeta[supplier] || { label: supplier, color: 'bg-gray-500' };
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['supplier-config', supplier],
    queryFn: async () => {
      const { data } = await api.get('/admin/suppliers');
      const all = data as any[];
      return all.find((c: any) => c.supplier === supplier) || null;
    },
    staleTime: 0,
  });

  React.useEffect(() => {
    if (config?.login) setLogin(config.login);
  }, [config?.login]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/suppliers/${supplier}/refresh`);
      return data as { success: boolean; token_expires_at: string; seconds_remaining: number; message?: string };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(ta('settings_refresh_success', { supplier: meta.label }));
        queryClient.setQueryData(['token-status', supplier], {
          token_status: 'active',
          seconds_remaining: result.seconds_remaining,
          token_expires_at: result.token_expires_at,
        });
      } else {
        toast.error(result.message || ta('settings_refresh_error', { supplier: meta.label }));
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || '';
      toast.error(msg || ta('settings_refresh_error', { supplier: meta.label }));
    },
  });

  const authMutation = useMutation({
    mutationFn: async () => {
      if (login) {
        const payload: any = { login };
        if (password) payload.password = password;
        await api.put(`/admin/suppliers/${supplier}`, payload);
      }
      const { data } = await api.post(`/admin/suppliers/${supplier}/auth`);
      return data as { success: boolean; token_expires_at: string; seconds_remaining: number; message?: string };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(ta('settings_auth_success', { supplier: meta.label }));
        queryClient.invalidateQueries({ queryKey: ['supplier-config', supplier] });
        queryClient.setQueryData(['token-status', supplier], {
          token_status: 'active',
          seconds_remaining: result.seconds_remaining,
          token_expires_at: result.token_expires_at,
        });
      } else {
        toast.error(result.message || ta('settings_auth_error', { supplier: meta.label }));
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || '';
      toast.error(msg || ta('settings_auth_error', { supplier: meta.label }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Badge className={`${meta.color} border-0 text-white text-sm shrink-0`}>{meta.label}</Badge>
            <CardTitle className="text-lg truncate">{ta('settings_supplier_title', { supplier: meta.label })}</CardTitle>
          </div>
          <TokenBadge supplier={supplier} onRefresh={() => refreshMutation.mutate()} />
        </div>
        {config?.api_url && (
          <CardDescription className="text-sm text-muted-foreground truncate mt-1">{config.api_url}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {ta('loading')}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{ta('settings_login')}</label>
                <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder={supplier === 'GPL' ? '123456 (числовой ID)' : 'email@example.com'} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">{ta('settings_password')}</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={password ? '•'.repeat(password.length) : '••••••'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <Button
              onClick={() => authMutation.mutate()}
              disabled={authMutation.isPending || !login}
              className="w-full gap-2"
            >
              {authMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {ta('settings_auth_button')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PlaceholderCard() {
  const ta = useTranslations('admin');
  return (
    <Card className="opacity-40 border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge className="bg-gray-400 border-0 text-white text-sm">???</Badge>
          <CardTitle className="text-lg text-muted-foreground">{ta('settings_supplier_placeholder')}</CardTitle>
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
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [brandName, setBrandName] = React.useState('');
  const [timezone, setTimezone] = React.useState('Europe/Kiev');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings');
      return data as { brand_name: string; timezone: string };
    },
    enabled: !!user,
  });

  React.useEffect(() => {
    if (data?.brand_name) setBrandName(data.brand_name);
    if (data?.timezone) setTimezone(data.timezone);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put('/admin/settings', { brand_name: brandName, timezone });
    },
    onSuccess: () => {
      queryClient.setQueryData(['public-settings'], { brand_name: brandName });
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success(t('settings_saved'));
    },
    onError: () => toast.error(t('save_error')),
  });

  React.useEffect(() => {
    (window as any).__saveSettings = () => saveMutation.mutate();
    return () => { delete (window as any).__saveSettings; };
  }, [saveMutation.mutate]);

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              {t('settings_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">{t('settings_brand_name')}</label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="AutoParts" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">{t('settings_timezone')}</label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TZS.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg bg-muted p-4 border">
                  <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">{t('settings_logo_preview')}</p>
                  <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                    <div className="bg-primary text-primary-foreground p-1.5 rounded">
                      <Package className="w-5 h-5" />
                    </div>
                    <span>{brandName || 'AutoParts'}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <SupplierCard supplier="GPL" />
        <SupplierCard supplier="UTR" />
        <PlaceholderCard />
      </div>

      <ScheduleSection />
    </div>
  );
}

function ScheduleSection() {
  const t = useTranslations('admin');
  const tz = useTimezone();
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['admin-schedules'],
    queryFn: async () => {
      const { data } = await api.get('/admin/schedules');
      return data as any[];
    },
    refetchInterval: 5000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ supplier, enabled }: { supplier: string; enabled: boolean }) => {
      const { data } = await api.put(`/admin/schedules/${supplier}`, { enabled });
      return data;
    },
    onSuccess: (_: any, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
      toast.success(vars.enabled
        ? t('settings_schedule_enabled', { supplier: vars.supplier })
        : t('settings_schedule_disabled', { supplier: vars.supplier }));
    },
  });

  const timeMutation = useMutation({
    mutationFn: async ({ supplier, run_at_time }: { supplier: string; run_at_time: string }) => {
      await api.put(`/admin/schedules/${supplier}`, { run_at_time });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-schedules'] }),
  });

  const runMutation = useMutation({
    mutationFn: async (supplier: string) => {
      await api.post(`/admin/schedules/${supplier}/run`);
    },
    onSuccess: (_: any, supplier: string) => {
      toast.success(t('settings_schedule_run_success', { supplier }));
      queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
    },
  });

  if (isLoading || !schedules) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          {t('settings_schedule_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground w-[85px]">{t('import_supplier')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">{t('settings_schedule_time')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[120px]">{t('import_status')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-[130px]">{t('settings_schedule_next')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[170px]">{t('settings_schedule_last')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[190px]">{t('import_progress')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-[100px]">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s: any) => (
              <ScheduleRow
                key={s.supplier}
                schedule={s}
                tz={tz}
                t={t}
                onToggle={(enabled) => toggleMutation.mutate({ supplier: s.supplier, enabled })}
                onTimeChange={(run_at_time) => timeMutation.mutate({ supplier: s.supplier, run_at_time })}
                onRun={() => runMutation.mutate(s.supplier)}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ScheduleTimer({ nextRunUtc }: { nextRunUtc: string | null }) {
  const nextRunRef = React.useRef<number | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (nextRunUtc) {
      nextRunRef.current = new Date(nextRunUtc + 'Z').getTime();
      setLeft(Math.max(0, Math.floor((nextRunRef.current - Date.now()) / 1000)));
    } else {
      nextRunRef.current = null;
      setLeft(null);
    }
  }, [nextRunUtc]);

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!nextRunRef.current) { setLeft(null); return; }
      setLeft(Math.max(0, Math.floor((nextRunRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!nextRunUtc) return <span className="text-sm text-muted-foreground">—</span>;
  if (left === null) return (
    <Badge className="text-sm font-mono border-0 gap-1.5 bg-blue-500/20 text-blue-400 min-w-[85px] justify-center">
      <Clock className="w-3 h-3" />
      00:00:00
    </Badge>
  );
  if (left <= 0) return <Badge className="text-sm font-mono bg-green-500 text-white border-0 gap-1.5"><Clock className="w-3 h-3" />Запуск...</Badge>;

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;

  return (
    <Badge className="text-sm font-mono border-0 gap-1.5 bg-blue-500 text-white min-w-[85px] justify-center">
      <Clock className="w-3 h-3" />
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </Badge>
  );
}

function ScheduleRow({ schedule: s, tz, t, onToggle, onTimeChange, onRun }: {
  schedule: any; tz: string; t: any;
  onToggle: (enabled: boolean) => void;
  onTimeChange: (v: string) => void;
  onRun: () => void;
}) {
  const color = supplierMeta[s.supplier]?.color || 'bg-gray-500';
  const ssColor = scheduleStatusColors[s.schedule_status] || 'bg-gray-400 text-white';
  const statusLabel = scheduleStatusLabel(s.schedule_status, t);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="p-3">
        <Badge className={`${color} border-0 text-white text-sm`}>{s.supplier}</Badge>
      </td>
      <td className="p-3 text-center">
        <Input
          value={s.run_at_time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="h-8 w-16 text-sm text-center mx-auto"
          disabled={!s.enabled}
        />
      </td>
      <td className="p-3">
        <Badge className={`${ssColor} border-0 text-sm gap-1`}>
          {s.schedule_status === 'in_progress' && <Loader className="w-3 h-3 animate-spin" />}
          {s.schedule_status === 'done' && <CheckCircle2 className="w-3 h-3" />}
          {s.schedule_status === 'error' && <XCircle className="w-3 h-3" />}
          {s.schedule_status === 'waiting' && <Clock className="w-3 h-3" />}
          {statusLabel}
        </Badge>
      </td>
      <td className="p-3 text-center">
        {s.enabled ? <ScheduleTimer nextRunUtc={s.next_run_utc} /> : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      <td className="p-3 text-sm text-muted-foreground">{formatDate(s.last_run_at, tz)}</td>
      <td className="p-3">
        <div className="flex items-center gap-2 pr-2">
          <Progress
            value={s.last_import_progress || 0}
            className="h-2 flex-1"
            indicatorClassName={s.last_import_status === 'failed' ? 'bg-red-500' : s.last_import_status === 'complete' ? 'bg-green-500' : 'bg-blue-500'}
          />
          <span className="text-sm font-mono text-muted-foreground w-8 text-right">{s.last_import_progress || 0}%</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex gap-1 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className={`h-8 w-8 ${s.enabled ? `${color} text-white` : ''}`}
                variant={s.enabled ? undefined : 'outline'}
                onClick={() => onToggle(!s.enabled)}
              >
                {s.enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{s.enabled ? t('settings_schedule_disabled_short') : t('settings_schedule_enabled_short')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={onRun} disabled={!s.enabled || s.schedule_status === 'in_progress'}>
                <Play className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings_schedule_run')}</TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}

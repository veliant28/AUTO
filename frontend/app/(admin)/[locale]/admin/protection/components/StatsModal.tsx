'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, User, ScrollText, Unlock, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/hooks/useTimezone'
import { toast } from '@/lib/toast'
import api from '@/lib/api'

interface StatsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  banId: number | null
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

const eventTypeBadges: Record<string, string> = {
  failed_login: 'bg-red-500 text-white',
  failed_register: 'bg-red-500 text-white',
  manual_ban: 'bg-orange-500 text-white',
  manual_unban: 'bg-green-500 text-white',
  api_abuse: 'bg-purple-500 text-white',
  rate_limit: 'bg-yellow-500 text-black',
  too_many_attempts: 'bg-red-600 text-white',
  endpoint_abuse: 'bg-pink-500 text-white',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return phone
  const digits = d.slice(-10)
  return `+38 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
}

export default function StatsModal({
  open,
  onOpenChange,
  banId,
}: StatsModalProps) {
  const t = useTranslations('admin')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-protection-stats', banId],
    queryFn: async () => {
      const { data } = await api.get(
        `/admin/protection/blacklist/${banId}/stats`,
      )
      return data
    },
    enabled: open && !!banId,
  })

  const queryClient = useQueryClient()

  const unbanMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        `/admin/protection/blacklist/${banId}/unban`,
      )
      return data
    },
    onSuccess: () => {
      toast.success(t('protection_unban_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-blacklist'],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-stats', banId],
      })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('protection_ban_error')),
  })

  const addWhitelistMutation = useMutation({
    mutationFn: async () => {
      const email = data?.ban?.email
      if (!email) throw new Error('No email')
      const { data: res } = await api.post('/admin/protection/whitelist', {
        email,
      })
      return res
    },
    onSuccess: () => {
      toast.info(t('protection_whitelist_add_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-whitelist'],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-blacklist'],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-stats', banId],
      })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('protection_ban_error')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[98vw] max-w-[1800px] h-[90vh] overflow-hidden flex flex-col !p-0 !gap-0"
        aria-describedby={undefined}
      >
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? null : (
          <>
            {/* ── Header ── */}
            <DialogHeader className="p-6 pb-3 pr-14 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                      {t('protection_stats_title')}
                    </DialogTitle>
                    <Badge
                      className={
                        data.ban?.is_active
                          ? 'bg-red-500 text-white border-0 text-sm'
                          : 'bg-green-500 text-white border-0 text-sm'
                      }
                    >
                      {data.ban?.is_active
                        ? t('protection_active')
                        : t('protection_inactive')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data.ban?.banned_at
                      ? new Date(data.ban.banned_at + 'Z').toLocaleString(
                          'ru-RU',
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          },
                        )
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {data.ban?.banned_by_name ? (
                    <div className="flex flex-col items-end gap-0.5">
                      {data.ban?.banned_by_role && (
                        <Badge
                          className={`${roleBadgeColors[data.ban.banned_by_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                        >
                          {t(data.ban.banned_by_role)}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">
                        {data.ban?.banned_by_last_name &&
                        data.ban?.banned_by_first_name
                          ? `${data.ban.banned_by_last_name} ${data.ban.banned_by_first_name}`
                          : data.ban.banned_by_name}
                      </span>
                    </div>
                  ) : (
                    <Badge className="bg-gray-500 text-white border-0 text-sm">
                      {t('system_actor')}
                    </Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            <Separator className="flex-shrink-0" />

            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden p-6">
              <div className="grid grid-cols-[1fr_3fr] gap-6 h-full">
                {/* Left: Ban info card */}
                <div className="border rounded-lg p-4 flex flex-col h-full overflow-y-auto space-y-4">
                  <div className="flex items-center justify-between flex-shrink-0">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <User className="w-5 h-5" /> Данные пользователя
                    </h4>
                    {data.ban?.user_role && (
                      <Badge
                        className={`${roleBadgeColors[data.ban.user_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                      >
                        {t(data.ban.user_role)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 space-y-3 text-sm">
                    <div className="grid gap-1">
                      <span className="text-muted-foreground text-sm">
                        {t('protection_email')}
                      </span>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        <span className="truncate">
                          {data.ban?.email || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-muted-foreground text-sm">ФИО</span>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        <span
                          className={
                            data.ban?.user_name
                              ? 'truncate'
                              : 'truncate text-muted-foreground'
                          }
                        >
                          {[
                            data.ban?.last_name,
                            data.ban?.first_name,
                            data.ban?.middle_name,
                          ]
                            .filter(Boolean)
                            .join(' ') ||
                            data.ban?.user_name ||
                            '—'}
                        </span>
                      </div>
                    </div>
                    {data.ban?.phone && (
                      <div className="grid gap-1">
                        <span className="text-muted-foreground text-sm">
                          {t('phone_label')}
                        </span>
                        <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                          <span className="truncate">
                            {formatPhone(data.ban.phone)}
                          </span>
                        </div>
                      </div>
                    )}
                    <Separator />
                    <div className="grid gap-1">
                      <span className="text-muted-foreground text-sm">
                        {t('protection_ip')}
                      </span>
                      <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                        <span className="font-mono text-xs">
                          {data.ban?.ip_address || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <span className="text-muted-foreground text-sm">
                          {t('protection_blocks')}
                        </span>
                        <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                          <span className="font-medium">
                            {data.ban?.block_count || 0}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <span className="text-muted-foreground text-sm">
                          {t('protection_ban_type')}
                        </span>
                        <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden h-10">
                          <span className="text-sm">
                            {data.ban?.ban_type === 'manual'
                              ? t('protection_manual')
                              : t('protection_auto')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 gap-1">
                      <span className="text-muted-foreground text-sm">
                        {t('protection_reason')}
                      </span>
                      <div className="flex-1 flex items-start rounded-md border bg-muted/30 px-3 py-2 text-sm min-w-0 overflow-hidden min-h-[40px]">
                        <span className="text-sm">
                          {data.ban?.reason || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Events table */}
                <div className="border rounded-lg p-4 flex flex-col h-full overflow-hidden">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0 mb-3">
                    <ScrollText className="w-5 h-5" /> События
                    <Badge variant="outline" className="text-sm ml-1">
                      {data.total_events}
                    </Badge>
                  </h4>
                  <div className="flex-1 overflow-y-auto">
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap">
                              {t('protection_event_date')}
                            </th>
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                              {t('protection_event_type')}
                            </th>
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                              {t('protection_event_description')}
                            </th>
                            <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap">
                              {t('protection_ip')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.events?.length > 0 ? (
                            data.events.map((event: any) => (
                              <tr
                                key={event.id}
                                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                              >
                                <td className="p-3 whitespace-nowrap text-sm">
                                  {formatDate(event.created_at)}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    className={`${eventTypeBadges[event.event_type] || 'bg-gray-500 text-white'} border-0 text-sm whitespace-nowrap`}
                                  >
                                    {t('event_' + event.event_type) ||
                                      event.event_type}
                                  </Badge>
                                </td>
                                <td className="p-3 text-xs">
                                  <span>
                                    {t('event_' + event.event_type) ||
                                      event.event_type}
                                  </span>
                                  {event.description &&
                                    !event.description.startsWith(
                                      event.event_type,
                                    ) && (
                                      <span className="text-muted-foreground block mt-0.5 leading-tight">
                                        {event.description}
                                      </span>
                                    )}
                                </td>
                                <td className="p-3 font-mono text-xs">
                                  {event.ip_address || '—'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
                                className="p-6 text-center text-muted-foreground text-sm"
                              >
                                {t('protection_empty_blacklist')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <Separator className="flex-shrink-0" />
            <div className="flex-shrink-0 p-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {data.ban?.is_active && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => unbanMutation.mutate()}
                          disabled={unbanMutation.isPending}
                        >
                          {unbanMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlock className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{t('protection_unban')}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => addWhitelistMutation.mutate()}
                          disabled={addWhitelistMutation.isPending}
                        >
                          {addWhitelistMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{t('protection_add_whitelist')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

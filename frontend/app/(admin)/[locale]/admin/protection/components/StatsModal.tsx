'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { TablePagination } from '@/components/admin/TablePagination'
import {
  Loader2,
  User,
  ScrollText,
  Unlock,
  ShieldCheck,
  Network,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { useTimezoneStore } from '@/store/timezoneStore'
import { formatDateTime } from '@/lib/dates'
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

interface ProtectionEvent {
  id: number
  user_id: number | null
  email: string | null
  ip_address: string | null
  event_type: string
  description: string | null
  created_at: string | null
}

interface BanIpRow {
  ip_address: string
  first_seen: string | null
  last_seen: string | null
  visits: number
  blocked: boolean
}

const columnHelper = createColumnHelper<ProtectionEvent>()
const ipColumnHelper = createColumnHelper<BanIpRow>()

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
  const timezone = useTimezoneStore((s) => s.timezone)
  const [showIps, setShowIps] = React.useState(false)

  React.useEffect(() => {
    setShowIps(false)
  }, [banId])

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

  const { data: ipsData, isLoading: ipsLoading } = useQuery({
    queryKey: ['admin-protection-ban-ips', banId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/protection/blacklist/${banId}/ips`)
      return data as { items: BanIpRow[]; total: number; active: boolean }
    },
    enabled: open && !!banId && showIps,
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
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-ban-ips', banId],
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

  const events: ProtectionEvent[] = data?.events || []

  const eventRows = React.useMemo(() => data?.events || [], [data])

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('created_at', {
        header: t('protection_event_date'),
        size: 180,
        cell: (info) => (
          <span className="whitespace-nowrap text-sm">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('event_type', {
        header: t('protection_event_type'),
        size: 150,
        cell: (info) => (
          <Badge
            className={`${eventTypeBadges[info.getValue()] || 'bg-gray-500 text-white'} border-0 text-sm whitespace-nowrap`}
          >
            {t('event_' + info.getValue()) || info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('description', {
        header: t('protection_event_description'),
        size: 320,
        cell: ({ row }) => {
          const event = row.original
          return (
            <div className="text-xs">
              <span>{t('event_' + event.event_type) || event.event_type}</span>
              {event.description &&
                !event.description.startsWith(event.event_type) && (
                  <span className="text-muted-foreground block mt-0.5 leading-tight">
                    {event.description}
                  </span>
                )}
            </div>
          )
        },
      }),
      columnHelper.accessor('ip_address', {
        header: t('protection_ip'),
        size: 140,
        cell: (info) => (
          <span className="font-mono text-xs">{info.getValue() || '—'}</span>
        ),
      }),
    ],
    [t],
  )

  const table = useReactTable({
    data: eventRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })

  const ipColumns = React.useMemo(
    () => [
      ipColumnHelper.accessor('ip_address', {
        header: t('protection_ip'),
        size: 180,
        cell: (info) => (
          <span className="font-mono text-xs">{info.getValue()}</span>
        ),
      }),
      ipColumnHelper.accessor('last_seen', {
        header: t('protection_ip_last_seen'),
        size: 180,
        cell: (info) => (
          <span className="whitespace-nowrap text-sm">
            {info.getValue() ? formatDate(info.getValue()) : '—'}
          </span>
        ),
      }),
      ipColumnHelper.accessor('visits', {
        header: t('protection_ip_visits'),
        size: 100,
        cell: (info) => (
          <span className="tabular-nums text-sm">{info.getValue()}</span>
        ),
      }),
      ipColumnHelper.accessor('blocked', {
        header: t('protection_status'),
        size: 160,
        cell: (info) => (
          <Badge
            className={`${
              info.getValue()
                ? 'bg-red-500 text-white'
                : 'bg-gray-400 text-white'
            } border-0 text-sm whitespace-nowrap`}
          >
            {info.getValue()
              ? t('protection_ip_blocked')
              : t('protection_ip_not_blocked')}
          </Badge>
        ),
      }),
    ],
    [t],
  )

  const ipTable = useReactTable({
    data: ipsData?.items || [],
    columns: ipColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
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
                      ? formatDateTime(data.ban.banned_at, timezone)
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {data.ban?.banned_by_name ? (
                    <div className="flex flex-col items-end gap-0.5">
                      {data.ban?.banned_by_role && (
                        <AnimatedBadge swapKey={data.ban.banned_by_role}>
                          <Badge
                            className={`${roleBadgeColors[data.ban.banned_by_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                          >
                            {t(data.ban.banned_by_role)}
                          </Badge>
                        </AnimatedBadge>
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
                      <AnimatedBadge swapKey={data.ban.user_role}>
                        <Badge
                          className={`${roleBadgeColors[data.ban.user_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                        >
                          {t(data.ban.user_role)}
                        </Badge>
                      </AnimatedBadge>
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

                {/* Right: events or IP history */}
                <div className="border rounded-lg p-4 flex flex-col h-full overflow-hidden">
                  <h4 className="font-semibold text-lg flex items-center gap-2 flex-shrink-0 mb-3">
                    {showIps ? (
                      <>
                        <Network className="w-5 h-5" /> {t('protection_ips')}
                        <Badge variant="outline" className="text-sm ml-1">
                          {ipsData?.total ?? 0}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <ScrollText className="w-5 h-5" />{' '}
                        {t('protection_events')}
                        <Badge variant="outline" className="text-sm ml-1">
                          {data.total_events}
                        </Badge>
                      </>
                    )}
                  </h4>
                  <div className="flex-1 overflow-y-auto">
                    {showIps ? (
                      ipsLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                {ipTable.getHeaderGroups().map((hg) => (
                                  <tr
                                    key={hg.id}
                                    className="border-b bg-muted/50"
                                  >
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
                                {ipTable.getRowModel().rows.map((row) => (
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
                                {!ipsData?.items?.length && (
                                  <tr>
                                    <td
                                      colSpan={ipColumns.length}
                                      className="p-6 text-center text-muted-foreground text-sm"
                                    >
                                      {t('protection_no_ips')}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <TablePagination table={ipTable} />
                        </div>
                      )
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              {table.getHeaderGroups().map((hg) => (
                                <tr
                                  key={hg.id}
                                  className="border-b bg-muted/50"
                                >
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
                              {!data.events?.length && (
                                <tr>
                                  <td
                                    colSpan={columns.length}
                                    className="p-6 text-center text-muted-foreground text-sm"
                                  >
                                    {t('protection_empty_blacklist')}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <TablePagination table={table} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <Separator className="flex-shrink-0" />
            <div className="flex-shrink-0 p-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showIps ? 'default' : 'outline'}
                      size="icon"
                      className={
                        showIps ? '' : 'text-violet-600 hover:text-violet-700'
                      }
                      aria-label={
                        showIps ? t('protection_events') : t('protection_ips')
                      }
                      onClick={() => setShowIps((value) => !value)}
                    >
                      <Network className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>
                      {showIps ? t('protection_events') : t('protection_ips')}
                    </p>
                  </TooltipContent>
                </Tooltip>
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

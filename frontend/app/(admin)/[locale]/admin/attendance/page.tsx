'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  createColumnHelper,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { can } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { formatPhone } from '@/components/ui/PhoneInput'
import { useTimezone, formatDate } from '@/hooks/useTimezone'
import { startOfDayInTz, formatDateTime } from '@/lib/dates'

type AttendanceRecordItem = {
  id: number
  user_id: number
  work_date: string
  clock_in_at: string | null
  clock_out_at: string | null
  auto_clock_out: boolean
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role: string
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

const PAGE_SIZE = 20

/** YYYY-MM-DD локальной даты (для выбранной в календаре) */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** YYYY-MM-DD «сегодня» в часовом поясе настроек */
function todayKeyInTz(tz: string): string {
  const d = startOfDayInTz(tz)
  // en-CA форматирует дату как YYYY-MM-DD в целевом tz
  return formatDateTime(d.toISOString(), tz, {
    locale: 'en-CA',
    mode: 'date',
  })
}

function displayName(rec: AttendanceRecordItem): string {
  const parts = [rec.last_name, rec.first_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (rec.full_name) return rec.full_name
  return rec.email || ''
}

export default function AttendancePage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const tz = useTimezone()

  const [page, setPage] = React.useState(0)
  const [attendanceDate, setAttendanceDate] = React.useState<Date | undefined>(
    undefined,
  )

  // Мост с календарём в топ-баре (как у MonitorTab)
  React.useEffect(() => {
    ;(window as any).__attendanceSetDate = (d?: Date) => {
      setAttendanceDate(d)
      setPage(0)
    }
    return () => {
      delete (window as any).__attendanceSetDate
    }
  }, [])

  React.useEffect(() => {
    ;(window as any).__attendanceDate = attendanceDate
    return () => {
      delete (window as any).__attendanceDate
    }
  }, [attendanceDate])

  const dateKey = attendanceDate
    ? localDayKey(attendanceDate)
    : todayKeyInTz(tz)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-attendance-records', dateKey, page],
    queryFn: async () => {
      const { data } = await api.get('/admin/attendance/records', {
        params: { date: dateKey, page: page + 1, page_size: PAGE_SIZE },
      })
      return data as {
        items: AttendanceRecordItem[]
        total: number
        page: number
        page_size: number
      }
    },
    enabled: can(user, 'attendance.view'),
  })

  React.useEffect(() => {
    if (isError) toast.error(t('attendance_load_error'))
  }, [isError, t])

  const columnHelper = createColumnHelper<AttendanceRecordItem>()
  const columns = React.useMemo(
    () => [
      columnHelper.accessor('user_id', {
        header: t('attendance_col_id'),
        cell: (info) => <span>{info.getValue()}</span>,
      }),
      columnHelper.accessor('clock_in_at', {
        header: t('attendance_col_in'),
        cell: (info) => <span>{formatDate(info.getValue())}</span>,
      }),
      columnHelper.accessor((r) => r, {
        id: 'name',
        header: t('attendance_col_name'),
        cell: (info) => <span>{displayName(info.getValue())}</span>,
      }),
      columnHelper.accessor('role', {
        header: t('attendance_col_role'),
        cell: (info) => (
          <Badge
            className={`${roleBadgeColors[info.getValue()] || 'bg-gray-500 text-white'} border-0 text-sm`}
          >
            {t(info.getValue()) || info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('email', {
        header: t('attendance_col_email'),
        cell: (info) => <span>{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('phone', {
        header: t('attendance_col_phone'),
        cell: (info) => (
          <span>{info.getValue() ? formatPhone(info.getValue()!) : '—'}</span>
        ),
      }),
      columnHelper.accessor('clock_out_at', {
        header: t('attendance_col_out'),
        cell: (info) => {
          const rec = info.row.original
          if (!info.getValue()) return <span>—</span>
          return (
            <div className="flex items-center gap-2">
              <span>{formatDate(info.getValue())}</span>
              {rec.auto_clock_out && (
                <Badge
                  className="border-0 text-xs bg-gray-400 text-white"
                  variant="default"
                >
                  {t('attendance_auto')}
                </Badge>
              )}
            </div>
          )
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: page, pageSize: PAGE_SIZE } },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex: page, pageSize: PAGE_SIZE })
        setPage(newState.pageIndex)
      }
    },
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / PAGE_SIZE),
  })

  if (!can(user, 'attendance.view')) return null

  return (
    <div className="p-6">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && !data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b bg-muted/50">
                        {hg.headers.map((header) => (
                          <th
                            key={header.id}
                            className="text-left p-3 font-medium text-muted-foreground"
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
                    {table.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="p-10 text-center text-sm text-muted-foreground"
                        >
                          {t('attendance_empty')}
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {data && data.total > PAGE_SIZE && (
                <div className="flex items-center justify-between p-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, data.total)} of{' '}
                    {data.total}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('pagination_prev')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(page + 1) * PAGE_SIZE >= data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('pagination_next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

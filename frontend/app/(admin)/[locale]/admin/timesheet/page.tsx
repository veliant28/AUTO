'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { can } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'

type TimesheetUser = {
  user_id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role: string
  days: Record<string, number>
  total_minutes: number
}

/** Фамилия + Имя, затем full_name, затем email */
function displayName(u: TimesheetUser): string {
  const parts = [u.last_name, u.first_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (u.full_name) return u.full_name
  return u.email || `#${u.user_id}`
}

type TimesheetResponse = {
  month: string
  work_start: string
  work_end: string
  days: string[]
  users: TimesheetUser[]
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

/** Минуты → «9:00» / «8:30» */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 || day === 6
}

/** Date → 'YYYY-MM' */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TimesheetPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')

  const now = new Date()
  const currentMonthKey = monthKey(now)

  // undefined = текущий месяц; дата из календаря в топ-баре задаёт месяц/год
  const [timesheetMonth, setTimesheetMonth] = React.useState<Date | undefined>(
    undefined,
  )
  const [userId, setUserId] = React.useState<number | null>(null)

  // Мост с календарём в топ-баре (как у страницы «Фиксация»)
  React.useEffect(() => {
    ;(window as any).__timesheetSetMonth = (d?: Date) => {
      setTimesheetMonth(d)
      setUserId(null)
    }
    return () => {
      delete (window as any).__timesheetSetMonth
    }
  }, [])

  React.useEffect(() => {
    ;(window as any).__timesheetMonth = timesheetMonth
    return () => {
      delete (window as any).__timesheetMonth
    }
  }, [timesheetMonth])

  // Селект сотрудника живёт в топ-баре — синхронизируем через мост
  React.useEffect(() => {
    ;(window as any).__timesheetSetEmployee = (id: number | null) => {
      setUserId(id)
    }
    return () => {
      delete (window as any).__timesheetSetEmployee
    }
  }, [])

  React.useEffect(() => {
    ;(window as any).__timesheetEmployee = userId
    return () => {
      delete (window as any).__timesheetEmployee
    }
  }, [userId])

  const month = timesheetMonth ? monthKey(timesheetMonth) : currentMonthKey

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-timesheet', month],
    queryFn: async () => {
      const { data } = await api.get('/admin/attendance/timesheet', {
        params: { month },
      })
      return data as TimesheetResponse
    },
    enabled: can(user, 'attendance.view') && !!month,
  })

  React.useEffect(() => {
    if (isError) toast.error(t('timesheet_load_error'))
  }, [isError, t])

  if (!can(user, 'attendance.view')) return null

  const allUsers = data?.users || []
  const visibleUsers = userId
    ? allUsers.filter((u) => u.user_id === userId)
    : allUsers
  const days = data?.days || []

  return (
    <div className="p-6">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && !data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                      {t('timesheet_col_employee')}
                    </th>
                    {days.map((d) => (
                      <th
                        key={d}
                        className={`p-1.5 text-center font-medium min-w-[44px] ${
                          isWeekend(d)
                            ? 'text-muted-foreground/60'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {Number(d.split('-')[2])}
                      </th>
                    ))}
                    <th className="p-3 text-left font-medium text-muted-foreground min-w-[80px]">
                      {t('timesheet_col_total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={days.length + 2}
                        className="p-10 text-center text-sm text-muted-foreground"
                      >
                        {t('timesheet_empty')}
                      </td>
                    </tr>
                  ) : (
                    visibleUsers.map((u) => (
                      <tr
                        key={u.user_id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="p-3 sticky left-0 bg-card z-10">
                          <div className="min-w-[180px]">
                            <Badge
                              className={`${roleBadgeColors[u.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                            >
                              {t(u.role) || u.role}
                            </Badge>
                            <div className="font-medium mt-0.5">
                              {displayName(u)}
                            </div>
                          </div>
                        </td>
                        {days.map((d) => {
                          const minutes = u.days[d]
                          const weekend = isWeekend(d)
                          return (
                            <td
                              key={d}
                              className={`p-1.5 text-center ${
                                weekend
                                  ? minutes
                                    ? 'bg-muted/40'
                                    : 'bg-muted/20'
                                  : ''
                              }`}
                            >
                              {minutes ? (
                                <span className="font-mono text-xs">
                                  {formatMinutes(minutes)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">
                                  ·
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="p-3 font-semibold">
                          {formatMinutes(u.total_minutes)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

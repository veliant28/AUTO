'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { formatDateTime } from '@/lib/dates'
import { formatPhone } from '@/components/ui/PhoneInput'
import api from '@/lib/api'
import { can } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useTimezone } from '@/hooks/useTimezone'

type TimesheetUser = {
  user_id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role: string
  /** Эффективные минуты дня: ручная правка, если есть, иначе авторасчёт */
  days: Record<string, number>
  /** Только дни с ручной правкой администрации */
  manual_days: Record<string, number>
  /** Авторасчёт из сессий (до ручных правок) */
  auto_days: Record<string, number>
  total_minutes: number
}

type TimesheetResponse = {
  month: string
  work_start: string
  work_end: string
  days: string[]
  users: TimesheetUser[]
}

type ActorInfo = {
  user_id: number
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  role: string
}

type HistoryItem = {
  id: number
  work_date: string
  minutes_before: number | null
  minutes_after: number | null
  changed_at: string
  employee: ActorInfo
  changed_by: ActorInfo
}

/** Фамилия + Имя, затем full_name, затем email */
function displayName(u: {
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email?: string | null
  user_id: number
}): string {
  const parts = [u.last_name, u.first_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (u.full_name) return u.full_name
  return u.email || `#${u.user_id}`
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

/**
 * Парсинг ввода часов. Возвращает минуты 0..1440;
 * null — пустая строка (вернуть авторасчёт); -1 — невалидный ввод.
 */
function parseHoursToMinutes(raw: string): number | null | -1 {
  const s = raw.trim().replace(',', '.')
  if (s === '') return null
  let h = 0
  let m = 0
  if (s.includes(':')) {
    const [hh, mm] = s.split(':')
    if (!/^\d{1,2}$/.test(hh.trim()) || !/^\d{1,2}$/.test((mm || '').trim())) {
      return -1
    }
    h = Number(hh)
    m = Number(mm)
  } else {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return -1
    const v = Number(s)
    if (!Number.isFinite(v) || v > 24) return -1
    h = Math.floor(v)
    m = Math.round((v - h) * 60)
    if (m === 60) {
      h += 1
      m = 0
    }
  }
  if (!Number.isInteger(h) || h < 0 || h > 24) return -1
  if (!Number.isInteger(m) || m < 0 || m > 59) return -1
  const total = h * 60 + m
  return total > 1440 ? -1 : total
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

/** 'YYYY-MM-DD' → «03.09.2026» для колонки «День табеля» в истории */
function shortDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

/**
 * Гарантируем наличие новых полей ответа: кэш react-query мог сохранить
 * ответ от старой версии API (без manual_days/auto_days) — падать нельзя.
 */
function normalizeTimesheetUser(u: Partial<TimesheetUser>): TimesheetUser {
  return {
    ...(u as TimesheetUser),
    days: u.days || {},
    manual_days: u.manual_days || {},
    auto_days: u.auto_days || {},
    total_minutes: u.total_minutes || 0,
  }
}

export default function TimesheetPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const timezone = useTimezone()

  const now = new Date()
  const currentMonthKey = monthKey(now)

  // undefined = текущий месяц; дата из календаря в топ-баре задаёт месяц/год
  const [timesheetMonth, setTimesheetMonth] = React.useState<Date | undefined>(
    undefined,
  )
  const [userId, setUserId] = React.useState<number | null>(null)

  const canEdit = can(user, 'attendance.edit')

  // Несохранённые правки: key = `${user_id}|${date}` → minutes | null (null = вернуть авто)
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, number | null>
  >({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  // Показываем синий тост-напоминание один раз на «пачку» правок
  const remindedRef = useRef(false)
  // Диалог при переключении месяца с несохранёнными правками
  const [monthConfirm, setMonthConfirm] = useState<{
    next: Date | undefined
  } | null>(null)
  const pendingRef = useRef(pendingEdits)
  pendingRef.current = pendingEdits

  const cellKey = (uid: number, d: string) => `${uid}|${d}`

  const pendingCount = useMemo(
    () => Object.keys(pendingEdits).length,
    [pendingEdits],
  )

  const applyMonth = (d: Date | undefined) => {
    setTimesheetMonth(d)
    setUserId(null)
    setPendingEdits({})
    remindedRef.current = false
    setEditingKey(null)
  }

  // Мост с календарём в топ-баре (как у страницы «Фиксация»); при наличии
  // несохранённых правок спрашиваем подтверждение
  useEffect(() => {
    ;(window as any).__timesheetSetMonth = (d?: Date) => {
      if (pendingRef.current && Object.keys(pendingRef.current).length > 0) {
        setMonthConfirm({ next: d })
      } else {
        setTimesheetMonth(d)
        setUserId(null)
      }
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

  // История ручных правок — только для тех, кто может редактировать табель;
  // фильтруется по выбранному в топ-баре сотруднику вместе с табелем
  const { data: historyData } = useQuery({
    queryKey: ['admin-timesheet-history', month, userId],
    queryFn: async () => {
      const { data } = await api.get(
        '/admin/attendance/timesheet/manual-history',
        {
          params: { month, ...(userId ? { user_id: userId } : {}) },
        },
      )
      return data as { month: string; items: HistoryItem[] }
    },
    enabled: canEdit && !!month,
  })

  const saveTimesheet = async () => {
    const pending = pendingRef.current
    const entries = Object.entries(pending)
    if (entries.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await api.put('/admin/attendance/timesheet/manual', {
        entries: entries.map(([key, minutes]) => {
          const [user_id, work_date] = key.split('|')
          return { user_id: Number(user_id), work_date, minutes }
        }),
      })
      toast.success(t('timesheet_saved'))
      queryClient.invalidateQueries({ queryKey: ['admin-timesheet', month] })
      queryClient.invalidateQueries({
        queryKey: ['admin-timesheet-history', month, userId],
      })
      setPendingEdits({})
      remindedRef.current = false
      setEditingKey(null)
    } catch {
      toast.error(t('timesheet_save_error'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Кнопка «Сохранить» в топ-баре (появляется только при несохранённых правках)
  useEffect(() => {
    if (!canEdit) return
    ;(window as any).__timesheetDirty = pendingCount > 0
    ;(window as any).__saveTimesheet = saveTimesheet
    return () => {
      delete (window as any).__timesheetDirty
      delete (window as any).__saveTimesheet
    }
  })

  React.useEffect(() => {
    if (isError) toast.error(t('timesheet_load_error'))
  }, [isError, t])

  if (!can(user, 'attendance.view')) return null

  const allUsers = (data?.users || []).map(normalizeTimesheetUser)
  const visibleUsers = userId
    ? allUsers.filter((u) => u.user_id === userId)
    : allUsers
  const days = data?.days || []

  // Открыть редактирование ячейки (только с правом attendance.edit)
  const startEdit = (u: TimesheetUser, d: string) => {
    if (!canEdit) return
    const key = cellKey(u.user_id, d)
    if (editingKey) return
    const hasManual = Object.prototype.hasOwnProperty.call(u.manual_days, d)
    const base = hasManual
      ? (u.manual_days[d] ?? 0)
      : (u.auto_days?.[d] ?? u.days[d] ?? 0)
    setEditingKey(key)
    setDraft(base > 0 ? formatMinutes(base) : '')
  }

  /** Правка ничего не меняет (то же значение в том же режиме) — не копим dirty */
  const isNoOp = (u: TimesheetUser, d: string, value: number | null) => {
    const hasManual = Object.prototype.hasOwnProperty.call(u.manual_days, d)
    if (value === null) return !hasManual
    if (hasManual) return (u.manual_days[d] ?? 0) === value
    const auto = u.auto_days?.[d] ?? 0
    return auto === value && auto > 0
  }

  const commitEdit = (u: TimesheetUser, d: string) => {
    const parsed = parseHoursToMinutes(draft)
    if (parsed === -1) {
      toast.warning(t('timesheet_invalid_time'))
      return
    }
    const key = cellKey(u.user_id, d)
    if (!isNoOp(u, d, parsed)) {
      setPendingEdits((prev) => ({ ...prev, [key]: parsed }))
      if (!remindedRef.current) {
        remindedRef.current = true
        toast.info(t('timesheet_edit_reminder'))
      }
    }
    setEditingKey(null)
  }

  const adjustDraft = (deltaMin: number) => {
    const parsed = parseHoursToMinutes(draft)
    if (parsed === -1 || parsed === null) return
    const next = Math.min(1440, Math.max(0, parsed + deltaMin))
    setDraft(next > 0 ? formatMinutes(next) : '')
  }

  // Предпросмотр итога: текущий итог ± несохранённые правки
  const totalPreview = (u: TimesheetUser) => {
    let total = u.total_minutes
    for (const d of days) {
      const key = cellKey(u.user_id, d)
      if (!Object.prototype.hasOwnProperty.call(pendingEdits, key)) continue
      const value = pendingEdits[key]
      const current = u.days[d] ?? 0
      const next = value === null ? (u.auto_days?.[d] ?? 0) : value
      total += next - current
    }
    return total
  }

  const historyItems = historyData?.items || []

  return (
    <div className="p-6">
      <Card className="overflow-hidden">
        {canEdit && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 border-b text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-200/70 border border-amber-300" />
              {t('timesheet_legend_manual')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-200/70 border-2 border-amber-500" />
              {t('timesheet_legend_pending')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-200/40 border-2 border-dashed border-amber-400" />
              {t('timesheet_legend_auto')}
            </span>
          </div>
        )}
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
                          const key = cellKey(u.user_id, d)
                          const weekend = isWeekend(d)
                          const hasManual =
                            Object.prototype.hasOwnProperty.call(
                              u.manual_days,
                              d,
                            )
                          const hasPending =
                            Object.prototype.hasOwnProperty.call(
                              pendingEdits,
                              key,
                            )
                          const isEditing = canEdit && editingKey === key
                          const highlight = canEdit && (hasManual || hasPending)

                          let cellClass = 'p-1.5 text-center align-middle'
                          if (isEditing) {
                            // Инпут рисуем поверх ячейки (absolute) — он не участвует
                            // в лейауте таблицы и не может растянуть колонку.
                            // z-20 поднимает редактор выше sticky-колонки «Сотрудник»,
                            // чтобы его подсветка не обрезалась ею при прокрутке.
                            cellClass += ' relative z-20'
                          }
                          if (highlight) {
                            cellClass += ' bg-amber-200/60'
                            if (hasPending) {
                              const pending = pendingEdits[key]
                              cellClass +=
                                pending === null
                                  ? ' outline-2 outline-dashed outline-offset-[-2px] outline-amber-500'
                                  : ' outline-2 outline-solid outline-offset-[-2px] outline-amber-500'
                            }
                          } else if (weekend) {
                            const min = u.days[d]
                            cellClass += min ? ' bg-muted/40' : ' bg-muted/20'
                          }

                          let content: React.ReactNode
                          if (isEditing) {
                            content = (
                              <Input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    commitEdit(u, d)
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    setEditingKey(null)
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault()
                                    adjustDraft(15)
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    adjustDraft(-15)
                                  }
                                }}
                                onBlur={() => setEditingKey(null)}
                                className="absolute inset-0 h-full w-full min-w-0 bg-transparent px-1 text-center font-mono text-xs focus-visible:outline-none focus-visible:ring-0"
                              />
                            )
                          } else {
                            const pending = hasPending
                              ? pendingEdits[key]
                              : undefined
                            if (
                              canEdit &&
                              pending !== undefined &&
                              pending === null
                            ) {
                              content = (
                                <span className="text-[10px] italic text-muted-foreground">
                                  авто
                                </span>
                              )
                            } else {
                              const minutes =
                                pending !== undefined && pending !== null
                                  ? pending
                                  : (u.days[d] ?? 0)
                              content = minutes ? (
                                <span className="font-mono text-xs">
                                  {formatMinutes(minutes)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">
                                  ·
                                </span>
                              )
                            }
                          }

                          return (
                            <td
                              key={d}
                              className={`${cellClass} ${
                                canEdit && !isEditing ? 'cursor-pointer' : ''
                              }`}
                              onClick={(e) => {
                                if (isEditing) return
                                startEdit(u, d)
                                // Полностью показываем ячейку в области прокрутки,
                                // чтобы редактор не оказался под sticky-колонкой
                                // или у нижней кромки таблицы
                                requestAnimationFrame(() =>
                                  e.currentTarget.scrollIntoView({
                                    block: 'nearest',
                                    inline: 'nearest',
                                  }),
                                )
                              }}
                              title={
                                canEdit && hasManual
                                  ? `${formatMinutes(u.manual_days[d] ?? 0)} (${t('timesheet_manual_cell')})`
                                  : undefined
                              }
                            >
                              {content}
                            </td>
                          )
                        })}
                        <td className="p-3 font-semibold">
                          {canEdit && pendingCount > 0
                            ? formatMinutes(Math.max(0, totalPreview(u)))
                            : formatMinutes(u.total_minutes)}
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

      {/* История ручных правок — только для администрации и только если в
          выбранном месяце кто-то что-то менял */}
      {canEdit && historyItems.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b font-semibold">
              {t('timesheet_history_title')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">
                      {t('timesheet_history_when')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      ID
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground min-w-[200px]">
                      {t('timesheet_history_who')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">
                      {t('timesheet_history_role')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      ID
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground min-w-[200px]">
                      {t('timesheet_history_employee')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">
                      {t('timesheet_history_role')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      {t('timesheet_history_day')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      {t('timesheet_history_before_after')}
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">
                      {t('timesheet_history_type')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((h) => {
                    const typeLabel =
                      h.minutes_after === null
                        ? {
                            key: 'timesheet_log_reset',
                            cls: 'bg-gray-500 text-white',
                          }
                        : h.minutes_before === null
                          ? {
                              key: 'timesheet_log_created',
                              cls: 'bg-blue-500 text-white',
                            }
                          : {
                              key: 'timesheet_log_edited',
                              cls: 'bg-amber-500 text-white',
                            }
                    return (
                      <tr
                        key={h.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(h.changed_at, timezone, {
                            seconds: false,
                          })}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                          {h.changed_by.user_id}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">
                            {displayName(h.changed_by)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {h.changed_by.phone
                              ? formatPhone(h.changed_by.phone)
                              : ''}
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {h.changed_by.role ? (
                            <Badge
                              className={`${roleBadgeColors[h.changed_by.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                            >
                              {t(h.changed_by.role) || h.changed_by.role}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                          {h.employee.user_id}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">
                            {displayName(h.employee)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {h.employee.phone
                              ? formatPhone(h.employee.phone)
                              : ''}
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {h.employee.role ? (
                            <Badge
                              className={`${roleBadgeColors[h.employee.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                            >
                              {t(h.employee.role) || h.employee.role}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {shortDay(h.work_date)}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono text-xs">
                          {h.minutes_before === null
                            ? '·'
                            : formatMinutes(h.minutes_before)}
                          <span className="text-muted-foreground mx-1">→</span>
                          {h.minutes_after === null
                            ? '·'
                            : formatMinutes(h.minutes_after)}
                        </td>
                        <td className="p-3">
                          <Badge
                            className={`${typeLabel.cls} border-0 text-sm whitespace-nowrap`}
                          >
                            {t(typeLabel.key)}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Подтверждение переключения месяца при несохранённых правках */}
      <Dialog
        open={!!monthConfirm}
        onOpenChange={(open) => !open && setMonthConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('timesheet_unsaved_title')}</DialogTitle>
            <DialogDescription>{t('timesheet_unsaved_body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonthConfirm(null)}>
              {t('timesheet_unsaved_cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                const next = monthConfirm?.next
                setMonthConfirm(null)
                applyMonth(next)
              }}
            >
              {t('timesheet_unsaved_discard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { Card, CardContent } from '@/components/ui/card'
import { TablePagination } from '@/components/admin/TablePagination'
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
import { formatMinutes, parseHoursToMinutes } from '@/lib/timesheetTime'
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
  is_automated: boolean
}

const columnHelper = createColumnHelper<TimesheetUser>()
const historyColumnHelper = createColumnHelper<HistoryItem>()

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

/** Подсветка ячейки дня: выходной или ручная/несохранённая правка */
function dayCellHighlight(
  u: TimesheetUser,
  d: string,
  pendingEdits: Record<string, number | null>,
  canEdit: boolean,
): string {
  const key = `${u.user_id}|${d}`
  const hasManual = Object.prototype.hasOwnProperty.call(u.manual_days, d)
  const hasPending = Object.prototype.hasOwnProperty.call(pendingEdits, key)
  if (canEdit && (hasManual || hasPending)) {
    const pending = pendingEdits[key]
    return `bg-amber-200/60 ${
      pending === null
        ? 'outline-2 outline-dashed outline-offset-[-2px] outline-amber-500'
        : 'outline-2 outline-solid outline-offset-[-2px] outline-amber-500'
    }`
  }
  if (isWeekend(d)) return u.days[d] ? 'bg-muted/40' : 'bg-muted/20'
  return ''
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

  // Стабильные данные для TanStack: новая ссылка массива на каждый рендер
  // заставляет таблицу пересчитываться и уходит в цикл перерисовок
  const allUsers = React.useMemo(
    () => (data?.users || []).map(normalizeTimesheetUser),
    [data?.users],
  )
  const visibleUsers = React.useMemo(
    () => (userId ? allUsers.filter((u) => u.user_id === userId) : allUsers),
    [allUsers, userId],
  )
  // Стабильный список дней: колонки пересобираются только при смене месяца,
  // поэтому редактор ячейки не пересоздаётся во время ввода
  const days = React.useMemo(() => data?.days || [], [data?.days])

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

  // Живое состояние правок: колонки TanStack должны быть стабильными, иначе
  // React пересоздаёт инпут редактора на каждый символ — ввод рвётся.
  // Ячейки читают актуальные значения из ref при каждом рендере.
  const editStateRef = useRef<Record<string, any>>({})
  editStateRef.current = {
    canEdit,
    editingKey,
    draft,
    pendingEdits,
    pendingCount,
    cellKey,
    startEdit,
    commitEdit,
    adjustDraft,
    setDraft,
    setEditingKey,
    totalPreview,
  }

  // Колонки — те же дефиниции и рендер, что в таблице заказов
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'employee',
        header: t('timesheet_col_employee'),
        size: 200,
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="min-w-[180px]">
              <Badge
                className={`${roleBadgeColors[u.role] || 'bg-gray-500 text-white'} border-0 text-sm`}
              >
                {t(u.role) || u.role}
              </Badge>
              <div className="font-medium mt-0.5">{displayName(u)}</div>
            </div>
          )
        },
      }),
      ...days.map((d) =>
        columnHelper.display({
          id: `day-${d}`,
          header: () => (
            <span className={isWeekend(d) ? 'text-muted-foreground/60' : ''}>
              {Number(d.split('-')[2])}
            </span>
          ),
          size: 44,
          cell: ({ row }) => {
            // Живое состояние правок читаем из ref: колонки стабильны, из-за
            // этого React не пересоздаёт инпут редактора на каждый символ
            const st = editStateRef.current
            const u = row.original
            const key = cellKey(u.user_id, d)
            const weekend = isWeekend(d)
            const hasManual = Object.prototype.hasOwnProperty.call(
              u.manual_days,
              d,
            )
            const hasPending = Object.prototype.hasOwnProperty.call(
              st.pendingEdits,
              key,
            )
            const isEditing = st.canEdit && st.editingKey === key

            // Подсветку (выходной, ручная правка) и позиционирование редактора
            // держит сама ячейка td — см. разметку таблицы, поэтому div
            // отвечает только за контент и растягивается по ней
            const cellClass = isEditing ? 'p-1.5 z-20' : 'p-1.5'

            const pending = hasPending ? st.pendingEdits[key] : undefined
            let display: React.ReactNode
            if (st.canEdit && pending !== undefined && pending === null) {
              display = (
                <span className="text-[10px] italic text-muted-foreground">
                  авто
                </span>
              )
            } else {
              const minutes =
                pending !== undefined && pending !== null
                  ? pending
                  : (u.days[d] ?? 0)
              display = minutes ? (
                <span className="font-mono text-xs">
                  {formatMinutes(minutes)}
                </span>
              ) : (
                <span className="text-muted-foreground/40">·</span>
              )
            }

            return (
              <div
                className={`${cellClass} ${
                  st.canEdit && !isEditing ? 'cursor-pointer' : ''
                }`}
                onClick={(e) => {
                  if (isEditing) return
                  st.startEdit(u, d)
                  // Полностью показываем ячейку в области прокрутки,
                  // чтобы редактор не оказался у кромки таблицы
                  const cell = e.currentTarget
                  requestAnimationFrame(() =>
                    cell?.scrollIntoView({
                      block: 'nearest',
                      inline: 'nearest',
                    }),
                  )
                }}
                title={
                  st.canEdit && hasManual
                    ? `${formatMinutes(u.manual_days[d] ?? 0)} (${t('timesheet_manual_cell')})`
                    : undefined
                }
              >
                {isEditing ? (
                  <>
                    {/* Невидимая копия содержимого держит высоту ячейки,
                        пока редактор нарисован поверх (absolute) */}
                    <span className="invisible" aria-hidden="true">
                      {display}
                    </span>
                    <Input
                      autoFocus
                      value={st.draft}
                      onChange={(e) => st.setDraft(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          st.commitEdit(u, d)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          st.setEditingKey(null)
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          st.adjustDraft(15)
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          st.adjustDraft(-15)
                        }
                      }}
                      onBlur={() => st.setEditingKey(null)}
                      className="absolute inset-0 h-full w-full min-w-0 bg-transparent px-1 text-center font-mono text-xs focus-visible:outline-none focus-visible:ring-0"
                    />
                  </>
                ) : (
                  display
                )}
              </div>
            )
          },
        }),
      ),
      columnHelper.display({
        id: 'total',
        header: t('timesheet_col_total'),
        size: 80,
        cell: ({ row }) => {
          const st = editStateRef.current
          return (
            <span className="font-semibold">
              {st.canEdit && st.pendingCount > 0
                ? formatMinutes(Math.max(0, st.totalPreview(row.original)))
                : formatMinutes(row.original.total_minutes)}
            </span>
          )
        },
      }),
    ],
    [days, t],
  )

  // Колонки — те же дефиниции и рендер, что в таблице заказов
  const historyColumns = useMemo(
    () => [
      historyColumnHelper.accessor('changed_at', {
        header: t('timesheet_history_when'),
        size: 180,
        cell: (info) => (
          <span className="text-muted-foreground whitespace-nowrap">
            {formatDateTime(info.getValue(), timezone, { seconds: false })}
          </span>
        ),
      }),
      historyColumnHelper.accessor('changed_by.user_id', {
        header: 'ID',
        size: 80,
        cell: (info) => (
          <span className="font-mono text-muted-foreground whitespace-nowrap">
            {info.row.original.is_automated ? '—' : info.getValue()}
          </span>
        ),
      }),
      historyColumnHelper.accessor('changed_by', {
        header: t('timesheet_history_who'),
        size: 200,
        cell: (info) => {
          if (info.row.original.is_automated) {
            return <div className="font-medium">{t('system_actor')}</div>
          }
          const actor = info.getValue()
          return (
            <>
              <div className="font-medium">{displayName(actor)}</div>
              <div className="text-xs text-muted-foreground">
                {actor.phone ? formatPhone(actor.phone) : ''}
              </div>
            </>
          )
        },
      }),
      historyColumnHelper.accessor('changed_by.role', {
        header: t('timesheet_history_role'),
        size: 140,
        cell: (info) => {
          if (info.row.original.is_automated) {
            return (
              <span className="whitespace-nowrap">
                <AnimatedBadge swapKey={`system-${info.row.original.id}`}>
                  <Badge className="bg-black text-white dark:bg-white dark:text-black border-0 text-sm transition-colors duration-500">
                    {t('system_actor')}
                  </Badge>
                </AnimatedBadge>
              </span>
            )
          }
          const role = info.getValue()
          return role ? (
            <span className="whitespace-nowrap">
              <Badge
                className={`${roleBadgeColors[role] || 'bg-gray-500 text-white'} border-0 text-sm`}
              >
                {t(role) || role}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      historyColumnHelper.accessor('employee.user_id', {
        header: 'ID',
        size: 80,
        cell: (info) => (
          <span className="font-mono text-muted-foreground whitespace-nowrap">
            {info.getValue()}
          </span>
        ),
      }),
      historyColumnHelper.accessor('employee', {
        header: t('timesheet_history_employee'),
        size: 200,
        cell: (info) => {
          const actor = info.getValue()
          return (
            <>
              <div className="font-medium">{displayName(actor)}</div>
              <div className="text-xs text-muted-foreground">
                {actor.phone ? formatPhone(actor.phone) : ''}
              </div>
            </>
          )
        },
      }),
      historyColumnHelper.accessor('employee.role', {
        header: t('timesheet_history_role'),
        size: 140,
        cell: (info) => {
          const role = info.getValue()
          return role ? (
            <span className="whitespace-nowrap">
              <Badge
                className={`${roleBadgeColors[role] || 'bg-gray-500 text-white'} border-0 text-sm`}
              >
                {t(role) || role}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      historyColumnHelper.accessor('work_date', {
        header: t('timesheet_history_day'),
        size: 120,
        cell: (info) => (
          <span className="whitespace-nowrap">{shortDay(info.getValue())}</span>
        ),
      }),
      historyColumnHelper.display({
        id: 'minutes',
        header: t('timesheet_history_before_after'),
        size: 140,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs">
            {row.original.minutes_before === null
              ? '·'
              : formatMinutes(row.original.minutes_before)}
            <span className="text-muted-foreground mx-1">→</span>
            {row.original.minutes_after === null
              ? '·'
              : formatMinutes(row.original.minutes_after)}
          </span>
        ),
      }),
      historyColumnHelper.display({
        id: 'type',
        header: t('timesheet_history_type'),
        size: 140,
        cell: ({ row }) => {
          const typeLabel =
            row.original.minutes_after === null
              ? {
                  key: 'timesheet_log_reset',
                  cls: 'bg-gray-500 text-white',
                }
              : row.original.minutes_before === null
                ? {
                    key: 'timesheet_log_created',
                    cls: 'bg-blue-500 text-white',
                  }
                : {
                    key: 'timesheet_log_edited',
                    cls: 'bg-amber-500 text-white',
                  }
          return (
            <Badge
              className={`${typeLabel.cls} border-0 text-sm whitespace-nowrap`}
            >
              {t(typeLabel.key)}
            </Badge>
          )
        },
      }),
    ],
    [t, timezone],
  )

  const table = useReactTable({
    data: visibleUsers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })

  const historyTable = useReactTable({
    data: historyItems,
    columns: historyColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })

  if (!can(user, 'attendance.view')) return null

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
                    {visibleUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="p-10 text-center text-sm text-muted-foreground"
                        >
                          {t('timesheet_empty')}
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          {row.getVisibleCells().map((cell) => {
                            const isDay = cell.column.id.startsWith('day-')
                            const d = isDay ? cell.column.id.slice(4) : ''
                            const st = editStateRef.current
                            const editing =
                              isDay &&
                              st.canEdit &&
                              st.editingKey === `${row.original.user_id}|${d}`
                            return (
                              <td
                                key={cell.id}
                                className={
                                  isDay
                                    ? `p-0 align-middle relative ${editing ? 'z-20' : ''} ${dayCellHighlight(row.original, d, st.pendingEdits, st.canEdit)}`
                                    : 'p-3'
                                }
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination table={table} />
            </>
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
              <table className="w-full text-sm">
                <thead>
                  {historyTable.getHeaderGroups().map((hg) => (
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
                  {historyTable.getRowModel().rows.map((row) => (
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
            <TablePagination table={historyTable} />
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

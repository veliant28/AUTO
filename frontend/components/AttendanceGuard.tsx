'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/lib/toast'

/**
 * Блокировка админки до фиксации входа.
 *
 * Если для роли пользователя в настройках включена фиксация рабочего
 * времени и он ещё не зафиксировал вход за сегодня — любая страница
 * админки (кроме самой «Фиксации») не рендерится, показывается синий тост
 * и происходит редирект на /admin/attendance. После фиксации входа
 * блокировка снимается автоматически.
 */
export function AttendanceGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('admin')
  const { user } = useAuthStore()

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useQuery({
    // Отдельный ключ: 'public-settings' резервируют другие хуки (brandName/timezone)
    // со staleTime 60s, и их кэш может содержать только {brand_name}
    queryKey: ['attendance-settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings')
      return data as {
        brand_name: string
        timezone: string
        work_start_time: string
        work_end_time: string
        track_admin: boolean
        track_manager: boolean
        track_operator: boolean
      }
    },
  })

  const trackKey =
    user?.role === 'admin'
      ? 'track_admin'
      : user?.role === 'manager'
        ? 'track_manager'
        : user?.role === 'operator'
          ? 'track_operator'
          : null
  const trackingEnabled = trackKey
    ? !!settings?.[trackKey as keyof typeof settings]
    : false

  const { data: todayData, isError: todayError } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => {
      const { data } = await api.get('/admin/attendance/today')
      return data as {
        sessions: {
          clock_in_at: string | null
          clock_out_at: string | null
          auto_clock_out: boolean
        }[]
        open_session: {
          clock_in_at: string | null
          clock_out_at: string | null
          auto_clock_out: boolean
        } | null
      }
    },
    refetchInterval: 15000,
    enabled: trackingEnabled && !!user,
  })

  const onAttendancePage = pathname.includes('/admin/attendance')
  // Админка доступна, пока есть ОТКРЫТАЯ сессия (сотрудник «на работе»).
  // После фиксации выхода — снова блокируем до следующего входа.
  const hasOpenSession = !!todayData?.open_session

  // Решение принимаем только когда настройки и статус входа загружены
  const ready =
    !(settingsLoading && !settingsError) &&
    !(trackingEnabled && !todayError && !todayData)
  const blocked =
    ready && trackingEnabled && !hasOpenSession && !onAttendancePage
  const toastedRef = useRef(false)

  useEffect(() => {
    if (blocked) {
      if (!toastedRef.current) {
        toastedRef.current = true
        toast.info(t('attendance_guard_toast'))
      }
      const locale = pathname.split('/')[1] || 'ru'
      router.replace(`/${locale}/admin/attendance`)
    } else {
      toastedRef.current = false
    }
  }, [blocked, pathname, router, t])

  // Пока настройки и статус входа не загрузились — не показываем страницы,
  // чтобы ничего не «просвечивало» до вердикта guard'а. При ошибке запросов
  // блокировку не применяем — админка работает как раньше.
  if (!ready) return null

  if (blocked) return null
  return <>{children}</>
}

export default AttendanceGuard

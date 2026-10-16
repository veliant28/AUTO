'use client'

import { useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useTranslations } from 'next-intl'
import { toast } from '@/lib/toast'
import { requirePerm } from '@/lib/permissions'

/**
 * Возвращает функцию-гард для кнопок: если у пользователя нет права —
 * синий info-тост «Недостаточно прав» и false (действие не выполняется).
 *
 * Функция стабильна между рендерами (useCallback): иначе зависящие от неё
 * useMemo со таблицами (columns) пересчитываются на каждый рендер и таблица
 * пересоздаёт ячейки.
 */
export function useRequirePerm() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  return useCallback(
    (perm: string) => requirePerm(user, perm, { toast, t }),
    [user, t],
  )
}

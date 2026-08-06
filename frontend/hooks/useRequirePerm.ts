'use client'

import { useAuthStore } from '@/store/authStore'
import { useTranslations } from 'next-intl'
import { toast } from '@/lib/toast'
import { requirePerm } from '@/lib/permissions'

/**
 * Возвращает функцию-гард для кнопок: если у пользователя нет права —
 * синий info-тост «Недостаточно прав» и false (действие не выполняется).
 */
export function useRequirePerm() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  return (perm: string) => requirePerm(user, perm, { toast, t })
}

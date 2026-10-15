'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from '@/lib/toast'

/**
 * Копирует номер ТТН в буфер обмена без пробелов и показывает синий тост.
 * Возвращает false, если номера нет (маска/пустое значение) — в этом случае
 * ничего не копируется и тост не показывается.
 */
export function useCopyTtn() {
  const t = useTranslations('common')

  return useCallback(
    async (npNumber?: string | null) => {
      const digits = (npNumber || '').replace(/\D/g, '')
      if (!digits) return false
      try {
        await navigator.clipboard.writeText(digits)
        toast.info(t('ttn_copied'))
        return true
      } catch {
        return false
      }
    },
    [t],
  )
}

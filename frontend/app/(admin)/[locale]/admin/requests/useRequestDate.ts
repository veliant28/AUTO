'use client'

import { useMemo } from 'react'
import { formatDateTime } from '@/lib/dates'
import { useTimezoneStore } from '@/store/timezoneStore'

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

/** Форматирование дат админки в текущей локали и часовом поясе настроек */
export function useRequestDate() {
  const timezone = useTimezoneStore((s) => s.timezone)
  return useMemo(() => {
    let locale = 'ru-RU'
    try {
      const p = window.location.pathname.match(/^\/(ru|ua|en)/)?.[1]
      locale = LOCALE_MAP[p || 'ru'] || 'ru-RU'
    } catch {}
    return (d: string | null | undefined, withSeconds = false) =>
      d ? formatDateTime(d, timezone, { locale, seconds: withSeconds }) : '—'
  }, [timezone])
}

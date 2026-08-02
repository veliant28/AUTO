'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useTimezoneStore } from '@/store/timezoneStore'
import { formatDateTime } from '@/lib/dates'

/**
 * Timezone configured in admin settings (default Europe/Kiev).
 *
 * The store is the client-side source of truth (persisted in localStorage
 * for instant startup); on mount we sync it with the backend `/settings`
 * value, which wins — so the setting survives across browsers/devices.
 */
export function useTimezone(): string {
  const timezone = useTimezoneStore((s) => s.timezone)
  const setTimezone = useTimezoneStore((s) => s.setTimezone)

  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings')
      return data as { brand_name: string; timezone: string }
    },
    staleTime: 60000,
  })

  useEffect(() => {
    if (data?.timezone && data.timezone !== timezone) {
      setTimezone(data.timezone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.timezone])

  return timezone
}

/**
 * Format a backend datetime string in the configured timezone.
 * Accepts an explicit tz override for backward compatibility.
 */
export function formatDate(
  dateStr: string | null | undefined,
  tz?: string,
): string {
  return formatDateTime(dateStr, tz || useTimezoneStore.getState().timezone)
}

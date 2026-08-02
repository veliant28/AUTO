import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'

/** Default timezone — Kyiv (matches backend SiteSettings.timezone default). */
export const DEFAULT_TIMEZONE = 'Europe/Kiev'

interface TimezoneState {
  timezone: string
  setTimezone: (tz: string) => void
}

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set) => ({
      timezone: DEFAULT_TIMEZONE,
      setTimezone: (tz) => set({ timezone: tz }),
    }),
    { name: STORAGE_KEYS.TIMEZONE },
  ),
)

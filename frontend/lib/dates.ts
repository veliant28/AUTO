/**
 * Date helpers for backend API timestamps.
 *
 * The backend stores and returns naive UTC datetimes (e.g.
 * "2026-08-02T09:00:00" — no timezone marker). `new Date()` on such a
 * string treats it as browser-local time, so the displayed clock shows the
 * raw UTC value instead of the local one. These helpers parse the value as
 * UTC and let you render it in any timezone (configured via the admin
 * settings timezone select, default Europe/Kiev).
 */

/** Parse a backend datetime string as UTC (naive values are assumed UTC). */
export function parseApiDate(dt: string | null | undefined): Date | null {
  if (!dt) return null
  // Already has a timezone marker (Z or ±HH:MM) — parse as-is
  if (/Z$|[+-]\d{2}:\d{2}$/.test(dt)) return new Date(dt)
  return new Date(dt.replace(' ', 'T') + 'Z')
}

export interface FormatDateTimeOptions {
  locale?: string
  /** dateStyle-ish: 'short' shows date+time, 'date' date only, 'time' time only */
  mode?: 'short' | 'date' | 'time'
  /** Show seconds (default true for 'short'). */
  seconds?: boolean
}

/**
 * Format a backend datetime string in the given timezone.
 * Returns '—' for missing/invalid values.
 */
export function formatDateTime(
  dt: string | null | undefined,
  timezone: string,
  opts: FormatDateTimeOptions = {},
): string {
  const d = parseApiDate(dt)
  if (!d || isNaN(d.getTime())) return '—'
  const { locale = 'ru-RU', mode = 'short', seconds = true } = opts
  const common: Intl.DateTimeFormatOptions = { timeZone: timezone }
  if (mode === 'date') {
    return d.toLocaleDateString(locale, {
      ...common,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  if (mode === 'time') {
    return d.toLocaleTimeString(locale, {
      ...common,
      hour: '2-digit',
      minute: '2-digit',
      second: seconds ? '2-digit' : undefined,
    })
  }
  return d.toLocaleString(locale, {
    ...common,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
  })
}

// ─── Timezone-aware day ranges (for report filters) ────────────────────────

interface TzParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Extract calendar parts of `at` as seen in the given timezone. */
function partsInTz(tz: string, at: Date): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || '0')
  // "24" appears for midnight in some environments with hour12:false
  const hour = get('hour') === 24 ? 0 : get('hour')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset (ms) of `tz` vs UTC at moment `at`. */
function tzOffsetMs(tz: string, at: Date): number {
  const tzParts = partsInTz(tz, at)
  const utcParts = partsInTz('UTC', at)
  const asTz = Date.UTC(
    tzParts.year,
    tzParts.month - 1,
    tzParts.day,
    tzParts.hour,
    tzParts.minute,
    tzParts.second,
  )
  const asUtc = Date.UTC(
    utcParts.year,
    utcParts.month - 1,
    utcParts.day,
    utcParts.hour,
    utcParts.minute,
    utcParts.second,
  )
  return asTz - asUtc
}

/**
 * Interpret a wall-clock time in `tz` as an absolute moment (Date in UTC).
 * E.g. startOfDayInTz('Europe/Kiev', 2026-08-02T12:00Z) → 2026-08-01T21:00Z.
 */
function wallClockInTz(tz: string, parts: TzParts): Date {
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) -
      tzOffsetMs(
        tz,
        new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)),
      ),
  )
}

/** Start of the day (00:00) containing `at`, in `tz`. */
export function startOfDayInTz(tz: string, at: Date = new Date()): Date {
  const p = partsInTz(tz, at)
  return wallClockInTz(tz, { ...p, hour: 0, minute: 0, second: 0 })
}

/** End of the day (23:59:59.999) containing `at`, in `tz`. */
export function endOfDayInTz(tz: string, at: Date = new Date()): Date {
  const p = partsInTz(tz, at)
  return wallClockInTz(tz, { ...p, hour: 23, minute: 59, second: 59 })
}

/** Start of the month containing `at`, in `tz`. */
export function startOfMonthInTz(tz: string, at: Date = new Date()): Date {
  const p = partsInTz(tz, at)
  return wallClockInTz(tz, {
    year: p.year,
    month: p.month,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  })
}

/** Start of the year containing `at`, in `tz`. */
export function startOfYearInTz(tz: string, at: Date = new Date()): Date {
  const p = partsInTz(tz, at)
  return wallClockInTz(tz, {
    year: p.year,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  })
}

/** `at` minus `days` days (calendar days in `tz`). */
export function subDaysInTz(tz: string, at: Date, days: number): Date {
  const p = partsInTz(tz, at)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day - days, 12))
  const shiftedParts = partsInTz(tz, shifted)
  return wallClockInTz(tz, {
    ...shiftedParts,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
  })
}

/** Legacy alias kept for compatibility. */
export function formatKyivDateTime(
  dt: string | null | undefined,
  locale = 'ru-RU',
): string {
  return formatDateTime(dt, 'Europe/Kiev', { locale })
}

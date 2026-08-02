import {
  parseApiDate,
  formatDateTime,
  startOfDayInTz,
  endOfDayInTz,
  startOfMonthInTz,
  subDaysInTz,
} from '@/lib/dates'

describe('parseApiDate', () => {
  it('parses naive backend datetimes as UTC', () => {
    const d = parseApiDate('2026-08-02T09:00:00')
    expect(d?.toISOString()).toBe('2026-08-02T09:00:00.000Z')
  })

  it('parses datetimes with a space separator', () => {
    const d = parseApiDate('2026-08-02 09:00:00')
    expect(d?.toISOString()).toBe('2026-08-02T09:00:00.000Z')
  })

  it('parses datetimes with explicit Z marker as-is', () => {
    const d = parseApiDate('2026-08-02T09:00:00Z')
    expect(d?.toISOString()).toBe('2026-08-02T09:00:00.000Z')
  })

  it('parses datetimes with numeric offset as-is', () => {
    const d = parseApiDate('2026-08-02T12:00:00+03:00')
    expect(d?.toISOString()).toBe('2026-08-02T09:00:00.000Z')
  })

  it('returns null for empty input', () => {
    expect(parseApiDate(null)).toBeNull()
    expect(parseApiDate('')).toBeNull()
  })
})

describe('formatDateTime', () => {
  it('renders UTC time in the configured timezone', () => {
    // 09:00 UTC = 12:00 in Europe/Kiev (summer, UTC+3)
    expect(formatDateTime('2026-08-02T09:00:00', 'Europe/Kiev')).toContain(
      '12:00',
    )
  })

  it('renders the raw UTC clock when timezone is UTC', () => {
    expect(formatDateTime('2026-08-02T09:00:00', 'UTC')).toContain('09:00')
  })

  it('supports date-only mode', () => {
    const out = formatDateTime('2026-08-02T09:00:00', 'Europe/Kiev', {
      mode: 'date',
    })
    expect(out).toContain('02')
    expect(out).toContain('2026')
    expect(out).not.toContain(':')
  })

  it('returns dash for missing values', () => {
    expect(formatDateTime(null, 'Europe/Kiev')).toBe('—')
  })
})

describe('timezone-aware day ranges', () => {
  // 2026-08-02 12:00 UTC — 15:00 in Kyiv
  const at = new Date('2026-08-02T12:00:00Z')

  it('startOfDayInTz gives midnight in the target tz', () => {
    expect(startOfDayInTz('Europe/Kiev', at).toISOString()).toBe(
      '2026-08-01T21:00:00.000Z',
    )
    expect(startOfDayInTz('UTC', at).toISOString()).toBe(
      '2026-08-02T00:00:00.000Z',
    )
  })

  it('endOfDayInTz gives 23:59:59 in the target tz', () => {
    expect(endOfDayInTz('Europe/Kiev', at).toISOString()).toBe(
      '2026-08-02T20:59:59.000Z',
    )
  })

  it('startOfMonthInTz gives the 1st at midnight in the target tz', () => {
    expect(startOfMonthInTz('Europe/Kiev', at).toISOString()).toBe(
      '2026-07-31T21:00:00.000Z',
    )
  })

  it('subDaysInTz shifts by calendar days in the target tz', () => {
    const before = subDaysInTz('Europe/Kiev', at, 7)
    // 15:00 Kyiv on Aug 2 minus 7 days = 15:00 Kyiv on Jul 26 = 12:00 UTC
    expect(before.toISOString()).toBe('2026-07-26T12:00:00.000Z')
  })
})

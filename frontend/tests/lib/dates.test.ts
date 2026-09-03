import {
  parseApiDate,
  formatDateTime,
  formatMessageTime,
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

describe('formatMessageTime', () => {
  // Fixed "now" so tests don't depend on the machine clock.
  // 2026-09-03 14:00 UTC = 17:00 in Kyiv (summer, UTC+3).
  const NOW = new Date('2026-09-03T14:00:00Z')

  it('shows "только что" for messages younger than a minute', () => {
    expect(formatMessageTime('2026-09-03T13:59:40Z', 'Europe/Kiev', NOW)).toBe(
      'только что',
    )
  })

  it('keeps relative minutes below one hour', () => {
    expect(formatMessageTime('2026-09-03T13:01:00Z', 'Europe/Kiev', NOW)).toBe(
      '59 мин назад',
    )
  })

  it('shows the clock time in the configured tz for today messages older than an hour', () => {
    // 12:00 UTC = 15:00 in Kyiv
    expect(formatMessageTime('2026-09-03T12:00:00Z', 'Europe/Kiev', NOW)).toBe(
      '15:00',
    )
  })

  it('renders the raw UTC clock when the timezone is UTC', () => {
    expect(formatMessageTime('2026-09-03T12:00:00Z', 'UTC', NOW)).toBe('12:00')
  })

  it('shows short date + time for earlier days', () => {
    // 2026-09-02 11:30 UTC = 2026-09-02 14:30 in Kyiv
    expect(formatMessageTime('2026-09-02T11:30:00Z', 'Europe/Kiev', NOW)).toBe(
      '2 сент., 14:30',
    )
  })

  it('adds the year when it differs from the current one in the tz', () => {
    // 2025-12-31 10:00 UTC = 2025-12-31 12:00 in Kyiv
    expect(formatMessageTime('2025-12-31T10:00:00Z', 'Europe/Kiev', NOW)).toBe(
      '31 дек. 2025, 12:00',
    )
  })

  it('returns empty string for missing values', () => {
    expect(formatMessageTime(null, 'Europe/Kiev', NOW)).toBe('')
    expect(formatMessageTime('', 'Europe/Kiev', NOW)).toBe('')
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

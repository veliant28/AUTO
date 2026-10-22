/** Минуты → «9:00» / «8:30» */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Парсинг ввода часов. Возвращает минуты 0..1440;
 * null — пустая строка (вернуть авторасчёт); -1 — невалидный ввод.
 */
export function parseHoursToMinutes(raw: string): number | null | -1 {
  const s = raw.trim().replace(',', '.')
  if (s === '') return null
  let h = 0
  let m = 0
  if (s.includes(':')) {
    const [hh, mm] = s.split(':')
    if (!/^\d{1,2}$/.test(hh.trim()) || !/^\d{1,2}$/.test((mm || '').trim())) {
      return -1
    }
    h = Number(hh)
    m = Number(mm)
  } else {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return -1
    const v = Number(s)
    if (!Number.isFinite(v) || v > 24) return -1
    h = Math.floor(v)
    m = Math.round((v - h) * 60)
    if (m === 60) {
      h += 1
      m = 0
    }
  }
  if (!Number.isInteger(h) || h < 0 || h > 24) return -1
  if (!Number.isInteger(m) || m < 0 || m > 59) return -1
  const total = h * 60 + m
  return total > 1440 ? -1 : total
}

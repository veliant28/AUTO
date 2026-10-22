/**
 * Названия категорий журнала заявок.
 *
 * Категория опознаётся по коду (он же используется автоматизациями), а
 * отображаемое название берётся из переводов `requests_cat_name_<code>`,
 * а не из редактируемого поля в БД.
 */

export const REQUEST_CATEGORY_CODES = [
  'b2b_registration',
  'timesheet_manual',
  'ban_unban',
  'order_final_status',
  'order_delete',
  'return_change',
  'pricing_change',
  'support_edit',
  'other',
]

/**
 * Локализованное название категории по коду заявки.
 * Fallback — название из БД (для категорий, добавленных вне известных кодов).
 */
export function categoryName(
  t: (key: string) => string,
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && REQUEST_CATEGORY_CODES.includes(code)) {
    return t(`requests_cat_name_${code}`)
  }
  return fallback || code || '—'
}

/** Helper functions extracted from OrderWaybillModal.tsx */

import { toast } from '@/lib/toast'

/** Show NP API error with severity-based toast color */
export function showNpError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail || fallback
  const severity = err?.response?.data?.severity || 'info'
  if (severity === 'error') toast.error(detail)
  else if (severity === 'warning') toast.warning(detail)
  else toast.info(detail)
}

/** Format NP TTN number: 12345678901234 → 123 456 7890 1234 */
export function formatNpNumber(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length !== 14) return num
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)}`
}

/**
 * Converts a waybill seat's packaging data (cm) → PackagingTableEntry (mm)
 * so the packaging button and table can display saved items on re-open.
 */
export function buildPackItemsFromSeat(seat: any): any[] {
  if (!seat?.pack_ref) return []
  return [
    {
      ref: seat.pack_ref,
      label: seat.pack_label || seat.pack_ref,
      description: '',
      width_mm: seat.volumetric_width
        ? String(parseFloat(seat.volumetric_width) * 10)
        : '',
      length_mm: seat.volumetric_length
        ? String(parseFloat(seat.volumetric_length) * 10)
        : '',
      height_mm: seat.volumetric_height
        ? String(parseFloat(seat.volumetric_height) * 10)
        : '',
      cost: seat.pack_cost || '0',
    },
  ]
}

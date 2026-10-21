'use client'

import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000] as const

export function PageSizeSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS,
}: {
  value: number
  onChange: (size: number) => void
  options?: readonly number[]
}) {
  const t = useTranslations('admin')
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger
        className="w-[80px]"
        aria-label={t('pagination_rows_per_page')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

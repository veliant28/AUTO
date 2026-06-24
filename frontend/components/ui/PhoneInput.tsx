'use client'

import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const withoutPlus = digits.startsWith('+') ? digits.slice(1) : digits
  if (withoutPlus.length <= 2) return '+' + withoutPlus
  const d = withoutPlus.replace(/^38/, '').slice(0, 10)
  if (!d) return '+38'
  let result = '+38 (0'
  if (d.length > 1) result += d[1]
  if (d.length > 2) result += d[2]
  if (d.length > 2) result += ') '
  if (d.length > 3) result += d.slice(3, 6)
  if (d.length > 6) result += '-' + d.slice(6, 8)
  if (d.length > 8) result += '-' + d.slice(8, 10)
  return result
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const display = useMemo(() => formatPhone(value), [value])
  const placeholderText = placeholder || '+38 (0XX) XXX-XX-XX'

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const digits = value.replace(/\D/g, '')
      if (digits) {
        onChange('+' + digits.slice(0, -1))
      }
      e.preventDefault()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9+]/g, '')
    if (!cleaned) {
      onChange('')
      return
    }
    if (!cleaned.startsWith('+')) {
      onChange('+' + cleaned)
    } else {
      onChange(cleaned)
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholderText}
      disabled={disabled}
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}

export function phoneToApi(value: string): string {
  const d = value.replace(/\D/g, '')
  return d ? '+' + d : ''
}

export function apiToPhone(value: string | null | undefined): string {
  return value || ''
}

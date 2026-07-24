'use client'

import React, { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface CardInputProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  disabled?: boolean
  className?: string
}

export function CardInput({
  value,
  onChange,
  maxLength = 4,
  disabled,
  className,
}: CardInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, maxLength)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const focusNext = useCallback((idx: number) => {
    const next = idx + 1
    if (next < maxLength) {
      inputRefs.current[next]?.focus()
    }
  }, [maxLength])

  const focusPrev = useCallback((idx: number) => {
    if (idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }, [])

  const handleChange = useCallback((idx: number, char: string) => {
    if (char && /\d/.test(char)) {
      const next = digits.split('')
      next[idx] = char.slice(-1)
      onChange(next.join(''))
      focusNext(idx)
    }
  }, [digits, onChange, focusNext])

  const handleKeyDown = useCallback((idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      const next = digits.split('')
      if (next[idx]) {
        next[idx] = ''
        onChange(next.join(''))
      } else {
        focusPrev(idx)
      }
    } else if (e.key === 'ArrowLeft') {
      focusPrev(idx)
    } else if (e.key === 'ArrowRight') {
      focusNext(idx)
    }
  }, [digits, onChange, focusPrev, focusNext])

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {Array.from({ length: maxLength }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputRefs.current[idx] = el }}
          type="text"
          inputMode="numeric"
          value={digits[idx] || ''}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          maxLength={1}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-center text-sm font-mono shadow-sm transition-colors focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ring)_50%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      ))}
    </div>
  )
}

'use client'

import React, { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface CardInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function CardInput({
  value,
  onChange,
  disabled,
  className,
}: CardInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const updateValue = useCallback(
    (newDigits: string[]) => {
      onChange(newDigits.join(''))
    },
    [onChange],
  )

  const handleChange = useCallback(
    (idx: number, char: string) => {
      if (char && /\d/.test(char)) {
        const next = digits.split('')
        next[idx] = char.slice(-1)
        updateValue(next)
        // Focus next empty slot
        const nextIdx = next.findIndex((d, i) => i > idx && !d)
        if (nextIdx >= 0) {
          inputRefs.current[nextIdx]?.focus()
        } else if (idx < 15) {
          inputRefs.current[idx + 1]?.focus()
        }
      }
    },
    [digits, updateValue],
  )

  const handleKeyDown = useCallback(
    (idx: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const next = digits.split('')
        if (next[idx]) {
          next[idx] = ''
          updateValue(next)
        } else if (idx > 0) {
          inputRefs.current[idx - 1]?.focus()
        }
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        inputRefs.current[idx - 1]?.focus()
      } else if (e.key === 'ArrowRight' && idx < 15) {
        inputRefs.current[idx + 1]?.focus()
      }
    },
    [digits, updateValue],
  )

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[0, 1, 2, 3].map((gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <span className="text-muted-foreground text-lg font-bold mx-0.5">
              ·
            </span>
          )}
          {[0, 1, 2, 3].map((si) => {
            const idx = gi * 4 + si
            return (
              <input
                key={si}
                ref={(el) => {
                  inputRefs.current[idx] = el
                }}
                type="text"
                inputMode="numeric"
                value={digits[idx] || ''}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onFocus={(e) => e.target.select()}
                disabled={disabled}
                maxLength={1}
                className="w-7 h-9 text-center text-sm font-mono p-0 rounded-md border-2 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

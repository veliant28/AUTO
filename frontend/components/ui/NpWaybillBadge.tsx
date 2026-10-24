'use client'

import { ScanBarcode, ScanLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import { useCopyTtn } from '@/hooks/useCopyTtn'

/** Format NP number from "20400048799000" → "204 000 4879 9000" */
function formatNpNumber(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length !== 14) return num
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)}`
}

interface Props {
  npNumber?: string
  isDeleted?: boolean
  exists?: boolean
  /** Stable per-instance key for the entrance animation. */
  animationKey?: string | number
}

export function NpWaybillBadge({
  npNumber,
  isDeleted,
  exists,
  animationKey,
}: Props) {
  const copyTtn = useCopyTtn()
  const hasNumber = !!npNumber && exists

  let bgClass: string
  if (isDeleted) {
    bgClass = 'bg-red-500 text-white'
  } else if (hasNumber) {
    bgClass = 'bg-green-500 text-white'
  } else {
    bgClass = 'bg-gray-500 text-white'
  }

  const stateKey = `${
    isDeleted ? 'deleted' : hasNumber ? 'active' : 'empty'
  }:${npNumber || ''}`

  return (
    <AnimatedBadge swapKey={stateKey} animationKey={animationKey}>
      <Badge
        className={`text-sm gap-1.5 border-0 w-fit ${isDeleted ? 'line-through' : ''} ${bgClass} ${
          npNumber ? 'cursor-pointer' : ''
        }`}
        // Реальная ТТН (не маска) — по клику копируем номер без пробелов
        onClick={npNumber ? () => copyTtn(npNumber) : undefined}
      >
        {hasNumber || isDeleted ? (
          <ScanBarcode className="w-3.5 h-3.5" />
        ) : (
          <ScanLine className="w-3.5 h-3.5" />
        )}
        {npNumber ? formatNpNumber(npNumber) : '204 000 0000 0000'}
      </Badge>
    </AnimatedBadge>
  )
}

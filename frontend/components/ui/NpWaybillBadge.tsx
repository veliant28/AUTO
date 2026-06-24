'use client'

import { ScanBarcode, ScanLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
}

export function NpWaybillBadge({ npNumber, isDeleted, exists }: Props) {
  const hasNumber = !!npNumber && exists

  let bgClass: string
  if (isDeleted) {
    bgClass = 'bg-red-500 text-white'
  } else if (hasNumber) {
    bgClass = 'bg-green-500 text-white'
  } else {
    bgClass = 'bg-gray-500 text-white'
  }

  return (
    <Badge
      className={`text-xs gap-1.5 shrink-0 h-6 px-2.5 border-0 ${bgClass}`}
    >
      {hasNumber || isDeleted ? (
        <ScanBarcode className="w-3.5 h-3.5" />
      ) : (
        <ScanLine className="w-3.5 h-3.5" />
      )}
      {npNumber ? formatNpNumber(npNumber) : '204 000 0000 0000'}
    </Badge>
  )
}

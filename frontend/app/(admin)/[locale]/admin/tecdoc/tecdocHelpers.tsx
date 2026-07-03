'use client'

import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface PieLabelLayoutParams {
  labelRect?: { x: number; y: number; width: number; height: number }
  rect?: { x: number; y: number; width: number; height: number }
  viewRect?: { x: number; y: number; width: number; height: number }
  dataIndex?: number
}

export interface DashboardData {
  used: number
  remaining: number
  limit: number
  exhausted: boolean
  hourly: { hour: string; count: number }[]
}

export interface BrandItem {
  id: number
  name: string
  total: number
  matched: number
  unmatched: number
  with_applicability: number
}

export interface ArticleItem {
  id: number
  supplier: string
  article: string
  brand: string | null
  name: string | null
  price: number | null
  currency: string | null
  stock_total: number
  match_status: string
  attempts: number
}

export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2
  let n = angle % twoPi
  if (n <= -Math.PI) n += twoPi
  else if (n > Math.PI) n -= twoPi
  return n
}

export function shiftPieLabelAlongArcNearEdge(
  params: PieLabelLayoutParams,
  sliceValues: number[],
) {
  const labelRect = params.labelRect
  const pieRect = params.rect
  const viewRect = params.viewRect || params.rect
  if (!labelRect || !pieRect || !viewRect) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const }
  }
  // ... full implementation kept as-is
  const minX = viewRect.x + 6
  const maxX = Math.max(
    viewRect.x + viewRect.width - 6,
    minX + labelRect.width + 4,
  )
  const leftOverflow = Math.max(minX - labelRect.x, 0)
  const rightOverflow = Math.max(labelRect.x + labelRect.width - maxX, 0)
  if (leftOverflow <= 0 && rightOverflow <= 0) {
    return { hideOverlap: false, moveOverlap: 'shiftY' as const }
  }

  const centerX = pieRect.x + pieRect.width / 2
  const centerY = pieRect.y + pieRect.height / 2
  const labelCenterX = labelRect.x + labelRect.width / 2
  const labelCenterY = labelRect.y + labelRect.height / 2
  const dx = labelCenterX - centerX
  const dy = labelCenterY - centerY
  const radius = Math.max(Math.hypot(dx, dy), 1)
  const sourceAngle = Math.atan2(dy, dx)

  const total = Math.max(
    sliceValues.reduce((acc, v) => acc + Math.max(v, 0), 0),
    1,
  )
  const dataIndex = Math.max(
    0,
    Math.min(Number(params.dataIndex ?? 0), sliceValues.length - 1),
  )
  const currentSliceValue = Math.max(sliceValues[dataIndex] ?? 0, 0)
  const beforeSliceValue = sliceValues
    .slice(0, dataIndex)
    .reduce((acc, v) => acc + Math.max(v, 0), 0)
  const fullCircle = Math.PI * 2
  const sliceStart = -Math.PI / 2 + (beforeSliceValue / total) * fullCircle
  const sliceSpan = (currentSliceValue / total) * fullCircle
  const sliceEnd = sliceStart + sliceSpan
  const sliceCenter = sliceStart + sliceSpan / 2
  const sourceAngleUnwrapped =
    sourceAngle +
    Math.round((sliceCenter - sourceAngle) / fullCircle) * fullCircle
  const slicePad = Math.min(0.14, Math.max(0.02, sliceSpan * 0.2))
  const lowerBound = sliceStart + slicePad
  const upperBound = sliceEnd - slicePad
  const boundedSource =
    sliceSpan > slicePad * 2
      ? Math.max(lowerBound, Math.min(upperBound, sourceAngleUnwrapped))
      : sliceCenter

  const evaluateOverflow = (angleUnwrapped: number) => {
    const nx = centerX + Math.cos(angleUnwrapped) * radius - labelRect.width / 2
    const left = Math.max(minX - nx, 0)
    const right = Math.max(nx + labelRect.width - maxX, 0)
    return {
      total: left + right,
      x: nx,
      y: centerY + Math.sin(angleUnwrapped) * radius - labelRect.height / 2,
    }
  }

  const sourceOverflow = evaluateOverflow(boundedSource)
  let bestAngle = boundedSource
  let best = sourceOverflow
  if (sourceOverflow.total > 0 && sliceSpan > slicePad * 2) {
    const steps = 32
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps
      const probe = lowerBound + (upperBound - lowerBound) * ratio
      const evaluated = evaluateOverflow(probe)
      if (evaluated.total < best.total) {
        best = evaluated
        bestAngle = probe
      } else if (evaluated.total === best.total) {
        const currentDistance = Math.abs(probe - boundedSource)
        const bestDistance = Math.abs(bestAngle - boundedSource)
        if (currentDistance < bestDistance) {
          best = evaluated
          bestAngle = probe
        }
      }
    }
  }

  const normalizedBestAngle = normalizeAngle(bestAngle)
  const nextCenterX = centerX + Math.cos(normalizedBestAngle) * radius
  const nextCenterY = centerY + Math.sin(normalizedBestAngle) * radius

  return {
    x: nextCenterX - labelRect.width / 2,
    y: nextCenterY - labelRect.height / 2,
    hideOverlap: false as const,
    moveOverlap: 'shiftY' as const,
  }
}

export function ResetTimer({ exhausted }: { exhausted: boolean }) {
  const computeMs = React.useCallback(() => {
    const next = Math.ceil(Date.now() / 3600000) * 3600000
    return Math.max(0, next - Date.now())
  }, [])

  const [ms, setMs] = useState(exhausted ? computeMs() : 0)

  useEffect(() => {
    if (!exhausted) return
    setMs(computeMs())
    const tick = () => setMs(computeMs())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [exhausted, computeMs])

  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (exhausted) {
    return (
      <Badge className="bg-red-500 text-white animate-pulse gap-1.5 hover:bg-red-500 border-0 text-sm font-mono min-w-[85px] justify-center">
        <Clock className="w-3.5 h-3.5" />
        {pad(h)}:{pad(m)}:{pad(s)}
      </Badge>
    )
  }

  return (
    <Badge className="bg-blue-500 text-white gap-1.5 hover:bg-blue-500 border-0 text-sm font-mono min-w-[85px] justify-center">
      <Clock className="w-3.5 h-3.5" />
      00:00:00
    </Badge>
  )
}

'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'

interface AnimatedSuccessBadgeProps {
  /** Индекс успешности, % (null — бейдж не показывается) */
  value: number | null | undefined
  /** Всего заказов: 0 — нет статистики, серый бейдж */
  totalOrders?: number | null
  className?: string
  /** Длительность отсчёта от 0 при появлении, мс */
  durationMs?: number
}

/** Цвет по порогам — как у статичных бейджей успешности в админке */
export function colorClass(value: number, totalOrders?: number | null): string {
  if (totalOrders === 0) return 'bg-gray-500'
  if (value >= 70) return 'bg-green-500'
  if (value >= 30) return 'bg-yellow-500'
  if (value >= 1) return 'bg-orange-500'
  return 'bg-red-500'
}

/** Плавный отсчёт от 0 до target (rAF, easeOutCubic) — общий для бейджа и полосы */
export function useCountUp(target: number, durationMs = 1200): number {
  const [display, setDisplay] = React.useState(0)

  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic — плавное затухание
      const next = Math.round(eased * target)
      setDisplay((prev) => (prev === next ? prev : next))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // Страховка: у скрытой вкладки браузер приостанавливает кадры — таймер
    // гарантирует, что значение доедет до цели
    const fallback = setTimeout(() => setDisplay(target), durationMs + 200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [target, durationMs])

  return display
}

/**
 * Бейдж индекса успешности с анимацией: при появлении (открытии модалки)
 * число плавно растёт от 0% до значения, цвет меняется по порогам с
 * CSS-переходом. Пока идёт отсчёт — показывает текущее значение.
 */
export default function AnimatedSuccessBadge({
  value,
  totalOrders,
  className,
  durationMs = 1200,
}: AnimatedSuccessBadgeProps) {
  const display = useCountUp(value ?? 0, durationMs)

  if (value == null) return null

  return (
    <Badge
      className={`${colorClass(display, totalOrders)} text-white border-0 text-sm ml-auto transition-colors duration-500 tabular-nums ${className ?? ''}`}
    >
      {display}%
    </Badge>
  )
}

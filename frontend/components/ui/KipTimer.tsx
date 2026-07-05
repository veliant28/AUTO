'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const STORAGE_KEY = 'kip_timer_start'

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getBadgeColor(seconds: number): string {
  if (seconds === 0) return 'bg-blue-500 text-white'
  if (seconds < 3600) return 'bg-green-500 text-white' // < 1h
  if (seconds < 7200) return 'bg-orange-500 text-white' // 1–2h
  return 'bg-red-500 text-white' // >= 2h
}

interface KipTimerProps {
  oldestPendingSeconds: number
  pendingCount: number
}

export default function KipTimer({
  oldestPendingSeconds,
  pendingCount,
}: KipTimerProps) {
  const startRef = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (pendingCount === 0) {
      // Все заказы обработаны — сброс
      startRef.current = 0
      localStorage.removeItem(STORAGE_KEY)
      setElapsed(0)
      return
    }

    // Есть необработанные заказы — восстанавливаем или устанавливаем старт
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      startRef.current = Number(stored)
    } else {
      // Первый раз: вычисляем момент старта
      startRef.current = Date.now() - oldestPendingSeconds * 1000
      localStorage.setItem(STORAGE_KEY, String(startRef.current))
    }

    // Обновляем каждую секунду
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [oldestPendingSeconds, pendingCount])

  const displayTime = pendingCount === 0 ? 0 : elapsed
  const colorClass = getBadgeColor(displayTime)

  return (
    <Badge
      className={`gap-1.5 text-sm font-mono border-0 min-w-[85px] justify-center ${colorClass}`}
    >
      <Clock className="w-3.5 h-3.5" />
      {formatCountdown(displayTime)}
    </Badge>
  )
}

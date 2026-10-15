'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { useRequestDate } from './useRequestDate'

const STATUS_CLASS: Record<string, string> = {
  new: 'bg-blue-500',
  in_progress: 'bg-orange-500',
  resolved: 'bg-green-500',
  rejected: 'bg-red-500',
}

const STATUS_KEY: Record<string, string> = {
  new: 'requests_status_new',
  in_progress: 'requests_status_in_progress',
  resolved: 'requests_status_resolved',
  rejected: 'requests_status_rejected',
}

/** Цветной бейдж статуса заявки: появляется с анимацией, «в работе» пульсирует */
export function RequestsStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const t = useTranslations('admin')
  const cls = STATUS_CLASS[status] ?? 'bg-gray-500'
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="inline-flex"
    >
      <Badge
        className={`${cls} text-white border-0 transition-colors duration-500 ${
          status === 'in_progress' ? 'animate-pulse' : ''
        } ${className ?? ''}`}
      >
        {t(STATUS_KEY[status] ?? 'requests_status_new')}
      </Badge>
    </motion.span>
  )
}

/**
 * Срок заявки: дата + состояние. Цвет меняется плавно
 * (зелёный → жёлтый → красный), при просрочке бейдж пульсирует.
 */
export function DeadlineCell({
  deadline,
  state,
  minutesLeft,
  minutesLate,
  closed,
}: {
  deadline: string | null
  state: string
  minutesLeft?: number | null
  minutesLate?: number | null
  /** Заявка закрыта (решена/отклонена) — обратный отсчёт не показываем */
  closed?: boolean
}) {
  const t = useTranslations('admin')
  const fmtDate = useRequestDate()

  if (!deadline) {
    return (
      <span className="text-sm text-muted-foreground">
        {t('requests_no_deadline')}
      </span>
    )
  }

  if (closed) {
    return <span className="text-sm tabular-nums">{fmtDate(deadline)}</span>
  }

  const cls =
    state === 'overdue'
      ? 'bg-red-500'
      : state === 'due_soon'
        ? 'bg-yellow-500'
        : 'bg-green-500'

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm tabular-nums">{fmtDate(deadline)}</span>
      <Badge
        className={`${cls} text-white border-0 text-sm transition-colors duration-700 w-fit ${
          state === 'overdue' ? 'animate-pulse' : ''
        }`}
      >
        {state === 'overdue'
          ? t('requests_deadline_overdue', { minutes: minutesLate ?? 0 })
          : t('requests_deadline_left', { minutes: minutesLeft ?? 0 })}
      </Badge>
    </div>
  )
}

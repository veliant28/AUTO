'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import AnimatedBadge from '@/components/ui/AnimatedBadge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
    <AnimatedBadge swapKey={status}>
      <Badge
        className={`${cls} text-white border-0 transition-colors duration-500 ${
          status === 'in_progress' ? 'animate-pulse' : ''
        } ${className ?? ''}`}
      >
        {t(STATUS_KEY[status] ?? 'requests_status_new')}
      </Badge>
    </AnimatedBadge>
  )
}

/**
 * Статус заявки в таблице: просрочка заменяет статус, смена — с исчезанием
 * старого бейджа и появлением нового (без перезагрузки страницы).
 */
export function RequestsStatusCell({
  status,
  deadlineState,
  minutesLate,
}: {
  status: string
  deadlineState: string
  minutesLate?: number | null
}) {
  const t = useTranslations('admin')
  const closed = status === 'resolved' || status === 'rejected'
  const overdue = !closed && deadlineState === 'overdue'
  const cls = STATUS_CLASS[status] ?? 'bg-gray-500'

  return (
    <AnimatedBadge swapKey={overdue ? 'overdue' : status} className="w-fit">
      {overdue ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-red-500 text-white border-0 text-sm whitespace-nowrap animate-pulse cursor-pointer">
              {t('requests_minutes', { minutes: minutesLate ?? 0 })}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{t('requests_overdue_short')}</TooltipContent>
        </Tooltip>
      ) : (
        <Badge
          className={`${cls} text-white border-0 text-sm transition-colors duration-500 ${
            status === 'in_progress' ? 'animate-pulse' : ''
          }`}
        >
          {t(STATUS_KEY[status] ?? 'requests_status_new')}
        </Badge>
      )}
    </AnimatedBadge>
  )
}

/** За сколько минут до срока бейдж «Осталось …» заменяет дату в колонке «Срок» */
export const DUE_SOON_BADGE_MINUTES = 120

/**
 * Срок заявки.
 * - Обычно — дата срока.
 * - За 2 часа до срока дату временно заменяет оранжевый мигающий бейдж «Осталось …».
 * - После просрочки дата возвращается, но жирным красным.
 * `overdueBadge={true}` (модалка) добавляет под датой бейдж «Просрочено на …».
 */
export function DeadlineCell({
  deadline,
  state,
  minutesLeft,
  minutesLate,
  closed,
  overdueBadge = true,
}: {
  deadline: string | null
  state: string
  minutesLeft?: number | null
  minutesLate?: number | null
  /** Заявка закрыта (решена/отклонена) — обратный отсчёт не показываем */
  closed?: boolean
  /** Показывать бейдж просрочки в этой ячейке */
  overdueBadge?: boolean
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

  const overdue = !closed && state === 'overdue'
  const showLeft =
    !closed &&
    !overdue &&
    minutesLeft != null &&
    minutesLeft <= DUE_SOON_BADGE_MINUTES

  // Смена режима (дата ⇄ «Осталось …» ⇄ просрочка) проходит через гашение
  const mode = closed
    ? 'closed'
    : overdue
      ? overdueBadge
        ? 'overdue-full'
        : 'overdue-date'
      : showLeft
        ? 'left'
        : 'date'

  return (
    <AnimatedBadge swapKey={mode} className="w-fit">
      {mode === 'left' ? (
        <Badge className="bg-orange-500 text-white border-0 text-sm whitespace-nowrap w-fit animate-pulse">
          {t('requests_deadline_left', { minutes: minutesLeft ?? 0 })}
        </Badge>
      ) : mode === 'overdue-full' ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-red-500 tabular-nums">
            {fmtDate(deadline)}
          </span>
          <Badge className="bg-red-500 text-white border-0 text-sm w-fit animate-pulse">
            {t('requests_deadline_overdue', { minutes: minutesLate ?? 0 })}
          </Badge>
        </div>
      ) : (
        <span
          className={`text-sm tabular-nums ${
            mode === 'overdue-date' ? 'font-bold text-red-500' : ''
          }`}
        >
          {fmtDate(deadline)}
        </span>
      )}
    </AnimatedBadge>
  )
}

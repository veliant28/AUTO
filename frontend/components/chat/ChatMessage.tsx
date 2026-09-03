'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/avatar'
import { formatMessageTime } from '@/lib/dates'
import { useTranslations } from 'next-intl'
import { useTimezoneStore } from '@/store/timezoneStore'

interface MessageProps {
  id: number
  message: string
  senderId: number
  senderRole: 'user' | 'admin'
  senderName?: string
  senderGroup?: string
  senderAvatarIndex?: number | null
  createdAt: string
  currentUserId: number
  /** Разрешено ли редактировать (право support.edit, только админ-сообщения) */
  editable?: boolean
  editedAt?: string | null
  /** Сообщение сейчас редактируется в нижнем поле ввода */
  isEditingTarget?: boolean
  onEditRequest?: (id: number) => void
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function ChatMessage({
  id,
  message,
  senderId,
  senderRole,
  senderName,
  senderGroup,
  senderAvatarIndex,
  createdAt,
  currentUserId,
  editable = false,
  editedAt = null,
  isEditingTarget = false,
  onEditRequest,
}: MessageProps) {
  const isMine = senderRole === 'admin'
  const canEditBubble = editable && senderRole === 'admin'
  const timezone = useTimezoneStore((s) => s.timezone)
  const avatarUrl = getAvatarUrl(senderAvatarIndex, senderName)
  const badgeColor =
    roleBadgeColors[senderGroup || ''] || 'bg-gray-500 text-white'
  const t = useTranslations('admin')

  return (
    <div
      className={cn(
        'flex gap-3 group',
        isMine ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <Avatar className="w-12 h-12 shrink-0 mt-0.5">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback
          className={cn(
            'text-xs',
            isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {getInitials(senderName)}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'flex flex-col max-w-[75%]',
          isMine ? 'items-end' : 'items-start',
        )}
      >
        {isMine && senderGroup && (
          <Badge className={`${badgeColor} border-0 text-sm mb-0.5`}>
            {t(senderGroup)}
          </Badge>
        )}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm text-muted-foreground">
            {senderName || 'Пользователь'}
          </span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-base break-words',
            isMine
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
            // Редактируемое сообщение подсвечиваем оранжевым до отмены/отправки
            isEditingTarget && 'bg-orange-500 text-white',
          )}
        >
          {message}
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 mt-0.5',
            isMine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span className="text-xs text-muted-foreground/60">
            {formatMessageTime(createdAt, timezone)}
          </span>
          {editedAt && (
            <span className="text-[10px] text-muted-foreground/50 italic">
              {t('support_msg_edited')}
            </span>
          )}
          {canEditBubble && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                  onClick={() => onEditRequest?.(id)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('support_msg_edit')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

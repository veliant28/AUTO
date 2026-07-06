'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/avatar'
import { useTranslations } from 'next-intl'

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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function ChatMessage({
  message,
  senderRole,
  senderName,
  senderGroup,
  senderAvatarIndex,
  createdAt,
  currentUserId,
}: MessageProps) {
  const isMine = senderRole === 'admin'
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
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm text-muted-foreground">
            {senderName || 'Пользователь'}
          </span>
          {isMine && senderGroup && (
            <Badge className={`${badgeColor} border-0 text-sm`}>
              {t(senderGroup)}
            </Badge>
          )}
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-base break-words',
            isMine
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
          )}
        >
          {message}
        </div>
        <span className="text-xs text-muted-foreground/60 mt-0.5">
          {formatTime(createdAt)}
        </span>
      </div>
    </div>
  )
}

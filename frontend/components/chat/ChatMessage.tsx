'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/avatar'

interface MessageProps {
  id: number
  message: string
  senderId: number
  senderRole: 'user' | 'admin'
  senderName?: string
  senderAvatarIndex?: number | null
  createdAt: string
  currentUserId: number
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
  // Backend returns naive UTC datetime — parse as UTC explicitly
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
  senderAvatarIndex,
  createdAt,
  currentUserId,
}: MessageProps) {
  const isMine = senderRole === 'admin'
  const avatarUrl = getAvatarUrl(senderAvatarIndex, senderName)

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
          {senderRole !== 'user' && (
            <Badge className="bg-red-500 text-white border-0 text-sm">
              {senderRole}
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

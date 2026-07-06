'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface MessageProps {
  id: number
  message: string
  senderId: number
  senderRole: 'user' | 'admin'
  senderName?: string
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
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
}

export default function ChatMessage({
  message,
  senderRole,
  senderName,
  createdAt,
  currentUserId,
}: MessageProps) {
  const isMine = senderRole === 'admin'
  const roleBadge = ROLE_BADGE[senderRole] || 'bg-gray-500 text-white'

  return (
    <div
      className={cn(
        'flex gap-2 group',
        isMine ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <Avatar className="w-7 h-7 shrink-0 mt-0.5">
        <AvatarFallback
          className={cn(
            'text-[10px]',
            isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {getInitials(senderName)}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'flex flex-col max-w-[80%]',
          isMine ? 'items-end' : 'items-start',
        )}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs text-muted-foreground">
            {senderName || 'Пользователь'}
          </span>
          {senderRole !== 'user' && (
            <Badge className={`${roleBadge} border-0 text-[10px] px-1 py-0`}>
              {senderRole}
            </Badge>
          )}
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm break-words',
            isMine
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
          )}
        >
          {message}
        </div>
        <span className="text-[10px] text-muted-foreground/60 mt-0.5">
          {formatTime(createdAt)}
        </span>
      </div>
    </div>
  )
}

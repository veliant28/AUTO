'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Chat {
  id: number
  ticket_number?: string
  user_id: number
  user_name?: string
  user_phone?: string
  user_email?: string
  last_message?: string
  last_message_at?: string
  status: string
  created_at: string
  updated_at: string
}

interface ChatSidebarProps {
  chats: Chat[]
  activeChatId: number | null
  onSelectChat: (id: number) => void
  isLoading?: boolean
  title?: string
  compact?: boolean
}

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-orange-500 text-white',
  active: 'bg-green-500 text-white',
  closed: 'bg-gray-500 text-white',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Новый',
  active: 'Активный',
  closed: 'Закрыт',
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

function formatTime(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const Skeleton = () => (
  <div className="space-y-2 p-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-2.5 w-32 bg-muted rounded" />
        </div>
      </div>
    ))}
  </div>
)

export default function ChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  isLoading,
  title = 'Пользователи',
  compact = false,
}: ChatSidebarProps) {
  if (isLoading) return <Skeleton />

  if (chats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
        Нет чатов
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b">
        <h3 className="text-base font-medium">{title}</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-3">
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId
            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={cn(
                  'w-full text-left flex items-center gap-2.5 py-2.5 px-3 rounded-lg border transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted/30 border-transparent',
                )}
              >
                {compact ? (
                  // Compact view: just ticket number + badge
                  <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-sm font-mono font-bold truncate',
                        isActive ? 'text-primary-foreground' : '',
                      )}
                    >
                      {chat.ticket_number || `#${chat.id}`}
                    </span>
                    <Badge
                      className={`${STATUS_BADGE[chat.status] || 'bg-gray-500 text-white'} border-0 text-sm shrink-0`}
                    >
                      {STATUS_LABEL[chat.status] || chat.status}
                    </Badge>
                  </div>
                ) : (
                  // Full view: avatar, user info, badge
                  <>
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          'text-xs',
                          isActive ? 'bg-primary-foreground/20' : 'bg-muted',
                        )}
                      >
                        {getInitials(chat.user_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'text-sm font-medium truncate',
                            isActive ? 'text-primary-foreground' : '',
                          )}
                        >
                          {chat.user_name || `User #${chat.user_id}`}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] shrink-0',
                            isActive
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground/60',
                          )}
                        >
                          {formatTime(chat.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p
                          className={cn(
                            'text-xs truncate',
                            isActive
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground',
                          )}
                        >
                          {chat.last_message ||
                            chat.ticket_number ||
                            `#${chat.id}`}
                        </p>
                        <Badge
                          className={`${STATUS_BADGE[chat.status] || 'bg-gray-500 text-white'} border-0 text-sm shrink-0`}
                        >
                          {STATUS_LABEL[chat.status] || chat.status}
                        </Badge>
                      </div>
                      {chat.user_email && (
                        <p
                          className={cn(
                            'text-[10px] font-mono mt-0.5',
                            isActive
                              ? 'text-primary-foreground/50'
                              : 'text-muted-foreground/50',
                          )}
                        >
                          {chat.user_phone || chat.user_email}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

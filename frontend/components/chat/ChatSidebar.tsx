'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatPhone } from '@/components/ui/PhoneInput'

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
                  'w-full text-left flex items-start gap-2.5 py-2.5 px-3 rounded-lg border transition-colors cursor-pointer',
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
                  // Full view: ticket number + badge + user info
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
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
                    {(chat.user_name || chat.user_phone) && (
                      <div className="mt-1 space-y-0.5">
                        {chat.user_name && (
                          <p
                            className={cn(
                              'text-sm leading-tight truncate',
                              isActive
                                ? 'text-primary-foreground/90'
                                : 'text-foreground',
                            )}
                          >
                            {chat.user_name}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          {chat.user_phone ? (
                            <span
                              className={cn(
                                'text-sm font-mono leading-tight truncate',
                                isActive
                                  ? 'text-primary-foreground/70'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {formatPhone(chat.user_phone)}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span
                            className={cn(
                              'text-xs shrink-0',
                              isActive
                                ? 'text-primary-foreground/60'
                                : 'text-muted-foreground/50',
                            )}
                          >
                            {formatTime(
                              chat.last_message_at || chat.created_at,
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

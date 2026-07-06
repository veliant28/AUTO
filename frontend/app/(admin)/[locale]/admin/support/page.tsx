'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, CalendarDays, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { ru } from 'date-fns/locale'
import api from '@/lib/api'
import { STORAGE_KEYS } from '@/lib/constants'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatSidebar from '@/components/chat/ChatSidebar'
import {
  format,
  startOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfDay,
} from 'date-fns'

const PERIODS = ['day', 'week', 'month', 'year'] as const

interface Chat {
  id: number
  ticket_number?: string
  user_id: number
  user_name?: string
  user_phone?: string
  user_email?: string
  status: string
  last_message?: string
  last_message_at?: string
  updated_at: string
}

interface Message {
  id: number
  conversation_id: number
  sender_id: number
  sender_role: 'user' | 'admin'
  sender_name?: string
  sender_group?: string
  message: string
  created_at: string
}

function getDateRange(period: string): { from: Date; to: Date } {
  const now = new Date()
  switch (period) {
    case 'day':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'week':
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) }
    case 'month':
      return { from: startOfMonth(now), to: endOfDay(now) }
    case 'year':
      return { from: startOfYear(now), to: endOfDay(now) }
    default:
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) }
  }
}

export default function SupportAdminPage() {
  const t = useTranslations('admin')
  const { user, isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()
  const chatStore = useChatStore()

  // Filters
  const [period, setPeriod] = useState<string>('month')
  const [customRange, setCustomRange] = useState<
    { from: Date; to: Date } | undefined
  >()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const range = useMemo(
    () => customRange || getDateRange(period),
    [period, customRange?.from?.getTime(), customRange?.to?.getTime()],
  )

  // Auth token for WebSocket
  const authToken = useAuthStore((s) => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.TOKEN) || ''
    }
    return ''
  })

  // Build query params
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      period,
      from_date: range.from.toISOString(),
      to_date: range.to.toISOString(),
    }
    if (statusFilter) params.status = statusFilter
    if (search.trim()) params.search = search.trim()
    return params
  }, [period, range, statusFilter, search])

  // Chats list
  const { data: chats = [], isLoading: chatsLoading } = useQuery({
    queryKey: ['admin-support-chats', queryParams],
    queryFn: async () => {
      const { data } = await api.get('/admin/support/chats', {
        params: queryParams,
      })
      return data || []
    },
    enabled: isAuthenticated,
    refetchInterval: 15000,
  })

  // Messages for active chat
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['admin-support-messages', chatStore.activeChatId],
    queryFn: async () => {
      if (!chatStore.activeChatId) return []
      const { data } = await api.get(
        `/admin/support/chats/${chatStore.activeChatId}`,
      )
      return data?.messages || []
    },
    enabled: isAuthenticated && !!chatStore.activeChatId,
    refetchInterval: 10000,
  })

  // Connect WebSocket
  useEffect(() => {
    if (isAuthenticated && authToken) {
      chatStore.connect(authToken)
      return () => chatStore.disconnect()
    }
  }, [isAuthenticated, authToken])

  // Subscribe to active chat
  useEffect(() => {
    if (chatStore.activeChatId && chatStore.connected) {
      chatStore.subscribe(chatStore.activeChatId)
      queryClient.invalidateQueries({
        queryKey: ['admin-support-messages', chatStore.activeChatId],
      })
    }
  }, [chatStore.activeChatId, chatStore.connected])

  // Handle incoming WS messages
  const handleWsMessage = useCallback(
    (data: any) => {
      if (data.type === 'new_message') {
        queryClient.invalidateQueries({
          queryKey: ['admin-support-messages', data.chat_id],
        })
        queryClient.invalidateQueries({ queryKey: ['admin-support-chats'] })
      }
      if (data.type === 'status_changed') {
        queryClient.invalidateQueries({ queryKey: ['admin-support-chats'] })
      }
    },
    [queryClient],
  )

  useEffect(() => {
    chatStore.setOnMessage(handleWsMessage)
    return () => chatStore.setOnMessage(null)
  }, [handleWsMessage])

  // Set active chat on first load
  useEffect(() => {
    if (chats.length > 0 && !chatStore.activeChatId) {
      chatStore.setActiveChat(chats[0].id)
    }
  }, [chats])

  const handleSend = useCallback(
    (text: string) => {
      if (!chatStore.activeChatId) return
      const chat = chats.find((c: Chat) => c.id === chatStore.activeChatId)
      if (chat?.status === 'closed') return
      if (chatStore.connected) {
        chatStore.sendMessage(chatStore.activeChatId, text)
      }
    },
    [chatStore.activeChatId, chatStore.connected, chats],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (chatStore.activeChatId) {
        chatStore.sendTyping(chatStore.activeChatId, isTyping)
      }
    },
    [chatStore.activeChatId],
  )

  const activeChat = chats.find((c: Chat) => c.id === chatStore.activeChatId)

  // Check if user is typing
  const isUserTyping = chatStore.typingUsers.some(
    (t) => t.chatId === chatStore.activeChatId,
  )

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, телефону, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[140px] h-10">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Статус</SelectItem>
            <SelectItem value="new">Новый</SelectItem>
            <SelectItem value="active">Активный</SelectItem>
            <SelectItem value="closed">Закрыт</SelectItem>
          </SelectContent>
        </Select>

        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={period === p && !customRange ? 'default' : 'outline'}
            onClick={() => {
              setPeriod(p)
              setCustomRange(undefined)
            }}
          >
            {t('staff_period_' + p)}
          </Button>
        ))}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <CalendarDays className="w-4 h-4" />
              {customRange
                ? `${format(customRange.from, 'dd.MM')} – ${format(customRange.to, 'dd.MM')}`
                : t('staff_select_dates')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              navLayout="around"
              selected={customRange}
              onSelect={(r: any) => {
                if (r?.from && r?.to)
                  setCustomRange({ from: r.from, to: endOfDay(r.to) })
              }}
              locale={ru}
            />
          </PopoverContent>
        </Popover>

        {(chatStore.activeChatId || customRange || statusFilter || search) && (
          <Button
            variant="destructive"
            onClick={() => {
              chatStore.setActiveChat(null)
              setPeriod('month')
              setCustomRange(undefined)
              setStatusFilter('')
              setSearch('')
            }}
          >
            {t('staff_reset')}
          </Button>
        )}
      </div>

      {/* Main content: chat list + chat window */}
      <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
        {/* Chat sidebar */}
        <Card className="col-span-1 overflow-hidden flex flex-col">
          <ChatSidebar
            chats={chats}
            activeChatId={chatStore.activeChatId}
            onSelectChat={(id) => chatStore.setActiveChat(id)}
            isLoading={chatsLoading}
            title="Обращение"
          />
        </Card>

        {/* Active chat */}
        <Card className="col-span-3 overflow-hidden flex flex-col relative">
          {chatStore.activeChatId && activeChat ? (
            <>
              <CardHeader className="p-3 pb-0 shrink-0 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-bold font-mono text-muted-foreground">
                    {activeChat.ticket_number || `#${activeChat.id}`}
                  </CardTitle>
                  <p className="text-sm font-medium">
                    {activeChat.user_name || `User #${activeChat.user_id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={activeChat.status}
                    onValueChange={(newStatus) => {
                      api
                        .patch(`/admin/support/chats/${activeChat.id}/status`, {
                          status: newStatus,
                        })
                        .then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['admin-support-chats'],
                          })
                        })
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Новый</SelectItem>
                      <SelectItem value="active">Активный</SelectItem>
                      <SelectItem value="closed">Закрыт</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden relative">
                <ChatWindow
                  messages={messages as Message[]}
                  currentUserId={user?.id || 0}
                  onSend={handleSend}
                  onTyping={handleTyping}
                  showTyping={isUserTyping}
                  typingName={activeChat.user_name || 'Пользователь'}
                  disabled={activeChat.status === 'closed'}
                  placeholder={
                    activeChat.status === 'closed'
                      ? 'Чат закрыт'
                      : 'Напишите ответ... (Enter для отправки)'
                  }
                  className="h-full"
                />
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {chats.length === 0
                ? 'Нет активных чатов'
                : 'Выберите чат из списка'}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

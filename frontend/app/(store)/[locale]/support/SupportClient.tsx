'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Loader2,
  LifeBuoy,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatPhone } from '@/components/ui/PhoneInput'
import api from '@/lib/api'
import { STORAGE_KEYS } from '@/lib/constants'
import StaticPage from '@/components/features/StaticPage'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useChatStore } from '@/store/chatStore'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatSidebar from '@/components/chat/ChatSidebar'

interface Chat {
  id: number
  ticket_number?: string
  user_id: number
  user_name?: string
  status: string
  subject?: string
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

export default function SupportClient() {
  const t = useTranslations('pages.support')
  const params = useParams()
  const locale = (params?.locale as string) || 'ru'
  const { user, isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()
  const chatStore = useChatStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [initialMessage, setInitialMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Footer data for unauthenticated users
  const { data: f } = useQuery({
    queryKey: ['footer', locale],
    queryFn: async () => {
      const { data } = await api.get(`/footer?locale=${locale}`)
      return data?.data || {}
    },
    enabled: !isAuthenticated,
  })

  // Auth token for WebSocket
  const authToken = useAuthStore((s) => {
    // Get token from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.TOKEN) || ''
    }
    return ''
  })

  // Chats list (only when authenticated)
  const { data: chats = [], isLoading: chatsLoading } = useQuery({
    queryKey: ['my-chats'],
    queryFn: async () => {
      const { data } = await api.get('/support/chats')
      return data || []
    },
    enabled: isAuthenticated,
    refetchInterval: 15000,
  })

  // Messages for active chat
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', chatStore.activeChatId],
    queryFn: async () => {
      if (!chatStore.activeChatId) return []
      const { data } = await api.get(
        `/support/chats/${chatStore.activeChatId}/messages`,
      )
      return data || []
    },
    enabled: isAuthenticated && !!chatStore.activeChatId,
    refetchInterval: 10000,
  })

  // Connect WebSocket on mount
  useEffect(() => {
    if (isAuthenticated && authToken) {
      chatStore.connect(authToken)
      return () => {
        chatStore.disconnect()
      }
    }
  }, [isAuthenticated, authToken])

  // Subscribe to active chat
  useEffect(() => {
    if (chatStore.activeChatId && chatStore.connected) {
      chatStore.subscribe(chatStore.activeChatId)
      // Invalidate messages query to get fresh data
      queryClient.invalidateQueries({
        queryKey: ['chat-messages', chatStore.activeChatId],
      })
    }
  }, [chatStore.activeChatId, chatStore.connected])

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback(
    (data: any) => {
      if (data.type === 'new_message') {
        // Invalidate both the messages list and the chat list
        queryClient.invalidateQueries({
          queryKey: ['chat-messages', data.chat_id],
        })
        queryClient.invalidateQueries({ queryKey: ['my-chats'] })
      }
      if (data.type === 'status_changed') {
        queryClient.invalidateQueries({ queryKey: ['my-chats'] })
      }
    },
    [queryClient],
  )

  useEffect(() => {
    chatStore.setOnMessage(handleWsMessage)
    return () => chatStore.setOnMessage(null)
  }, [handleWsMessage])

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

  const handleCreateChat = async () => {
    if (!initialMessage.trim() || creating) return
    setCreating(true)
    try {
      const { data } = await api.post('/support/chats', {
        message: initialMessage.trim(),
      })
      queryClient.invalidateQueries({ queryKey: ['my-chats'] })
      chatStore.setActiveChat(data.id)
      setCreateOpen(false)
      setInitialMessage('')
    } catch (e) {
      console.error('Failed to create chat', e)
    } finally {
      setCreating(false)
    }
  }

  const activeChat = chats.find((c: Chat) => c.id === chatStore.activeChatId)
  const hasOpenChat = (chats as Chat[]).some(
    (c) => c.status === 'new' || c.status === 'active',
  )

  // Check if any admin is typing in the active chat
  const isAdminTyping = chatStore.typingUsers.some(
    (t) => t.chatId === chatStore.activeChatId,
  )

  // Not authenticated - show static info
  if (!isAuthenticated) {
    return (
      <StaticPage title={t('title')}>
        <p>{t('desc')}</p>
        <div className="space-y-4 mt-4">
          <div className="flex items-start gap-3">
            <MessageCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{t('chat_title')}</p>
              <p>{f?.support_chat || t('chat_desc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{t('email_title')}</p>
              <p>{f?.support_email || t('email')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{t('phone_title')}</p>
              <p>
                {f?.support_phone ? formatPhone(f.support_phone) : t('phone')}
              </p>
            </div>
          </div>
        </div>
      </StaticPage>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold">Техническая поддержка</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={hasOpenChat}>
              <Plus className="w-4 h-4 mr-1" />
              Новое обращение
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новое обращение</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <textarea
                placeholder="Опишите вашу проблему..."
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
              />
              <Button
                onClick={handleCreateChat}
                disabled={creating || !initialMessage.trim()}
                className="w-full"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : null}
                Отправить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
        {/* Chats list */}
        <Card className="lg:col-span-1 overflow-hidden flex flex-col">
          <ChatSidebar
            chats={chats}
            activeChatId={chatStore.activeChatId}
            onSelectChat={(id) => chatStore.setActiveChat(id)}
            isLoading={chatsLoading}
            title="Обращение"
            compact
          />
        </Card>

        {/* Active chat */}
        <Card className="lg:col-span-2 overflow-hidden flex flex-col relative">
          {chatStore.activeChatId && activeChat ? (
            <>
              <CardHeader className="p-3 pb-0 shrink-0">
                <CardTitle className="font-bold font-mono text-base">
                  {activeChat.ticket_number || `#${activeChat.id}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden relative">
                <ChatWindow
                  messages={messages as Message[]}
                  currentUserId={user?.id || 0}
                  onSend={handleSend}
                  onTyping={handleTyping}
                  showTyping={isAdminTyping}
                  typingName="Администратор"
                  disabled={activeChat?.status === 'closed'}
                  placeholder={
                    activeChat?.status === 'closed'
                      ? 'Чат закрыт'
                      : 'Напишите сообщение... (Enter для отправки)'
                  }
                  className="h-full"
                />
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {chats.length === 0
                ? 'Создайте новое обращение, чтобы начать'
                : 'Выберите чат из списка'}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

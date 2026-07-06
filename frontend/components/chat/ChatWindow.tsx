'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import TypingIndicator from './TypingIndicator'

interface Message {
  id: number
  conversation_id: number
  sender_id: number
  sender_role: 'user' | 'admin'
  sender_name?: string
  sender_avatar_index?: number | null
  message: string
  created_at: string
}

interface ChatWindowProps {
  messages: Message[]
  currentUserId: number
  onSend: (text: string) => void
  onTyping?: (isTyping: boolean) => void
  placeholder?: string
  typingName?: string
  showTyping?: boolean
  disabled?: boolean
  className?: string
}

export default function ChatWindow({
  messages,
  currentUserId,
  onSend,
  onTyping,
  placeholder,
  typingName,
  showTyping,
  disabled,
  className,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const prevMessagesLength = useRef(messages.length)

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLength.current && isAtBottom) {
      scrollToBottom()
    }
    prevMessagesLength.current = messages.length
  }, [messages, isAtBottom])

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        '[data-radix-scroll-area-viewport]',
      )
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }

  const handleScroll = () => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        '[data-radix-scroll-area-viewport]',
      )
      if (viewport) {
        const { scrollTop, scrollHeight, clientHeight } = viewport
        setIsAtBottom(scrollHeight - scrollTop - clientHeight < 100)
      }
    }
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <ScrollArea
        ref={scrollRef}
        className="flex-1 p-4"
        onScrollCapture={handleScroll}
      >
        <div className="space-y-3 min-h-full">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Нет сообщений. Напишите что-нибудь...
            </div>
          )}
          {messages.map((msg, idx) => {
            // Add date divider if date changes
            const showDateDivider =
              idx === 0 ||
              new Date(msg.created_at).toDateString() !==
                new Date(messages[idx - 1].created_at).toDateString()
            return (
              <div key={msg.id}>
                {showDateDivider && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[10px] text-muted-foreground/40 bg-background px-2">
                      {new Date(msg.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </span>
                  </div>
                )}
                <ChatMessage
                  id={msg.id}
                  message={msg.message}
                  senderId={msg.sender_id}
                  senderRole={msg.sender_role}
                  senderName={msg.sender_name}
                  senderAvatarIndex={msg.sender_avatar_index}
                  createdAt={msg.created_at}
                  currentUserId={currentUserId}
                />
              </div>
            )
          })}
          {showTyping && typingName && (
            <div className="pl-9">
              <TypingIndicator name={typingName} />
            </div>
          )}
        </div>
      </ScrollArea>

      {!isAtBottom && messages.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full shadow-md h-8 w-8 p-0"
            onClick={scrollToBottom}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ChatInput
        onSend={onSend}
        onTyping={onTyping}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}

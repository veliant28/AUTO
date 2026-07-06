'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  onTyping?: (isTyping: boolean) => void
  disabled?: boolean
  placeholder?: string
}

export default function ChatInput({
  onSend,
  onTyping,
  disabled,
  placeholder,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || disabled || sending) return

    setSending(true)
    try {
      await onSend(trimmed)
      setText('')
      if (onTyping) onTyping(false)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (value: string) => {
    setText(value)
    if (onTyping) {
      onTyping(true)
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
      typingTimeout.current = setTimeout(() => {
        onTyping(false)
      }, 2000)
    }
  }

  return (
    <div className="flex items-end gap-2 border-t p-3 bg-background">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Напишите сообщение...'}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[38px] max-h-[120px]"
        style={{ height: 'auto' }}
        onInput={(e) => {
          const target = e.currentTarget
          target.style.height = 'auto'
          target.style.height = `${Math.min(target.scrollHeight, 120)}px`
        }}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!text.trim() || disabled || sending}
        className="shrink-0"
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </div>
  )
}

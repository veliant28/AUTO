'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Send, Loader2, Pencil, X } from 'lucide-react'

interface EditSession {
  id: number
  text: string
}

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>
  onTyping?: (isTyping: boolean) => void
  disabled?: boolean
  placeholder?: string
  /** Режим редактирования: текст сообщения подставлен в поле, отправка обновляет его */
  editSession?: EditSession | null
  onCancelEdit?: () => void
}

export default function ChatInput({
  onSend,
  onTyping,
  disabled,
  placeholder,
  editSession,
  onCancelEdit,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wasEditing = useRef(false)
  const t = useTranslations('admin')
  const editing = !!editSession

  // Вход в режим правки: подставляем текст и фокусируем поле;
  // выход — поле снова пустое (для нового сообщения)
  useEffect(() => {
    if (editSession) {
      setText(editSession.text)
      wasEditing.current = true
      const el = textareaRef.current
      if (el) {
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        })
      }
    } else if (wasEditing.current) {
      wasEditing.current = false
      setText('')
    }
  }, [editSession])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    if (!editing && disabled) return

    setSending(true)
    try {
      await onSend(trimmed)
      setText('')
      if (onTyping) onTyping(false)
    } catch {
      // Родитель уже показал ошибку — режим правки/текст сохраняем
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && editing) {
      e.preventDefault()
      onCancelEdit?.()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (value: string) => {
    setText(value)
    if (editing || !onTyping) return
    onTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      onTyping(false)
    }, 2000)
  }

  return (
    <div className="border-t p-3 bg-background space-y-2">
      {editing && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
            <Pencil className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{t('support_msg_editing')}</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground"
                onClick={() => onCancelEdit?.()}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('support_msg_cancel')}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Напишите сообщение...'}
          rows={1}
          disabled={disabled && !editing}
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
          disabled={!text.trim() || (!editing && disabled) || sending}
          className="shrink-0"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

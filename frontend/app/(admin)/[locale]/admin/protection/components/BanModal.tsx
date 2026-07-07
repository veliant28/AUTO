'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import api from '@/lib/api'

interface UserResult {
  id: number
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string
}

interface BanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultEmail?: string
  onSuccess?: () => void
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return phone
  const digits = d.slice(-10)
  return `+38 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
}

const BACKEND_ERROR_KEYS: Record<string, string> = {
  'User is already banned': 'protection_error_already_banned',
  'User is in whitelist and cannot be banned': 'protection_error_in_whitelist',
  'Ban record not found': 'protection_error_not_found',
  'User is not currently banned': 'protection_error_not_banned',
  'Email already in whitelist': 'protection_error_already_in_whitelist',
  'Email is required': 'protection_error_not_found',
}

function getTranslatedError(
  t: (key: string) => string,
  err: any,
  fallbackKey: string,
): string {
  const detail = err?.response?.data?.detail
  if (detail && BACKEND_ERROR_KEYS[detail]) {
    return t(BACKEND_ERROR_KEYS[detail])
  }
  return t(fallbackKey)
}

function getUserDisplayName(user: UserResult): string {
  const parts = [user.last_name, user.first_name].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  if (user.full_name) return user.full_name
  return user.email
}

export default function BanModal({
  open,
  onOpenChange,
  defaultEmail,
  onSuccess,
}: BanModalProps) {
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const [searchQuery, setSearchQuery] = useState(defaultEmail || '')
  const [reason, setReason] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedSearch('')
      return
    }
    setIsSearching(true)
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['admin-user-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { items: [] }
      const { data } = await api.get('/admin/users', {
        params: { search: debouncedSearch, page_size: 20 },
      })
      return data as { items: UserResult[]; total: number }
    },
    enabled: open && debouncedSearch.length >= 2,
    staleTime: 10000,
  })

  const users = searchResults?.items || []

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIdx(0)
  }, [users.length])

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (itemRefs.current[highlightedIdx]) {
      itemRefs.current[highlightedIdx]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [highlightedIdx])

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [open])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setReason('')
      setSelectedUser(null)
      setHighlightedIdx(0)
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIdx((prev) => Math.min(prev + 1, users.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIdx((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && !e.shiftKey) {
        if (users[highlightedIdx] && !selectedUser) {
          e.preventDefault()
          selectUser(users[highlightedIdx])
        }
      } else if (e.key === 'Escape') {
        if (selectedUser) {
          e.preventDefault()
          setSelectedUser(null)
          setSearchQuery('')
        }
      }
    },
    [users, highlightedIdx, selectedUser],
  )

  const selectUser = (user: UserResult) => {
    setSelectedUser(user)
    setSearchQuery(user.email)
    setHighlightedIdx(0)
  }

  const banMutation = useMutation({
    mutationFn: async (data: { email: string; reason: string }) => {
      const res = await api.post('/admin/protection/blacklist', data)
      return res.data
    },
    onSuccess: () => {
      toast.success(t('protection_ban_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-blacklist'],
      })
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (err: any) => {
      toast.error(getTranslatedError(t, err, 'protection_ban_error'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    if (!reason.trim()) {
      toast.warning(t('protection_ban_reason_required'))
      return
    }
    banMutation.mutate({ email: searchQuery.trim(), reason: reason.trim() })
  }

  const showDropdown =
    open &&
    !selectedUser &&
    searchQuery.length >= 2 &&
    (searchLoading || users.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-destructive" />
            {t('protection_ban_modal_title')}
          </DialogTitle>
          <DialogDescription>
            {t('protection_ban_modal_desc')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User search combobox */}
          <div className="relative">
            <label className="text-sm text-muted-foreground mb-1 block">
              {t('protection_user')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                className="pl-9"
                placeholder={t('protection_search')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSelectedUser(null)
                }}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div
                ref={listRef}
                className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden"
                onKeyDown={handleKeyDown}
              >
                <div
                  ref={listRef}
                  className="max-h-[240px] overflow-y-auto"
                  role="listbox"
                >
                  {searchLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : users.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {t('protection_empty_blacklist')}
                    </p>
                  ) : (
                    users.map((user, idx) => (
                      <div
                        key={user.id}
                        ref={(el) => {
                          itemRefs.current[idx] = el
                        }}
                        role="option"
                        aria-selected={idx === highlightedIdx}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors ${
                          idx === highlightedIdx
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-muted'
                        }`}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onClick={() => selectUser(user)}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">
                            {getUserDisplayName(user)}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </span>
                          {user.phone && (
                            <span className="text-xs text-muted-foreground truncate">
                              {formatPhone(user.phone)}
                            </span>
                          )}
                        </div>
                        <Badge
                          className={`${roleBadgeColors[user.role] || 'bg-gray-500 text-white'} border-0 text-sm shrink-0`}
                        >
                          {t(user.role)}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected user info */}
          {selectedUser && (
            <div className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {getUserDisplayName(selectedUser)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedUser.email}
                </p>
                {selectedUser.phone && (
                  <p className="text-xs text-muted-foreground truncate">
                    {formatPhone(selectedUser.phone)}
                  </p>
                )}
              </div>
              <Badge
                className={`${roleBadgeColors[selectedUser.role] || 'bg-gray-500 text-white'} border-0 text-sm shrink-0`}
              >
                {t(selectedUser.role)}
              </Badge>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {t('protection_reason')} *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              placeholder={t('protection_ban_reason_required')}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                banMutation.isPending || !searchQuery.trim() || !reason.trim()
              }
            >
              {banMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t('protection_ban_confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

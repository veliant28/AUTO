'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Search,
  Loader2,
  Eye,
  Ban,
  Unlock,
  ShieldCheck,
  ShieldX,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/hooks/useTimezone'
import BanModal from './components/BanModal'
import StatsModal from './components/StatsModal'

const PAGE_SIZES = [25, 50, 100]

const BACKEND_ERROR_KEYS: Record<string, string> = {
  'User is already banned': 'protection_error_already_banned',
  'User is in whitelist and cannot be banned': 'protection_error_in_whitelist',
  'Ban record not found': 'protection_error_not_found',
  'User is not currently banned': 'protection_error_not_banned',
  'Email already in whitelist': 'protection_error_already_in_whitelist',
  'Whitelist entry not found': 'protection_error_not_found',
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

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return phone
  const digits = d.slice(-10)
  return `+38 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
}

function getUserFullName(item: any): string {
  const parts = [item.last_name, item.first_name, item.middle_name].filter(
    Boolean,
  )
  if (parts.length > 0) return parts.join(' ')
  if (item.user_name) return item.user_name
  return item.email || '—'
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-orange-500 text-white',
  b2b: 'bg-green-500 text-white',
  retail: 'bg-gray-500 text-white',
}

export default function ProtectionPage() {
  const t = useTranslations('admin')
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuthStore()

  const tab = searchParams.get('tab') || 'blacklist'
  const [hydrated, setHydrated] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [banModalOpen, setBanModalOpen] = useState(false)
  const [statsModalOpen, setStatsModalOpen] = useState(false)
  const [selectedBanId, setSelectedBanId] = useState<number | null>(null)
  const [banDefaultEmail, setBanDefaultEmail] = useState('')

  useEffect(() => setHydrated(true), [])

  // Register global function for top-bar Ban button
  useEffect(() => {
    ;(window as any).__openBanModal = () => setBanModalOpen(true)
    return () => {
      delete (window as any).__openBanModal
    }
  }, [])

  const isBlacklist = tab === 'blacklist'

  // Fetch blacklist
  const blacklistQuery = useQuery({
    queryKey: ['admin-protection-blacklist', page, pageSize, search],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (search) params.search = search
      const { data } = await api.get('/admin/protection/blacklist', { params })
      return data
    },
    enabled: hydrated && !!user && isBlacklist,
  })

  // Fetch whitelist
  const whitelistQuery = useQuery({
    queryKey: ['admin-protection-whitelist', page, pageSize, search],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize }
      if (search) params.search = search
      const { data } = await api.get('/admin/protection/whitelist', { params })
      return data
    },
    enabled: hydrated && !!user && !isBlacklist,
  })

  const data = isBlacklist ? blacklistQuery.data : whitelistQuery.data
  const isLoading = isBlacklist
    ? blacklistQuery.isLoading
    : whitelistQuery.isLoading

  // Unban mutation
  const unbanMutation = useMutation({
    mutationFn: async (banId: number) => {
      const { data } = await api.post(
        `/admin/protection/blacklist/${banId}/unban`,
      )
      return data
    },
    onSuccess: () => {
      toast.success(t('protection_unban_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-blacklist'],
      })
    },
    onError: (err: any) => {
      toast.error(getTranslatedError(t, err, 'protection_ban_error'))
    },
  })

  // Remove from whitelist mutation
  const removeWhitelistMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/admin/protection/whitelist/${id}`)
      return data
    },
    onSuccess: () => {
      toast.success(t('protection_whitelist_remove_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-whitelist'],
      })
    },
    onError: (err: any) => {
      toast.error(getTranslatedError(t, err, 'protection_ban_error'))
    },
  })

  // Add to whitelist mutation
  const addWhitelistMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data } = await api.post('/admin/protection/whitelist', { email })
      return data
    },
    onSuccess: () => {
      toast.info(t('protection_whitelist_add_success'))
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-whitelist'],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin-protection-blacklist'],
      })
    },
    onError: (err: any) => {
      toast.error(getTranslatedError(t, err, 'protection_ban_error'))
    },
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className="p-6">
      {/* Search & Actions bar */}
      <div className="flex gap-4 mb-4 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('protection_search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {isBlacklist ? (
                      <>
                        <th className="text-left p-3 font-medium text-muted-foreground w-72">
                          {t('protection_user')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('role_label')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-48">
                          {t('protection_ip')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground">
                          {t('protection_reason')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-32">
                          {t('protection_blocks')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('protection_banned_at')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-48">
                          {t('protection_banned_by')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('protection_actions')}
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-3 font-medium text-muted-foreground w-72">
                          {t('protection_user')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('role_label')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground">
                          {t('protection_ip')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-48">
                          {t('protection_added_by')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('protection_added_at')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-44">
                          {t('protection_actions')}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data && data.items?.length > 0 ? (
                    data.items.map((item: any) => (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        {isBlacklist ? (
                          <>
                            <td className="p-3">
                              {item.user_name ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">
                                    {getUserFullName(item)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.email}
                                  </span>
                                  {item.phone && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatPhone(item.phone)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3">
                              {item.user_role ? (
                                <Badge
                                  className={`${roleBadgeColors[item.user_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                                >
                                  {t(item.user_role)}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs">
                              {item.ip_address || '—'}
                            </td>
                            <td className="p-3" title={item.reason}>
                              {item.reason || '—'}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-sm">
                                {item.block_count || 1}
                              </Badge>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {formatDate(item.banned_at)}
                            </td>
                            <td className="p-3">
                              {item.banned_by_name ? (
                                <div className="flex flex-col gap-0.5">
                                  {item.banned_by_role && (
                                    <Badge
                                      className={`${roleBadgeColors[item.banned_by_role] || 'bg-gray-500 text-white'} border-0 text-sm w-fit`}
                                    >
                                      {t(item.banned_by_role)}
                                    </Badge>
                                  )}
                                  <span className="font-medium">
                                    {item.banned_by_last_name &&
                                    item.banned_by_first_name
                                      ? `${item.banned_by_last_name} ${item.banned_by_first_name}`
                                      : item.banned_by_name}
                                  </span>
                                </div>
                              ) : (
                                <Badge className="bg-gray-500 text-white border-0 text-sm">
                                  {t('system_actor')}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                {item.is_active && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => {
                                            setSelectedBanId(item.id)
                                            setStatsModalOpen(true)
                                          }}
                                        >
                                          <Eye className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>{t('protection_stats_title')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="text-green-600 hover:text-green-700"
                                          onClick={() =>
                                            unbanMutation.mutate(item.id)
                                          }
                                          disabled={unbanMutation.isPending}
                                        >
                                          <Unlock className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>{t('protection_unban')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="text-blue-600 hover:text-blue-700"
                                          onClick={() =>
                                            addWhitelistMutation.mutate(
                                              item.email,
                                            )
                                          }
                                          disabled={
                                            addWhitelistMutation.isPending
                                          }
                                        >
                                          <ShieldCheck className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>{t('protection_add_whitelist')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                                {!item.is_active && (
                                  <span className="text-xs text-muted-foreground italic px-2">
                                    {t('protection_unban_success')}
                                  </span>
                                )}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3">
                              {item.user_name ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">
                                    {getUserFullName(item)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.email}
                                  </span>
                                  {item.phone && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatPhone(item.phone)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3">
                              {item.user_role ? (
                                <Badge
                                  className={`${roleBadgeColors[item.user_role] || 'bg-gray-500 text-white'} border-0 text-sm`}
                                >
                                  {t(item.user_role)}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs">
                              {item.ip_address || '—'}
                            </td>
                            <td className="p-3">
                              {item.added_by_name ? (
                                <div className="flex flex-col gap-0.5">
                                  {item.added_by_role && (
                                    <Badge
                                      className={`${roleBadgeColors[item.added_by_role] || 'bg-gray-500 text-white'} border-0 text-sm w-fit`}
                                    >
                                      {t(item.added_by_role)}
                                    </Badge>
                                  )}
                                  <span className="font-medium">
                                    {item.added_by_last_name &&
                                    item.added_by_first_name
                                      ? `${item.added_by_last_name} ${item.added_by_first_name}`
                                      : item.added_by_name}
                                  </span>
                                </div>
                              ) : (
                                <Badge className="bg-gray-500 text-white border-0 text-sm">
                                  {t('system_actor')}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {formatDate(item.added_at)}
                            </td>
                            <td className="p-3">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() =>
                                      removeWhitelistMutation.mutate(item.id)
                                    }
                                    disabled={removeWhitelistMutation.isPending}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <p>{t('protection_remove_whitelist')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={isBlacklist ? 8 : 6}
                        className="p-6 text-center text-muted-foreground text-sm"
                      >
                        {isBlacklist
                          ? t('protection_empty_blacklist')
                          : t('protection_empty_whitelist')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-sm text-muted-foreground">
                {t('page_of', { page, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('prev_page')}
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number
                  if (totalPages <= 7) {
                    p = i + 1
                  } else if (page <= 4) {
                    p = i + 1
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i
                  } else {
                    p = page - 3 + i
                  }
                  return (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next_page')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ban Modal */}
      <BanModal
        open={banModalOpen}
        onOpenChange={setBanModalOpen}
        defaultEmail={banDefaultEmail}
      />

      {/* Stats Modal */}
      <StatsModal
        open={statsModalOpen}
        onOpenChange={setStatsModalOpen}
        banId={selectedBanId}
      />
    </div>
  )
}

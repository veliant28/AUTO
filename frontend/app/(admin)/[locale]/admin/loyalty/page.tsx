'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  Search,
  Copy,
  Loader2,
  Plus,
  Gift,
  AlertTriangle,
  Building2,
  Truck,
  Zap,
  Minus,
  CalendarIcon,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { ru, uk, enUS } from 'date-fns/locale'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const DATE_FNS_LOCALE: Record<string, Locale> = { ru, uk, enUS }

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  let rest = digits
  if (rest.startsWith('380')) rest = rest.slice(3)
  else if (rest.startsWith('38')) rest = rest.slice(2)
  if (rest.length < 8) return phone
  // Ensure leading 0 for formatting
  if (!rest.startsWith('0')) rest = '0' + rest
  return `+38 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8, 10)}`
}

export default function LoyaltyPage() {
  const { user } = useAuthStore()
  const t = useTranslations('admin')
  const locale = useLocale()
  const dateLocale = DATE_FNS_LOCALE[locale] || ru
  const queryClient = useQueryClient()

  // ── List state ──
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  // ── Stats period ──
  const [statsDays, setStatsDays] = useState('30')

  // ── Create modal ──
  const [createOpen, setCreateOpen] = useState(false)
  const [formType, setFormType] = useState('delivery')
  const [formUserId, setFormUserId] = useState<number | null>(null)
  const [formUser, setFormUser] = useState<any>(null)
  const [formReason, setFormReason] = useState('')
  const [formPercent, setFormPercent] = useState(100)
  const [formExpires, setFormExpires] = useState('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [userQuery, setUserQuery] = useState('')

  // Register global create opener
  useEffect(() => {
    ;(window as any).__openCreateLoyalty = () => {
      setFormType('delivery')
      setFormPercent(100)
      setFormUserId(null)
      setFormUser(null)
      setFormExpires('')
      setFormReason('')
      setFormExpires('')
      setUserQuery('')
      setCreateOpen(true)
    }
    return () => {
      delete (window as any).__openCreateLoyalty
    }
  }, [])

  // ── Queries ──
  const { data: listData, isLoading } = useQuery({
    queryKey: ['admin-loyalty', page, search, staffFilter],
    queryFn: async () => {
      const params: any = { page, page_size: 10 }
      if (search) params.search = search
      if (staffFilter) params.staff_id = staffFilter
      const { data } = await api.get('/admin/loyalty', { params })
      return data
    },
    enabled: hydrated && !!user,
  })

  const { data: statsData } = useQuery({
    queryKey: ['admin-loyalty-stats', statsDays],
    queryFn: async () => {
      const { data } = await api.get('/admin/loyalty/stats', {
        params: { days: statsDays },
      })
      return data
    },
    enabled: hydrated && !!user,
  })

  const { data: staffList } = useQuery({
    queryKey: ['admin-loyalty-staff'],
    queryFn: async () => {
      const { data } = await api.get('/admin/loyalty/staff')
      return data as { id: number; name: string }[]
    },
    enabled: hydrated && !!user,
  })

  const { data: userSearchResults } = useQuery({
    queryKey: ['admin-loyalty-users', userQuery],
    queryFn: async () => {
      const { data } = await api.get('/admin/loyalty/search-users', {
        params: { q: userQuery },
      })
      return data as {
        id: number
        name: string
        email: string
        phone: string
      }[]
    },
    enabled: userQuery.length >= 2,
    staleTime: 10000,
  })

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async (formData: any) => {
      const { data } = await api.post('/admin/loyalty', formData)
      return data
    },
    onSuccess: () => {
      toast.success(t('loyalty_created'))
      queryClient.invalidateQueries({ queryKey: ['admin-loyalty'] })
      queryClient.invalidateQueries({ queryKey: ['admin-loyalty-stats'] })
      setCreateOpen(false)
    },
    onError: () => toast.error(t('loyalty_error')),
  })

  // ── Chart options ──
  const chartOption = useMemo(() => {
    const items = statsData?.items || []
    const dates = items.map((i: any) => i.date).reverse()
    const counts = items.map((i: any) => i.count).reverse()

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: any[]) => {
          if (!params?.length) return ''
          const p = params[0]
          const dayData = items.find((i: any) => i.date === p.axisValue)
          let text = `<strong>${p.axisValue}</strong><br/>${p.marker} Всего: ${p.value}`
          if (dayData?.staff?.length) {
            dayData.staff.forEach((s: any) => {
              text += `<br/>• ${s.name}: ${s.count}`
            })
          }
          return text
        },
      },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: { rotate: 45, fontSize: 11 },
      },
      yAxis: { type: 'value' as const, minInterval: 1 },
      series: [
        {
          type: 'bar' as const,
          data: counts,
          itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    }
  }, [statsData])

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  const totalPages = listData ? Math.ceil(listData.total / 10) : 0
  const items = listData?.items || []

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* ── Stats chart ── */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Gift className="w-5 h-5" /> {t('loyalty_title')}
              </h2>
              <Select value={statsDays} onValueChange={setStatsDays}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 {t('days')}</SelectItem>
                  <SelectItem value="90">90 {t('days')}</SelectItem>
                  <SelectItem value="180">180 {t('days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="h-[250px]">
              <ReactECharts option={chartOption} style={{ height: '100%' }} />
            </div>
          </CardContent>
        </Card>

        {/* ── Filters ── */}
        <div className="flex gap-4 flex-wrap mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('loyalty_search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            value={staffFilter}
            onValueChange={(v) => {
              setStaffFilter(v === 'all' ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('loyalty_staff')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products_filter_all')}</SelectItem>
              {(staffList || []).map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Table ── */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground w-[130px]">
                          {t('loyalty_code')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[70px]">
                          {t('loyalty_discount_percent')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[120px]">
                          {t('loyalty_type')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[200px]">
                          {t('loyalty_client')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[250px]">
                          {t('loyalty_reason')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[140px]">
                          {t('status')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[150px]">
                          {t('loyalty_staff')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[160px]">
                          {t('loyalty_created_at')}
                        </th>
                        <th className="text-left p-3 font-medium text-muted-foreground w-[160px]">
                          {t('loyalty_expires_at')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any) => {
                        const expired = new Date(item.expires_at) < new Date()
                        return (
                          <tr
                            key={item.id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <code className="font-mono text-sm font-bold tracking-wider">
                                  {item.code}
                                </code>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-10 w-10"
                                      onClick={() => {
                                        navigator.clipboard.writeText(item.code)
                                        toast.success(t('loyalty_copied'))
                                      }}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t('loyalty_copy')}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="text-sm font-semibold">
                                {item.discount_percent || 100}%
                              </span>
                            </td>
                            <td className="p-3">
                              <Badge
                                className={`${item.type === 'delivery' ? 'bg-blue-500' : 'bg-purple-500'} text-white border-0 text-sm`}
                              >
                                {item.type === 'delivery'
                                  ? t('loyalty_type_delivery')
                                  : t('loyalty_type_margin')}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="text-sm">
                                <p className="font-medium truncate">
                                  {item.user_name || '—'}
                                </p>
                                {(item.user_phone || item.user_email) && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {formatPhone(item.user_phone) ||
                                      item.user_email}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-sm truncate">
                              {item.reason}
                            </td>
                            <td className="p-3">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    className={`${item.used_at ? 'bg-green-500' : expired ? 'bg-red-500' : 'bg-gray-500'} text-white border-0 text-sm cursor-pointer`}
                                  >
                                    {item.used_at
                                      ? t('status_used')
                                      : expired
                                        ? t('status_expired')
                                        : t('status_unused')}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {item.used_at
                                    ? `${t('loyalty_used_at')}: ${new Date(item.used_at + 'Z').toLocaleString()}`
                                    : ''}
                                  {!item.used_at && expired
                                    ? `${t('loyalty_expired_at')}: ${new Date(item.expires_at + 'Z').toLocaleString()}`
                                    : ''}
                                  {!item.used_at && !expired
                                    ? `${t('loyalty_valid_until')}: ${new Date(item.expires_at + 'Z').toLocaleString()}`
                                    : ''}
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="p-3 text-sm">
                              {item.issued_by_name || '—'}
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {new Date(item.created_at + 'Z').toLocaleString()}
                            </td>
                            <td className="p-3">
                              <span
                                className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}
                              >
                                {new Date(
                                  item.expires_at + 'Z',
                                ).toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {items.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-6 text-center text-muted-foreground text-sm"
                          >
                            {t('loyalty_empty')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                      {Array.from(
                        { length: Math.min(totalPages, 5) },
                        (_, i) => {
                          let p: number
                          if (totalPages <= 5) p = i + 1
                          else if (page <= 3) p = i + 1
                          else if (page >= totalPages - 2)
                            p = totalPages - 4 + i
                          else p = page - 2 + i
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
                        },
                      )}
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
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Create dialog ── */}
        <Dialog
          open={createOpen}
          onOpenChange={(open) => !open && setCreateOpen(false)}
        >
          <DialogContent
            className="max-w-lg max-h-[80vh] overflow-y-auto"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                  <Gift className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <DialogTitle>{t('loyalty_create')}</DialogTitle>
                  <DialogDescription>
                    {t('loyalty_generated')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Type */}
              <div className="space-y-2">
                <Label>{t('loyalty_type')}</Label>
                <RadioGroup
                  value={formType}
                  onValueChange={setFormType}
                  className="grid grid-cols-2 gap-3"
                >
                  <Label className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer">
                    <RadioGroupItem value="delivery" />{' '}
                    <Truck className="w-5 h-5" /> {t('loyalty_type_delivery')}
                  </Label>
                  <Label className="flex items-center gap-3 rounded-lg border p-4 has-data-[state=checked]:border-primary cursor-pointer">
                    <RadioGroupItem value="margin" />{' '}
                    <Zap className="w-5 h-5" /> {t('loyalty_type_margin')}
                  </Label>
                </RadioGroup>
              </div>

              {/* Client search */}
              <div className="space-y-2">
                <Label>{t('loyalty_client')}</Label>
                <Input
                  placeholder={t('loyalty_client_search')}
                  value={userQuery}
                  onChange={(e) => {
                    setUserQuery(e.target.value)
                    setFormUserId(null)
                    setFormUser(null)
                  }}
                />
                {userQuery.length >= 2 && userSearchResults && (
                  <div className="rounded-md border max-h-40 overflow-y-auto">
                    {userSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">
                        {t('no_results')}
                      </p>
                    ) : (
                      userSearchResults.map((u: any) => (
                        <div
                          key={u.id}
                          className={`p-3 text-sm cursor-pointer hover:bg-muted ${formUserId === u.id ? 'bg-primary/10' : ''}`}
                          onClick={() => {
                            setFormUserId(u.id)
                            setFormUser(u)
                            setUserQuery('')
                          }}
                        >
                          <p className="font-medium flex items-center gap-2">
                            {formUserId === u.id && (
                              <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                            {u.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {u.email}{' '}
                            {u.phone ? `• ${formatPhone(u.phone)}` : ''}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {formUser && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="font-medium text-sm flex items-center gap-2 justify-between">
                      {formUser.name}
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formUser.email}{' '}
                      {formUser.phone ? `• ${formatPhone(formUser.phone)}` : ''}
                    </p>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label>{t('loyalty_reason')} *</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t('loyalty_reason_placeholder')}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                />
              </div>

              {/* Discount percent */}
              <div className="space-y-2">
                <Label>{t('loyalty_discount_percent')}</Label>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full shrink-0"
                    disabled={formType === 'delivery' || formPercent <= 0}
                    onClick={() =>
                      setFormPercent(Math.max(0, formPercent - 10))
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-12 text-center font-bold tabular-nums">
                    {formType === 'delivery' ? '100' : formPercent}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full shrink-0"
                    disabled={formType === 'delivery' || formPercent >= 100}
                    onClick={() =>
                      setFormPercent(Math.min(100, formPercent + 10))
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Expires at */}
              <div className="space-y-2">
                <Label>{t('loyalty_expires_at')} *</Label>
                <Popover
                  open={datePickerOpen}
                  onOpenChange={setDatePickerOpen}
                  modal={false}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {formExpires
                        ? format(
                            new Date(formExpires + 'T00:00:00'),
                            'dd.MM.yyyy',
                          )
                        : t('loyalty_expires_placeholder')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div style={{ pointerEvents: 'auto' }}>
                      <Calendar
                        mode="single"
                        className="rounded-md"
                        navLayout="around"
                        locale={dateLocale}
                        selected={
                          formExpires
                            ? new Date(formExpires + 'T00:00:00')
                            : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            setFormExpires(format(date, 'yyyy-MM-dd'))
                            setDatePickerOpen(false)
                          }
                        }}
                        disabled={{ before: new Date() }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                className="gap-2"
                disabled={
                  createMutation.isPending || !formReason || !formExpires
                }
                onClick={() => {
                  createMutation.mutate({
                    type: formType,
                    user_id: formUserId,
                    discount_percent:
                      formType === 'delivery' ? 100 : formPercent,
                    reason: formReason,
                    expires_at: new Date(
                      formExpires + 'T23:59:59',
                    ).toISOString(),
                  })
                }}
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {t('loyalty_create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

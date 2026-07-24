'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMessages, useLocale } from 'next-intl'
import {
  ArrowLeft,
  RotateCcw,
  Package,
  Plus,
  Minus,
  Trash2,
  Loader2,
  Save,
  Pencil,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useAuthStore } from '@/store/authStore'
import { RETURN_STATUS_LABELS } from '@/lib/constants'
import { toast } from '@/lib/toast'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'

const LOCALE_MAP: Record<string, string> = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone
  const d = digits.slice(-10)
  return `+38 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`
}

const CAN_EDIT_STATUSES = ['pending']

export default function ReturnDetailPage() {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const messages = useMessages()
  const msgs = messages as Record<string, any>
  const t = (key: string) => msgs?.common?.[key] ?? key
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const returnId = params.id
  const { isAuthenticated } = useAuthStore()

  const {
    data: ret,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['return', returnId],
    queryFn: async () => {
      const { data } = await api.get(`/returns/${returnId}`)
      return data
    },
    enabled: !!returnId && isAuthenticated,
    refetchInterval: 10000,
  })

  // Listen for real-time status changes from admin
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('return-status')
      channel.onmessage = () => {
        refetch()
      }
      return () => channel.close()
    } catch {}
  }, [refetch])

  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [removedItems, setRemovedItems] = useState<Set<number>>(new Set())
  const [ttnInput, setTtnInput] = useState('')
  const [ttnEditMode, setTtnEditMode] = useState(false)
  const [cardInput, setCardInput] = useState('')
  const [cardEditMode, setCardEditMode] = useState(false)

  useEffect(() => {
    if (ret?.items) {
      const q: Record<number, number> = {}
      ret.items.forEach((item: any) => {
        q[item.part_id] = item.quantity
      })
      setQuantities(q)
      setRemovedItems(new Set())
    }
    if (ret?.ttn_number) {
      const formatted = ret.ttn_number.replace(
        /(\d{2})(\d{4})(\d{4})(\d{4})/,
        '$1 $2 $3 $4',
      )
      setTtnInput(formatted)
      setTtnEditMode(false)
    }
    if (ret?.bank_card) {
      setCardInput(ret.bank_card.replace(/\s/g, ''))
      setCardEditMode(false)
    } else {
      setCardInput('')
      setCardEditMode(canEdit)
    }
  }, [ret])

  const canEdit = ret && CAN_EDIT_STATUSES.includes(ret.status)

  const locale = LOCALE_MAP[useLocale()] || 'ru-RU'
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)

  const submitMutation = useMutation({
    mutationFn: async (items: { part_id: number; quantity: number }[]) => {
      const { data } = await api.put(`/returns/${returnId}`, { items })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      toast.success(t('return_created'))
      router.push('/returns')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('error'))
    },
  })

  const ttnMutation = useMutation({
    mutationFn: async (ttn: string) => {
      const cleanTtn = ttn.replace(/\s/g, '')
      const { data } = await api.put(`/returns/${returnId}/ttn`, {
        ttn_number: cleanTtn,
      })
      return data
    },
    onSuccess: () => {
      setTtnEditMode(false)
      toast.success('ТТН сохранён')
      refetch()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('error'))
    },
  })

  const cardMutation = useMutation({
    mutationFn: async (card: string) => {
      const cleanCard = card.replace(/\s/g, '')
      const { data } = await api.put(`/returns/${returnId}/card`, {
        bank_card: cleanCard,
      })
      return data
    },
    onSuccess: () => {
      setCardEditMode(false)
      toast.success(t('return_card_saved'))
      refetch()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('error'))
    },
  })

  const handleTtnChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14)
    const formatted = digits.replace(
      /(\d{2})(\d{0,4})?(\d{0,4})?(\d{0,4})?/,
      (_, p1, p2, p3, p4) => {
        let res = p1
        if (p2) res += ' ' + p2
        if (p3) res += ' ' + p3
        if (p4) res += ' ' + p4
        return res
      },
    )
    setTtnInput(formatted)
  }

  const handleCardChange = (value: string) => {
    setCardInput(value.replace(/\D/g, '').slice(0, 16))
  }

  function maskCard(card: string): string {
    const digits = card.replace(/\s/g, '')
    if (digits.length < 8) return card
    return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`
  }

  const visibleItems = useMemo(() => {
    if (!ret?.items) return []
    return ret.items.filter((item: any) => !removedItems.has(item.part_id))
  }, [ret, removedItems])

  const totalRefund = useMemo(() => {
    if (!canEdit) return ret?.total_refund || 0
    return visibleItems.reduce((sum: number, item: any) => {
      const qty = quantities[item.part_id] ?? item.quantity
      return sum + qty * item.price
    }, 0)
  }, [visibleItems, quantities, canEdit, ret])

  const handleQuantityChange = (partId: number, delta: number) => {
    const current = quantities[partId] ?? 1
    const orderItem = ret?.items?.find((i: any) => i.part_id === partId)
    const maxQty = orderItem?.quantity ?? current
    const newQty = Math.max(1, Math.min(maxQty, current + delta))
    if (newQty !== current) {
      toast.info(delta > 0 ? 'Количество увеличено' : 'Количество уменьшено')
    }
    setQuantities((prev) => ({ ...prev, [partId]: newQty }))
  }

  const handleRemoveItem = (partId: number) => {
    setRemovedItems((prev) => new Set(prev).add(partId))
    toast.info('Товар удалён из возврата')
  }

  const handleSubmit = () => {
    const items = visibleItems.map((item: any) => ({
      part_id: item.part_id,
      quantity: quantities[item.part_id] ?? item.quantity,
    }))
    submitMutation.mutate(items)
  }

  if (!mounted) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold">{t('login_required')}</h1>
        <Link href="/auth/login">
          <Button className="mt-4">{t('login')}</Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!ret) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <RotateCcw className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-4">{t('return_not_found')}</h1>
        <Link href="/returns">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> {t('back')}
          </Button>
        </Link>
      </div>
    )
  }

  const statusInfo = RETURN_STATUS_LABELS[ret.status] || {
    labelKey: 'return_pending',
    className: 'bg-gray-500 text-white',
  }
  const date = new Date(ret.created_at + 'Z').toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <Link href="/returns">
            <Button variant="outline" size="lg" className="gap-2">
              <ArrowLeft className="w-5 h-5" /> {t('all_returns')}
            </Button>
          </Link>
          {canEdit && (
            <Button
              size="lg"
              className="gap-2"
              onClick={handleSubmit}
              disabled={submitMutation.isPending || visibleItems.length === 0}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RotateCcw className="w-5 h-5" />
              )}
              {t('return_submit')}
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Status + Return data */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-mono">
                  {ret.return_number}
                </h1>
                <Badge className={`${statusInfo.className} border-0 text-sm`}>
                  {t(statusInfo.labelKey)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{date}</p>
              <p className="font-semibold text-base">
                Заказ: {ret.order_number}
              </p>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-base">
                    {t('return_total')}
                  </h3>
                  <p className="text-3xl font-bold">{fmt(totalRefund)} ₴</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-base">
                    {t('return_card_label')}
                  </h3>
                  <div className="flex items-center gap-2">
                    {cardEditMode || !ret.bank_card ? (
                      <>
                        <InputOTP
                          maxLength={16}
                          value={cardInput}
                          onChange={handleCardChange}
                          inputMode="numeric"
                          pattern="[0-9]*"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                            <InputOTPSlot index={6} />
                            <InputOTPSlot index={7} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={8} />
                            <InputOTPSlot index={9} />
                            <InputOTPSlot index={10} />
                            <InputOTPSlot index={11} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={12} />
                            <InputOTPSlot index={13} />
                            <InputOTPSlot index={14} />
                            <InputOTPSlot index={15} />
                          </InputOTPGroup>
                        </InputOTP>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              onClick={() => cardMutation.mutate(cardInput)}
                              disabled={
                                cardMutation.isPending ||
                                cardInput.replace(/\s/g, '').length < 16
                              }
                            >
                              {cardMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('return_card_save')}
                          </TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <div className="w-[210px] h-10 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono flex items-center text-muted-foreground">
                          {maskCard(cardInput || ret.bank_card)}
                        </div>
                        {canEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setCardEditMode(true)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('return_card_edit')}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">{t('recipient')}</h3>
                  {(ret.status === 'approved' ||
                    ret.status === 'completed') && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ttnInput}
                        onChange={(e) => handleTtnChange(e.target.value)}
                        placeholder="XX XXXX XXXX XXXX"
                        disabled={!ttnEditMode && !!ret.ttn_number}
                        maxLength={17}
                        className={`w-[180px] h-10 rounded-md border px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          !ttnEditMode && ret.ttn_number
                            ? 'bg-muted/30 text-muted-foreground cursor-default'
                            : 'bg-background'
                        }`}
                      />
                      {ttnEditMode || !ret.ttn_number ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              onClick={() => ttnMutation.mutate(ttnInput)}
                              disabled={
                                ttnMutation.isPending ||
                                ttnInput.replace(/\s/g, '').length !== 14
                              }
                            >
                              {ttnMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Сохранить</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setTtnEditMode(true)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Редактировать</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
                {(ret.status === 'approved' || ret.status === 'completed') &&
                (ret.return_phone || ret.return_last_name) ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      {[
                        ret.return_last_name,
                        ret.return_first_name,
                        ret.return_middle_name,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                    <p className="text-muted-foreground">
                      {formatPhone(ret.return_phone)}
                    </p>
                    <p className="text-muted-foreground">
                      {[ret.return_delivery_city, ret.return_delivery_warehouse]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Данные для отправки появятся после одобрения администратором
                  </p>
                )}
              </div>
            </div>

            {/* Right: Items */}
            <div className="space-y-4">
              <h3 className="font-semibold text-base">{t('return_items')}</h3>
              <div className="space-y-3">
                {visibleItems.map((item: any) => {
                  const qty = quantities[item.part_id] ?? item.quantity
                  const itemTotal = qty * item.price
                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {item.brand && (
                            <Badge
                              variant="secondary"
                              className="text-sm px-1.5"
                            >
                              {item.brand}
                            </Badge>
                          )}
                          <span className="text-sm font-mono text-muted-foreground">
                            {item.article}
                          </span>
                        </div>
                        <p className="text-sm font-medium line-clamp-2">
                          {item.part_name}
                        </p>
                        {canEdit ? (
                          <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-full"
                                onClick={() =>
                                  handleQuantityChange(item.part_id, -1)
                                }
                                disabled={qty <= 1}
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="w-8 text-center font-medium tabular-nums">
                                {qty}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-full"
                                onClick={() =>
                                  handleQuantityChange(item.part_id, 1)
                                }
                                disabled={
                                  qty >= (item.max_quantity || item.quantity)
                                }
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                              <span className="text-sm text-muted-foreground ml-1">
                                × {fmt(item.price)} ₴
                              </span>
                            </div>
                            <span className="font-semibold text-base">
                              {fmt(itemTotal)} ₴
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-sm text-muted-foreground">
                              {item.quantity} × {fmt(item.price)} ₴
                            </span>
                            <span className="font-semibold text-base">
                              {fmt(item.total)} ₴
                            </span>
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex items-start">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="shrink-0"
                                onClick={() => handleRemoveItem(item.part_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              {t('delete')}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  )
                })}
                {visibleItems.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Нет товаров для возврата
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import { getBrandColor, getBrandInitial } from '@/lib/brand'
import { supplierBadgeClass, supplierBadgeLabel } from '@/lib/suppliers'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

export interface OrderSearchProduct {
  part_id: number
  article: string
  brand: string | null
  name: string
  sku: string | null
  image_url: string | null
  price: number | null
  currency: string | null
  quantity: number
  supplier_name: string | null
  supplier_offer_id: number | null
}

interface OrderProductSearchProps {
  onAdd: (item: OrderSearchProduct) => void
  /** Уже добавленные товары: part_id → количество */
  addedQuantities?: Record<number, number>
}

/**
 * Поиск товара для добавления в заказ. Живёт в футере модалки, поэтому
 * список результатов раскрывается вверх и не выходит за нижнюю границу экрана.
 */
export default function OrderProductSearch({
  onAdd,
  addedQuantities = {},
}: OrderProductSearchProps) {
  const t = useTranslations('admin')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['admin-order-product-search', debounced],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders/product-search', {
        params: { q: debounced, limit: 15 },
      })
      return (data?.items || []) as OrderSearchProduct[]
    },
    enabled: debounced.length >= 2,
    staleTime: 30000,
  })

  const tooShort = debounced.length < 2
  const showPanel = open && query.trim().length > 0
  const items = useMemo(() => (tooShort ? [] : products), [tooShort, products])

  useEffect(() => {
    setActive(0)
  }, [debounced])

  // Держим подсвеченный клавиатурой пункт в зоне видимости
  useEffect(() => {
    const node = listRef.current?.querySelector(
      `[data-index="${active}"]`,
    ) as HTMLElement | null
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const handleAdd = (item: OrderSearchProduct) => {
    onAdd(item)
    setQuery('')
    setDebounced('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (tooShort || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
      } else {
        setActive((prev) => (prev + 1) % items.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(items.length - 1)
      } else {
        setActive((prev) => (prev - 1 + items.length) % items.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[active]
      if (item) handleAdd(item)
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        className="pl-9 h-10"
        placeholder={t('order_search_placeholder')}
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {showPanel && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {tooShort ? (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                {t('order_search_hint')}
              </p>
            ) : isFetching && items.length === 0 ? (
              <div className="px-3 py-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                {t('order_search_empty')}
              </p>
            ) : (
              items.map((item, index) => {
                const inOrder = addedQuantities[item.part_id]
                return (
                  <button
                    type="button"
                    key={item.part_id}
                    data-index={index}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => handleAdd(item)}
                    className={`w-full text-left flex gap-3 p-2.5 border-b last:border-0 transition-colors ${
                      index === active ? 'bg-accent' : 'hover:bg-accent/60'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 shrink-0 rounded-lg overflow-hidden relative flex items-center justify-center ${
                        item.image_url
                          ? ''
                          : `bg-gradient-to-br ${getBrandColor(item.brand)}`
                      }`}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-bold text-white/40 select-none">
                          {getBrandInitial(item.brand)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        {item.brand && (
                          <Badge variant="secondary" className="text-xs px-1.5">
                            {item.brand}
                          </Badge>
                        )}
                        <span className="text-xs font-mono text-muted-foreground">
                          {item.article}
                        </span>
                        {item.supplier_name && (
                          <Badge
                            className={`${supplierBadgeClass(item.supplier_name)} border-0 text-xs`}
                            title={item.supplier_name}
                          >
                            {supplierBadgeLabel(item.supplier_name)}
                          </Badge>
                        )}
                        {inOrder ? (
                          <Badge className="bg-green-500 text-white border-0 text-xs ml-auto">
                            {t('items_count_pcs', { count: inOrder })}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm line-clamp-1">{item.name}</p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {item.sku && (
                        <div>
                          <Badge className="bg-blue-500 text-white border-0 text-xs">
                            {item.sku}
                          </Badge>
                        </div>
                      )}
                      <div className="font-semibold text-sm whitespace-nowrap">
                        {item.price != null ? `${fmt(item.price)} ₴` : '—'}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

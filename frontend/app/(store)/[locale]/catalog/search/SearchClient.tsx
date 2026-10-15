'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Package, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchSkeleton } from '@/components/ui/Skeletons'
import PageTransition from '@/components/ui/PageTransition'

const fmt = (n: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)

export default function SearchPage() {
  const t = useTranslations('common')
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams.get('q') || ''
  const [searchInput, setSearchInput] = useState(query)

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query) return []
      const { data } = await api.get('/catalog/search', {
        params: { q: query },
      })
      return data
    },
    enabled: !!query,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      router.push(`/catalog/search?q=${encodeURIComponent(searchInput.trim())}`)
    }
  }

  return (
    <PageTransition>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <form onSubmit={handleSearch} className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('search_placeholder')}
            className="pl-12 h-14 text-lg"
          />
        </form>

        {query && (
          <p className="text-muted-foreground mb-6">
            {t('results_for')}{' '}
            <span className="font-medium text-foreground">{query}</span>
          </p>
        )}

        {isLoading ? (
          <SearchSkeleton />
        ) : results?.length === 0 && query ? (
          <div className="text-center py-20 space-y-4">
            <Package className="w-16 h-16 mx-auto text-muted-foreground/40" />
            <p className="text-lg font-medium">{t('no_results')}</p>
            <p className="text-muted-foreground text-sm">
              {t('no_results_desc')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {results?.map((part: any) => {
              // Процент выгоды B2B-цены против розничной (для зелёного чипа)
              const b2bPct =
                part.is_b2b &&
                part.price != null &&
                part.retail_price != null &&
                part.retail_price > part.price
                  ? Math.round((1 - part.price / part.retail_price) * 100)
                  : null
              return (
                <div
                  key={part.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1 mr-4">
                    <div className="flex items-center gap-2">
                      {part.brand && (
                        <Badge variant="secondary" className="text-sm px-1.5">
                          {part.brand}
                        </Badge>
                      )}
                      <span className="font-mono text-sm text-muted-foreground">
                        {part.article}
                      </span>
                    </div>
                    <p className="font-medium line-clamp-2">{part.name}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {part.price && (
                      <div className="text-right space-y-0.5">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="font-bold text-lg whitespace-nowrap">
                            {fmt(part.price)} ₴
                          </span>
                          {b2bPct != null && (
                            <Badge className="bg-green-500 text-white border-0 text-xs px-1.5 shrink-0">
                              −{b2bPct}%
                            </Badge>
                          )}
                        </div>
                        {/* Зачёркнутая розничная — видна только B2B-клиенту */}
                        {b2bPct != null && part.retail_price != null && (
                          <span className="block text-xs text-muted-foreground line-through">
                            {fmt(part.retail_price)} ₴
                          </span>
                        )}
                      </div>
                    )}
                    <Button variant="outline" size="lg" asChild>
                      <Link href={`/catalog/${part.sku || part.article}`}>
                        {t('details')} <ChevronRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PageTransition>
  )
}

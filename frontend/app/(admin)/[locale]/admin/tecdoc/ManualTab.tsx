'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Search, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/lib/toast'
import api from '@/lib/api'

export default function ManualTab({ t }: { t: (k: string) => string }) {
  const [article, setArticle] = useState('')
  const [candidates, setCandidates] = useState<any[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null)
  const [details, setDetails] = useState<any>(null)
  const [sku, setSku] = useState('')
  const [skuResults, setSkuResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [binding, setBinding] = useState(false)
  const [searchMode, setSearchMode] = useState<'local' | 'remote' | 'both'>(
    'local',
  )
  const [brandFilter, setBrandFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')

  const doSearch = async () => {
    if (!article.trim()) return
    setSearching(true)
    try {
      const localPromise =
        searchMode === 'local' || searchMode === 'both'
          ? api
              .post('/admin/tecdoc/manual/search', { article: article.trim() })
              .then((r) => r.data || [])
          : Promise.resolve([])

      const remotePromise =
        searchMode === 'remote' || searchMode === 'both'
          ? api
              .post('/admin/tecdoc/manual/search-remote', {
                article: article.trim(),
              })
              .then((r) => r.data || [])
          : Promise.resolve([])

      const [localRes, remoteRes] = await Promise.all([
        localPromise,
        remotePromise,
      ])

      if (searchMode === 'both') {
        const seen = new Set<string>()
        const merged: any[] = []
        for (const c of [...localRes, ...remoteRes]) {
          const key = `${c.brand || ''}|${c.article}`
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(c)
          }
        }
        setCandidates(merged)
      } else {
        setCandidates(searchMode === 'local' ? localRes : remoteRes)
      }
      setSelectedCandidate(null)
      setDetails(null)
    } catch {
      toast.error(t('save_error'))
    } finally {
      setSearching(false)
    }
  }

  const loadDetails = async (cand: any) => {
    setSelectedCandidate(cand)
    try {
      const { data } = await api.post('/admin/tecdoc/manual/details', {
        article: cand.article,
      })
      setDetails(data)
    } catch {
      setDetails(null)
    }
  }

  const doBind = async (spId: number) => {
    if (!selectedCandidate) return
    setBinding(true)
    try {
      await api.post('/admin/tecdoc/manual/bind', {
        supplier_price_id: spId,
        tecdoc_article: selectedCandidate.article,
        tecdoc_brand_id: selectedCandidate.brand_id,
        supplier_name: selectedCandidate.brand,
      })
      toast.success(t('tecdoc_bind_ok'))
    } catch {
      toast.error(t('save_error'))
    } finally {
      setBinding(false)
    }
  }

  const searchSku = async (q: string) => {
    setSku(q)
    if (q.length < 2) {
      setSkuResults([])
      return
    }
    try {
      const { data } = await api.get('/admin/tecdoc/articles', {
        params: { search: q, page_size: 10 },
      })
      setSkuResults(data?.items || [])
    } catch {
      setSkuResults([])
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-[calc(100vh-140px)]">
      <div className="space-y-4 flex flex-col h-full min-h-0">
        <div className="flex gap-2 items-center flex-shrink-0">
          <Button
            variant={searchMode === 'local' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('local')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'local' ? 'bg-green-500 hover:bg-green-600' : ''
            }
          >
            Л
          </Button>
          <Button
            variant={searchMode === 'remote' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('remote')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'remote' ? 'bg-red-500 hover:bg-red-600' : ''
            }
          >
            У
          </Button>
          <Button
            variant={searchMode === 'both' ? 'default' : 'outline'}
            size="default"
            onClick={() => {
              setSearchMode('both')
              setCandidates([])
              setDetails(null)
            }}
            className={
              searchMode === 'both' ? 'bg-orange-500 hover:bg-orange-600' : ''
            }
          >
            2
          </Button>
          <Input
            placeholder={t('tecdoc_manual_placeholder')}
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <Button onClick={doSearch} disabled={searching || !article.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        <Card className="overflow-hidden flex-1 min-h-0">
          <CardContent className="p-0 h-full overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium text-muted-foreground">
                    {t('products_brand')}
                  </th>
                  <th className="text-left p-2 font-medium text-muted-foreground">
                    {t('products_article')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.length > 0 ? (
                  candidates.map((c, i) => (
                    <tr
                      key={i}
                      className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${selectedCandidate?.brand === c.brand && selectedCandidate?.article === c.article ? 'bg-muted' : ''}`}
                      onClick={() => loadDetails(c)}
                    >
                      <td className="p-2 text-sm font-semibold">{c.brand}</td>
                      <td className="p-2 font-mono text-sm">{c.article}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={2}
                      className="p-6 text-center text-muted-foreground text-sm"
                    >
                      {t('tecdoc_manual_hint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 flex flex-col h-full min-h-0">
        {selectedCandidate ? (
          <Card className="flex-1 min-h-0 overflow-y-auto">
            <CardContent className="pt-6 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('tecdoc_manual_bind_title')}
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder={t('products_search')}
                    value={sku}
                    onChange={(e) => searchSku(e.target.value)}
                    className="text-xs"
                  />
                </div>
                {skuResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
                    {skuResults.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 hover:bg-muted/30 border-b last:border-0 text-xs cursor-pointer"
                        onClick={() => doBind(item.id)}
                      >
                        <span>
                          {item.article} · {item.brand || '—'} ·{' '}
                          {item.name || ''}
                        </span>
                        <Button size="sm" variant="outline" disabled={binding}>
                          {binding ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t('tecdoc_manual_bind')
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr />
              <div className="text-lg font-bold">
                {selectedCandidate.brand} · {selectedCandidate.article}
              </div>

              {details?.info?.text && (
                <div className="text-sm text-muted-foreground">
                  {details.info.text.substring(0, 300)}
                </div>
              )}

              {details?.images?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('tecdoc_manual_images')}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {details.images.map((img: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-sm">
                        {img.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {details?.crosses?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t('tecdoc_manual_crosses')} ({details.crosses.length})
                  </p>
                  <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
                    {details.crosses.map((c: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-sm">
                        {c.oem || c.article}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {details?.vehicles?.length > 0 &&
                (() => {
                  const vehicles = details.vehicles as any[]
                  const brands = [
                    ...new Set(
                      vehicles.map((v: any) => v.brand).filter(Boolean),
                    ),
                  ].sort()
                  const models = [
                    ...new Set(
                      vehicles
                        .filter(
                          (v: any) => !brandFilter || v.brand === brandFilter,
                        )
                        .map((v: any) => v.model)
                        .filter(Boolean),
                    ),
                  ].sort()
                  const filtered = vehicles.filter(
                    (v: any) =>
                      (!brandFilter || v.brand === brandFilter) &&
                      (!modelFilter || v.model === modelFilter),
                  )
                  return (
                    <div className="flex-1 flex flex-col min-h-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex-shrink-0">
                        {t('tecdoc_manual_vehicles')} ({filtered.length})
                      </p>
                      <div className="flex gap-2 mb-2 flex-shrink-0">
                        <Select
                          value={brandFilter}
                          onValueChange={(v) => {
                            setBrandFilter(v === 'all' ? '' : v)
                            setModelFilter('')
                          }}
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Марка" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            {brands.map((b: string) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={modelFilter}
                          onValueChange={(v) =>
                            setModelFilter(v === 'all' ? '' : v)
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Модель" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            {models.map((m: string) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 sticky top-0">
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Марка
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground">
                                Модель
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Модификация
                              </th>
                              <th className="text-left p-1.5 font-medium text-muted-foreground w-[150px]">
                                Годы
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((v: any, i: number) => (
                              <tr
                                key={i}
                                className="border-b last:border-0 hover:bg-muted/30"
                              >
                                <td className="p-1.5 font-semibold">
                                  {v.brand || '—'}
                                </td>
                                <td className="p-1.5 text-muted-foreground">
                                  {v.model || '—'}
                                </td>
                                <td className="p-1.5">{v.mod || '—'}</td>
                                <td className="p-1.5 text-muted-foreground text-sm">
                                  {v.years || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed flex-1 min-h-0">
            <CardContent className="pt-6 flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {t('tecdoc_manual_hint')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

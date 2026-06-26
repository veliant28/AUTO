'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import { useParts } from '@/hooks/usePartData'
import CatalogGrid from '@/components/features/CatalogGrid'
import CatalogPagination from '@/components/features/CatalogPagination'
import CatalogFilterDrawer from '@/components/features/CatalogFilterDrawer'
import { useCartStore } from '@/store/cartStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useVehicleStore } from '@/store/vehicleStore'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import {
  readCatalogReturnState,
  clearCatalogReturnState,
  restoreCatalogScroll,
} from '@/lib/catalog-navigation-state'

export default function CatalogPage() {
  const t = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const addItem = useCartStore((s) => s.addItem)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const favoriteArticles = useFavoritesStore((s) => s.articles)
  const modId = useVehicleStore((s) => s.modId)

  const page = parseInt(searchParams.get('page') || '1', 10)
  const categoryId = searchParams.get('categoryId')

  const [filters, setFilters] = useState({
    in_stock_only: false,
    min_price: '',
    max_price: '',
    sort_by: '',
    sort_order: 'asc',
  })
  const activeFilterCount = [
    filters.in_stock_only,
    filters.min_price,
    filters.max_price,
    filters.sort_by,
  ].filter(Boolean).length

  const { data, isLoading } = useParts(categoryId ?? '', {
    page,
    page_size: 24,
    in_stock_only: filters.in_stock_only || undefined,
    min_price: filters.min_price ? Number(filters.min_price) : undefined,
    max_price: filters.max_price ? Number(filters.max_price) : undefined,
    sort_by: filters.sort_by || undefined,
    sort_order: filters.sort_order,
    mod_id: modId,
  })

  const products = data?.items ?? []
  const total = data?.total ?? 0

  const clearFilters = useCallback(() => {
    setFilters({
      in_stock_only: false,
      min_price: '',
      max_price: '',
      sort_by: '',
      sort_order: 'asc',
    })
    toast.success(t('filters_reset'))
  }, [t])

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(newPage))
      router.push(`/catalog?${params.toString()}`, { scroll: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [router, searchParams],
  )

  const handleToggleFavorite = useCallback(
    async (article: string) => {
      const wasFav = favoriteArticles.includes(article)
      const product = products.find((p) => p.article === article)
      toggleFavorite(article)
      try {
        if (wasFav && product) {
          await api.delete(`/favorites/${product.id}`)
        } else if (product) {
          await api.post('/favorites/add', { part_id: product.id })
        }
      } catch {}
      toast.success(
        wasFav ? t('removed_from_favorites') : t('added_to_favorites'),
      )
    },
    [toggleFavorite, favoriteArticles, products, t],
  )

  const handleAddToCart = useCallback(
    (product: any) => {
      addItem({
        id: `cart-${product.article}-${Date.now()}`,
        part_id: product.id,
        article: product.article,
        part_name: product.name,
        quantity: 1,
        price: product.price,
        supplier_name: product.brand,
        brand: product.brand,
        image_url: product.image_url,
      })
      toast.success(t('added_to_cart'))
    },
    [addItem, t],
  )

  // Scroll restoration: on mount, check for saved scroll state
  useEffect(() => {
    const saved = readCatalogReturnState()
    if (saved) {
      clearCatalogReturnState()
      if (!isLoading) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            restoreCatalogScroll(saved)
          })
        })
      }
    }
  }, [isLoading])

  if (!categoryId) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-20 space-y-4">
          <p className="text-lg font-medium">{t('select_category')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <CatalogFilterDrawer
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        activeCount={activeFilterCount}
      />

      <CatalogGrid
        products={products.map((p: any) => ({
          ...p,
          isFavorite: favoriteArticles.includes(p.article),
        }))}
        isLoading={isLoading}
        onToggleFavorite={handleToggleFavorite}
        onAddToCart={handleAddToCart}
      />

      <CatalogPagination
        page={page}
        pageSize={24}
        total={total}
        onPageChange={handlePageChange}
      />
    </div>
  )
}

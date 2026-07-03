'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
} from '@/lib/types/nova-poshta'
import { novaPoshtaPublicApi } from '@/lib/api/nova-poshta-public'

interface UseNpSearchProps {
  prefix: string
  cityRef: string | null
  settlementRef: string | null
  locale?: string
}

export function useNovaPoshtaAddressSearch({
  prefix,
  cityRef,
  settlementRef,
  locale,
}: UseNpSearchProps) {
  const [cityQuery, setCityQuery] = useState('')
  const [warehouseQuery, setWarehouseQuery] = useState('')
  const [streetQuery, setStreetQuery] = useState('')

  /** Cities / settlements search */
  const settlementsQuery = useQuery({
    queryKey: [`${prefix}-np-cities`, cityQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchSettlements(cityQuery, locale || '')
        .then((r) => r.data as NovaPoshtaLookupSettlement[]),
    enabled: cityQuery.length >= 2,
    staleTime: 30000,
  })

  /** Warehouses / post offices search */
  const warehousesQuery = useQuery({
    queryKey: [`${prefix}-np-warehouses`, cityRef, warehouseQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchWarehouses(cityRef!, warehouseQuery, undefined, locale || '')
        .then((r) => r.data as NovaPoshtaLookupWarehouse[]),
    enabled: !!cityRef && warehouseQuery.length >= 1,
    staleTime: 30000,
  })

  /** Streets search (for courier delivery) */
  const streetsQuery = useQuery({
    queryKey: [`${prefix}-np-streets`, settlementRef, streetQuery, locale],
    queryFn: () =>
      novaPoshtaPublicApi
        .searchStreets(settlementRef!, streetQuery, locale || '')
        .then((r) => r.data as NovaPoshtaLookupStreet[]),
    enabled: !!settlementRef && streetQuery.length >= 2,
    staleTime: 30000,
  })

  return {
    cityQuery,
    setCityQuery,
    warehouseQuery,
    setWarehouseQuery,
    streetQuery,
    setStreetQuery,
    settlements: settlementsQuery.data ?? [],
    citiesLoading: settlementsQuery.isFetching,
    warehouses: warehousesQuery.data ?? [],
    warehousesLoading: warehousesQuery.isFetching,
    streets: streetsQuery.data ?? [],
    streetsLoading: streetsQuery.isFetching,
  }
}

/**
 * Public Nova Poshta API client (for storefront — checkout, etc.)
 * Uses the default sender profile configured in admin.
 */
import apiClient from '@/lib/api'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupStreet,
  NovaPoshtaLookupWarehouse,
} from '@/lib/types/nova-poshta'

export const novaPoshtaPublicApi = {
  searchSettlements: (query: string, locale?: string) =>
    apiClient.post<NovaPoshtaLookupSettlement[]>(
      '/nova-poshta/lookup/settlements',
      { query, locale },
    ),

  searchStreets: (settlementRef: string, query: string, locale?: string) =>
    apiClient.post<NovaPoshtaLookupStreet[]>('/nova-poshta/lookup/streets', {
      settlement_ref: settlementRef,
      query,
      locale,
    }),

  searchWarehouses: (
    cityRef: string,
    query: string,
    warehouseTypeRef?: string,
    locale?: string,
  ) =>
    apiClient.post<NovaPoshtaLookupWarehouse[]>(
      '/nova-poshta/lookup/warehouses',
      {
        city_ref: cityRef,
        query,
        warehouse_type_ref: warehouseTypeRef,
        locale,
      },
    ),
}

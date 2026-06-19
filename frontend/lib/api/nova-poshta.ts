/**
 * Nova Poshta API client functions.
 */
import apiClient from '@/lib/api';
import type {
  NovaPoshtaSenderProfile,
  NovaPoshtaSenderProfileCreate,
  NovaPoshtaSenderProfileUpdate,
  NovaPoshtaSenderProfileValidateResult,
  NovaPoshtaFetchFromTokenResult,
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupStreet,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupPackaging,
  NovaPoshtaLookupTimeInterval,
  NovaPoshtaLookupDeliveryDate,
  NovaPoshtaLookupCounterparty,
  NovaPoshtaCounterpartyDetails,
  OrderNovaPoshtaWaybillUpsert,
  OrderNovaPoshtaWaybillResponse,
  OrderNovaPoshtaWaybillDetailResponse,
  NovaPoshtaWaybillSummary,
  WaybillEventResponse,
  PrintResult,
  NovaPoshtaLookupQuery,
  NovaPoshtaStreetLookupQuery,
  NovaPoshtaWarehouseLookupQuery,
  NovaPoshtaCounterpartyLookupQuery,
  NovaPoshtaCounterpartyDetailsQuery,
  NovaPoshtaPackListLookupQuery,
  NovaPoshtaTimeIntervalsLookupQuery,
  NovaPoshtaDeliveryDateLookupQuery,
} from '@/lib/types/nova-poshta';

// ═══════════════════════════════════════════════════════════════════════════════
// Sender Profiles
// ═══════════════════════════════════════════════════════════════════════════════

export const novaPoshtaApi = {
  // ── Senders ────────────────────────────────────────────────────────────────
  listSenders: (includeInactive = false) =>
    apiClient.get<NovaPoshtaSenderProfile[]>('/admin/nova-poshta/senders', {
      params: { include_inactive: includeInactive },
    }),

  createSender: (data: NovaPoshtaSenderProfileCreate) =>
    apiClient.post<NovaPoshtaSenderProfile>('/admin/nova-poshta/senders', data),

  updateSender: (id: number, data: NovaPoshtaSenderProfileUpdate) =>
    apiClient.put<NovaPoshtaSenderProfile>(`/admin/nova-poshta/senders/${id}`, data),

  deleteSender: (id: number) =>
    apiClient.delete(`/admin/nova-poshta/senders/${id}`),

  validateSender: (id: number) =>
    apiClient.post<NovaPoshtaSenderProfileValidateResult>(
      `/admin/nova-poshta/senders/${id}/validate`
    ),

  fetchFromToken: (apiToken: string) =>
    apiClient.post<NovaPoshtaFetchFromTokenResult>(
      '/admin/nova-poshta/senders/fetch-from-token',
      { api_token: apiToken }
    ),

  // ── Lookups ────────────────────────────────────────────────────────────────
  searchSettlements: (data: NovaPoshtaLookupQuery) =>
    apiClient.post<NovaPoshtaLookupSettlement[]>('/admin/nova-poshta/lookup/settlements', data),

  searchStreets: (data: NovaPoshtaStreetLookupQuery) =>
    apiClient.post<NovaPoshtaLookupStreet[]>('/admin/nova-poshta/lookup/streets', data),

  searchWarehouses: (data: NovaPoshtaWarehouseLookupQuery) =>
    apiClient.post<NovaPoshtaLookupWarehouse[]>('/admin/nova-poshta/lookup/warehouses', data),

  listPackTypes: (data: NovaPoshtaPackListLookupQuery) =>
    apiClient.post<NovaPoshtaLookupPackaging[]>('/admin/nova-poshta/lookup/pack-types', data),

  getTimeIntervals: (data: NovaPoshtaTimeIntervalsLookupQuery) =>
    apiClient.post<NovaPoshtaLookupTimeInterval[]>('/admin/nova-poshta/lookup/time-intervals', data),

  getDeliveryDate: (data: NovaPoshtaDeliveryDateLookupQuery) =>
    apiClient.post<NovaPoshtaLookupDeliveryDate[]>('/admin/nova-poshta/lookup/delivery-date', data),

  searchCounterparties: (data: NovaPoshtaCounterpartyLookupQuery) =>
    apiClient.post<NovaPoshtaLookupCounterparty[]>('/admin/nova-poshta/lookup/counterparties', data),

  getCounterpartyDetails: (data: NovaPoshtaCounterpartyDetailsQuery) =>
    apiClient.post<NovaPoshtaCounterpartyDetails | null>('/admin/nova-poshta/lookup/counterparty-details', data),

  // ── Waybills ───────────────────────────────────────────────────────────────
  getOrderWaybillDetail: (orderId: number) =>
    apiClient.get<OrderNovaPoshtaWaybillDetailResponse>(
      `/admin/nova-poshta/orders/${orderId}/waybill`
    ),

  createWaybill: (orderId: number, data: OrderNovaPoshtaWaybillUpsert) =>
    apiClient.post<OrderNovaPoshtaWaybillResponse>(
      `/admin/nova-poshta/orders/${orderId}/waybill`,
      data
    ),

  updateWaybill: (waybillId: number, data: OrderNovaPoshtaWaybillUpsert) =>
    apiClient.put<OrderNovaPoshtaWaybillResponse>(
      `/admin/nova-poshta/waybills/${waybillId}`,
      data
    ),

  deleteWaybill: (waybillId: number) =>
    apiClient.delete(`/admin/nova-poshta/waybills/${waybillId}`),

  syncWaybillStatus: (waybillId: number) =>
    apiClient.post<OrderNovaPoshtaWaybillResponse>(
      `/admin/nova-poshta/waybills/${waybillId}/sync`
    ),

  syncOrderWaybillStatus: (orderId: number) =>
    apiClient.post<OrderNovaPoshtaWaybillDetailResponse>(
      `/admin/nova-poshta/orders/${orderId}/waybill/sync`
    ),

  printWaybill: (waybillId: number, documentType: 'html' | 'pdf' = 'html') =>
    apiClient.post<PrintResult>(
      `/admin/nova-poshta/waybills/${waybillId}/print`,
      null,
      { params: { document_type: documentType } }
    ),

  getWaybillEvents: (waybillId: number) =>
    apiClient.get<WaybillEventResponse[]>(`/admin/nova-poshta/waybills/${waybillId}/events`),

  getOrderWaybillSummary: (orderId: number) =>
    apiClient.get<NovaPoshtaWaybillSummary>(
      `/admin/nova-poshta/orders/${orderId}/waybill/summary`
    ),

  syncAllWaybills: (maxWaybills = 50) =>
    apiClient.post<{ message: string; synced_count: number }>(
      '/admin/nova-poshta/sync-all',
      null,
      { params: { max_waybills: maxWaybills } }
    ),
};

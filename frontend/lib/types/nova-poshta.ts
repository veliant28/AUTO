// ═══════════════════════════════════════════════════════════════════════════════
// Nova Poshta Integration Types
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Sender Profile ─────────────────────────────────────────────────────────

export interface NovaPoshtaSenderProfile {
  id: number;
  name: string;
  sender_type: 'private_person' | 'fop' | 'business';
  api_token_masked: string;
  counterparty_ref: string;
  contact_ref: string;
  address_ref: string;
  city_ref: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  email: string;
  contact_name: string;
  organization_name: string;
  edrpou: string;
  is_active: boolean;
  is_default: boolean;
  last_validated_at: string | null;
  last_validation_ok: boolean;
  last_validation_message: string;
  last_validation_payload: Record<string, any>;
  raw_meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface NovaPoshtaSenderProfileCreate {
  sender_type: 'private_person' | 'fop' | 'business';
  api_token: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  email?: string;
  organization_name?: string;
  edrpou?: string;
  name?: string;
  contact_name?: string;
  counterparty_ref?: string;
  contact_ref?: string;
  address_ref?: string;
  city_ref?: string;
  is_active?: boolean;
  is_default?: boolean;
  raw_meta?: Record<string, any>;
}

export interface NovaPoshtaSenderProfileUpdate {
  sender_type?: 'private_person' | 'fop' | 'business';
  api_token?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  email?: string;
  organization_name?: string;
  edrpou?: string;
  name?: string;
  contact_name?: string;
  counterparty_ref?: string;
  contact_ref?: string;
  address_ref?: string;
  city_ref?: string;
  is_active?: boolean;
  is_default?: boolean;
  raw_meta?: Record<string, any>;
}

export interface NovaPoshtaSenderProfileValidateResult {
  success: boolean;
  message: string;
  counterparty_ref?: string;
  contact_ref?: string;
  address_ref?: string;
  city_ref?: string;
}

export interface NovaPoshtaFetchFromTokenResult {
  success: boolean;
  message: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  email: string;
  counterparty_type: string; // "PrivatePerson" | "Organization"
  counterparty_ref: string;
  city_ref: string;
  edrpou: string;
  ownership_form_description: string;
  description: string; // Full name or company name from NP "Description"
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export interface NovaPoshtaLookupQuery {
  sender_profile_id?: number;
  query: string;
  locale?: string;
}

export interface NovaPoshtaStreetLookupQuery extends NovaPoshtaLookupQuery {
  settlement_ref: string;
}

export interface NovaPoshtaWarehouseLookupQuery extends NovaPoshtaLookupQuery {
  city_ref: string;
  warehouse_type_ref?: string;
}

export interface NovaPoshtaLookupSettlement {
  ref: string;
  delivery_city_ref: string;
  settlement_ref: string;
  label: string;
  main_description: string;
  area: string;
  region: string;
  address_delivery_allowed: boolean;
  streets_available: boolean;
  warehouses_count: string;
  locale: string;
}

export interface NovaPoshtaLookupStreet {
  settlement_ref: string;
  street_ref: string;
  label: string;
  street_name: string;
  street_type: string;
}

export interface NovaPoshtaLookupWarehouse {
  ref: string;
  number: string;
  city_ref: string;
  type: string;
  category: string;
  label: string;
  description: string;
  full_description: string;
  post_finance: boolean;
}

export interface NovaPoshtaLookupPackaging {
  ref: string;
  label: string;
  description: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
  cost: string;
}

export interface NovaPoshtaLookupTimeInterval {
  number: string;
  start: string;
  end: string;
  label: string;
}

export interface NovaPoshtaLookupDeliveryDate {
  date: string;
  raw_datetime: string;
}

export interface NovaPoshtaLookupCounterparty {
  ref: string;
  counterparty_ref: string;
  city_ref: string;
  city_label: string;
  label: string;
  full_name: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  address: string;
  edrpou: string;
  counterparty_type: string;
}

export interface NovaPoshtaCounterpartyDetails {
  contact_ref: string;
  contact_name: string;
  phone: string;
  city_ref: string;
  city_label: string;
  address_ref: string;
  address_label: string;
}

// ─── Waybill (TTN) ─────────────────────────────────────────────────────────

export interface WaybillSeatOptionPayload {
  description?: string;
  cost?: string;
  weight?: string;
  pack_ref?: string;
  pack_refs?: string[];
  volumetric_width?: string;
  volumetric_length?: string;
  volumetric_height?: string;
  volumetric_volume?: string;
  cargo_type?: string;
  special_cargo?: boolean;
}

export interface OrderNovaPoshtaWaybillUpsert {
  sender_profile_id: number;
  delivery_type: 'warehouse' | 'postomat' | 'address';
  payer_type?: 'Sender' | 'Recipient' | 'ThirdPerson';
  payment_method?: 'Cash' | 'NonCash';
  cargo_type?: 'Cargo' | 'Parcel' | 'Documents' | 'Pallet' | 'TiresWheels';
  description: string;

  recipient_city_ref: string;
  recipient_city_label: string;
  recipient_address_ref: string;
  recipient_address_label: string;
  recipient_counterparty_ref?: string;
  recipient_contact_ref?: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_street_ref?: string;
  recipient_street_label?: string;
  recipient_house?: string;
  recipient_apartment?: string;

  seats_amount?: number;
  weight: string;
  volume_general?: string;
  pack_ref?: string;
  pack_refs?: string[];
  volumetric_width?: string;
  volumetric_length?: string;
  volumetric_height?: string;
  cost: string;
  afterpayment_amount?: string;

  saturday_delivery?: boolean;
  local_express?: boolean;
  preferred_delivery_date?: string;
  time_interval?: string;
  info_reg_client_barcodes?: string;
  accompanying_documents?: string;
  red_box_barcode?: string;
  number_of_floors_lifting?: string;
  number_of_floors_descent?: string;
  forwarding_count?: string;
  delivery_by_hand?: boolean;
  delivery_by_hand_recipients?: string;
  special_cargo?: boolean;

  options_seat?: WaybillSeatOptionPayload[];
}

export interface WaybillSeatOption {
  description: string;
  cost: string;
  weight: string;
  pack_ref: string;
  pack_refs: string[];
  volumetric_width: string;
  volumetric_length: string;
  volumetric_height: string;
  volumetric_volume: string;
  cargo_type: string;
  special_cargo: boolean;
}

export interface StaffActor {
  user_id: number | null;
  full_name: string;
  role_code: string;
}

export interface WaybillTrackingEvent {
  id: number;
  event_type: string;
  status_code: string;
  status_text: string;
  location: string;
  warehouse: string;
  note: string;
  comment: string;
  event_at: string;
  synced_at: string;
}

export interface OrderNovaPoshtaWaybillResponse {
  id: number;
  order_id: number;
  sender_profile_id: number;
  sender_profile_name: string;
  sender_profile_type: string;
  np_ref: string;
  np_number: string;
  status_code: string;
  status_text: string;
  status_synced_at: string | null;
  payer_type: string;
  payment_method: string;
  service_type: string;
  cargo_type: string;
  cost: string;
  weight: string;
  seats_amount: number;
  afterpayment_amount: string | null;
  recipient_city_ref: string;
  recipient_city_label: string;
  recipient_address_ref: string;
  recipient_address_label: string;
  recipient_counterparty_ref: string;
  recipient_contact_ref: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_street_ref: string;
  recipient_street_label: string;
  recipient_house: string;
  recipient_apartment: string;
  description_snapshot: string;
  additional_information_snapshot: string;
  info_reg_client_barcodes?: string;
  saturday_delivery?: boolean;
  local_express?: boolean;
  delivery_by_hand?: boolean;
  delivery_by_hand_recipients?: string;
  special_cargo?: boolean;
  preferred_delivery_date?: string;
  time_interval?: string;
  accompanying_documents?: string;
  red_box_barcode?: string;
  number_of_floors_lifting?: string;
  number_of_floors_descent?: string;
  forwarding_count?: string;
  error_codes: string[];
  warning_codes: string[];
  info_codes: string[];
  can_edit: boolean;
  last_sync_error: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_by_id: number | null;
  updated_by_id: number | null;
  last_actor: StaffActor | null;
  created_at: string;
  updated_at: string;
  events_count: number;
  options_seat: WaybillSeatOption[];
  tracking_events: WaybillTrackingEvent[];
}

export interface NovaPoshtaWaybillSummary {
  exists: boolean;
  is_deleted: boolean;
  np_number: string;
  status_code: string;
  status_text: string;
  has_sync_error: boolean;
}

export interface OrderNovaPoshtaWaybillDetailResponse {
  waybill: OrderNovaPoshtaWaybillResponse | null;
  summary: NovaPoshtaWaybillSummary;
}

export interface WaybillEventResponse {
  id: number;
  waybill_id: number;
  event_type: string;
  message: string;
  status_code: string;
  status_text: string;
  payload: Record<string, any>;
  errors: string[];
  warnings: string[];
  info: string[];
  created_by_name: string;
  created_by_group: string;
  created_at: string;
}

export interface PrintResult {
  url: string;
  content_type: string;
}

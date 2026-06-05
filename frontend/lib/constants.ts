// Storage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  CART: 'cart-storage',
  AUTH: 'auth-storage',
  VEHICLE: 'vehicle-storage',
  LAST_ORDER_CHECK: 'lastOrderCheck',
} as const;

// Validation
export const PASSWORD_MIN_LENGTH = 6;

// Pagination
export const SEARCH_DEFAULT_LIMIT = 20;
export const AUTOCOMPLETE_LIMIT = 5;
export const APPLICABILITY_LIMIT = 100;
export const APPLICABILITY_PREVIEW = 5;

// UI Constants
export const VIRTUAL_LIST_HEIGHT = 600;
export const VIRTUAL_ROW_HEIGHT = 52;
export const CART_MAX_DISPLAY = 99;
export const TABLE_SKELETON_ROWS = 8;
export const SEARCH_SKELETON_ITEMS = 5;
export const SKELETON_COUNT = 3;

// API
export const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
export const DEFAULT_RETRY_COUNT = 1;

// Notifications
export const ORDER_POLL_INTERVAL = 60000; // 60 seconds

// Table column widths
export const COLUMN_WIDTHS = {
  ARTICLE: 140,
  NAME: 300,
  PRICE: 120,
  BRAND: 120,
  STATUS: 100,
  ACTION: 100,
} as const;

// Defaults
export const DEFAULT_CURRENCY = 'UAH';

// Order status labels
export const ORDER_STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ожидает', variant: 'secondary' },
  confirmed: { label: 'Подтвержден', variant: 'default' },
  processing: { label: 'В обработке', variant: 'default' },
  shipped: { label: 'Отправлен', variant: 'outline' },
  delivered: { label: 'Доставлен', variant: 'outline' },
  cancelled: { label: 'Отменен', variant: 'destructive' },
};

// User roles
export const USER_ROLES = ['retail', 'b2b', 'operator', 'manager', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];

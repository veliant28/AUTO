// Storage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  CART: 'cart-storage',
  AUTH: 'auth-storage',
  VEHICLE: 'vehicle-storage',
  LAST_ORDER_CHECK: 'lastOrderCheck',
  FAVORITES: 'favorites-storage',
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
export const ORDER_STATUS_LABELS: Record<string, { labelKey: string; className: string }> = {
  pending:    { labelKey: 'order_pending',     className: 'bg-gray-500 text-white' },
  confirmed:  { labelKey: 'order_confirmed',   className: 'bg-background text-foreground border' },
  processing: { labelKey: 'order_processing',  className: 'bg-blue-500 text-white' },
  shipped:    { labelKey: 'order_shipped',     className: 'bg-orange-500 text-white' },
  delivered:  { labelKey: 'order_delivered',   className: 'bg-green-500 text-white' },
  cancelled:  { labelKey: 'order_cancelled',   className: 'bg-red-500 text-white' },
};

// User roles
export const USER_ROLES = ['retail', 'b2b', 'operator', 'manager', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];

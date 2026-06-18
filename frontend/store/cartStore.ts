import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
export interface CartItem {
  id: string;
  part_id: number;
  article: string;
  part_name: string;
  quantity: number;
  price: number | null;
  supplier_name: string | null;
  brand: string | null;
  image_url?: string | null;
  sku?: string | null;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  replaceItems: (items: CartItem[]) => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const existing = get().items.find((i) => i.part_id === item.part_id);
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.part_id === item.part_id
                ? { ...i, quantity: i.quantity + item.quantity, sku: item.sku ?? i.sku }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, item] });
        }
      },

      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      replaceItems: (items) => set({ items }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () =>
        get().items.reduce(
          (sum, i) => sum + (i.price || 0) * i.quantity,
          0
        ),
    }),
    { name: STORAGE_KEYS.CART }
  )
);

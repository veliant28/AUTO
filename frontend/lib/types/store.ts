import { StateCreator } from 'zustand'

export interface CartItem {
  id: string
  article: string
  name: string
  price: number
  quantity: number
  currency?: string
}

export interface CartStore {
  items: CartItem[]
  total: number
  addItem: (item: Omit<CartItem, 'id'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
}

export interface AuthStore {
  isAuthenticated: boolean
  user: {
    id: number
    email: string
    role: string
    avatar_index: number
  } | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const createCartSlice: StateCreator<CartStore, [], [], CartStore> = (
  set,
  get
) => ({
  items: [],
  total: 0,
  addItem: (item) => {
    const items = get().items
    const existing = items.find(i => i.article === item.article)

    if (existing) {
      set({
        items: items.map(i =>
          i.article === item.article
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      })
    } else {
      set({
        items: [...items, { ...item, id: crypto.randomUUID() }]
      })
    }
  },
  removeItem: (id) => {
    set({ items: get().items.filter(i => i.id !== id) })
  },
  updateQuantity: (id, quantity) => {
    set({
      items: get().items.map(i =>
        i.id === id ? { ...i, quantity } : i
      )
    })
  },
  clearCart: () => set({ items: [], total: 0 })
})

export const createAuthSlice: StateCreator<AuthStore, [], [], AuthStore> = (
  set
) => ({
  isAuthenticated: false,
  user: null,
  login: async (email, password) => {
  },
  logout: () => set({ isAuthenticated: false, user: null })
})

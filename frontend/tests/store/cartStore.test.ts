import { useCartStore } from '@/store/cartStore'

const mockItem = {
  id: '1',
  part_id: 100,
  article: 'BR001',
  part_name: 'Brake Pad Set',
  quantity: 2,
  price: 1500,
  supplier_name: 'AutoParts Inc',
  brand: 'Bosch',
  image_url: null,
  sku: null,
}

beforeEach(() => {
  useCartStore.setState({ items: [] })
})

describe('CartStore', () => {
  it('starts empty', () => {
    const { items } = useCartStore.getState()
    expect(items).toEqual([])
  })

  it('adds an item', () => {
    useCartStore.getState().addItem(mockItem)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ part_id: 100, quantity: 2 })
  })

  it('increments quantity when adding duplicate part_id', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().addItem({ ...mockItem, id: '2' })
    const { items, totalItems } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(4)
    expect(totalItems()).toBe(4)
  })

  it('removes an item by id', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().removeItem('1')
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('updates quantity', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().updateQuantity('1', 5)
    expect(useCartStore.getState().items[0].quantity).toBe(5)
  })

  it('removes item when quantity <= 0', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().updateQuantity('1', 0)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('calculates totalPrice', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().addItem({
      ...mockItem,
      id: '2',
      part_id: 101,
      article: 'FL001',
      part_name: 'Oil Filter',
      quantity: 1,
      price: 500,
    })
    expect(useCartStore.getState().totalPrice()).toBe(3500)
  })

  it('clears cart', () => {
    useCartStore.getState().addItem(mockItem)
    useCartStore.getState().clearCart()
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('replaces all items', () => {
    useCartStore.getState().addItem(mockItem)
    const newItem = { ...mockItem, id: '3', part_id: 200, article: 'ALT001' }
    useCartStore.getState().replaceItems([newItem])
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].part_id).toBe(200)
  })
})

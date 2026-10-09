import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/store/authStore'
import OrderDetailModal from '@/app/(admin)/[locale]/admin/components/OrderDetailModal'

jest.mock('@/lib/api/payments', () => ({
  fetchPaymentMethods: jest.fn().mockResolvedValue({ methods: [] }),
}))

jest.mock('@/lib/api/nova-poshta-public', () => ({
  novaPoshtaPublicApi: {
    searchSettlements: jest.fn().mockResolvedValue({ data: [] }),
    searchWarehouses: jest.fn().mockResolvedValue({ data: [] }),
    searchStreets: jest.fn().mockResolvedValue({ data: [] }),
  },
}))

const ORDER = {
  id: 5,
  order_number: 'ORD-0000000005',
  user_id: 1,
  status: 'pending',
  total: 300,
  full_name: 'Иванов Иван',
  phone: '+380671112233',
  address: null,
  last_name: 'Иванов',
  first_name: 'Иван',
  middle_name: null,
  delivery_type: 'warehouse',
  delivery_city: 'Київ',
  delivery_warehouse: 'Відділення №1',
  delivery_city_ref: 'city-1',
  delivery_settlement_ref: 's1',
  delivery_city_label: 'м. Київ',
  delivery_warehouse_ref: 'w1',
  delivery_warehouse_label: 'Відділення №1',
  delivery_street_ref: null,
  delivery_street_label: null,
  delivery_house: null,
  delivery_apartment: null,
  promocode_code: null,
  discount_amount: 0,
  original_total: null,
  payment_method: 'cod',
  created_at: '2026-10-09T10:00:00',
  updated_by_name: null,
  updated_by_group: null,
  updated_at: null,
  user_success_index: 0,
  user_total_orders: 0,
  items: [
    {
      id: 11,
      part_id: 55,
      article: 'ART-EXIST',
      part_name: 'Existing part',
      brand: 'Bosch',
      quantity: 1,
      price: 300,
      sku: 'SKUEXIST',
      image_url: null,
      offers: [],
      supplier_name: null,
    },
  ],
}

const PRODUCT = {
  part_id: 101,
  article: 'ART-101',
  brand: 'Bosch',
  name: 'Bosch ART-101',
  sku: 'SKU101',
  image_url: null,
  price: 500,
  currency: 'UAH',
  quantity: 5,
  supplier_name: 'UTR',
  supplier_offer_id: 55,
}

const mockedApi = api as jest.Mocked<typeof api>

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <OrderDetailModal orderId={5} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

const setRole = (role: string) =>
  useAuthStore.setState({
    user: {
      id: 1,
      email: 'staff@example.com',
      role,
      permissions: [],
      full_name: null,
      first_name: null,
      avatar_index: null,
    },
    isAuthenticated: true,
  })

describe('Добавление товаров в существующий заказ', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('product-search')) {
        return Promise.resolve({ data: { items: [PRODUCT] } } as any)
      }
      if (/\/admin\/orders\/\d+$/.test(url)) {
        return Promise.resolve({ data: ORDER } as any)
      }
      return Promise.resolve({ data: {} } as any)
    })
    mockedApi.put.mockResolvedValue({
      data: { message: 'ok', changes: [] },
    } as any)
  })

  it('ищет товар в футере и отправляет add_items при сохранении', async () => {
    renderModal()

    expect(await screen.findByText('ORD-0000000005')).toBeInTheDocument()
    expect(screen.getByText('Existing part')).toBeInTheDocument()

    fireEvent.click(screen.getByText('edit_order'))

    const input = screen.getByPlaceholderText('order_search_placeholder')
    fireEvent.change(input, { target: { value: 'bosch 101' } })
    fireEvent.click(await screen.findByText('Bosch ART-101'))

    // Новая позиция появилась в списке и её количество можно менять
    expect(screen.getByText('SKU101')).toBeInTheDocument()

    fireEvent.click(screen.getByText('save'))

    await waitFor(() =>
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/admin/orders/5',
        expect.objectContaining({
          add_items: [{ part_id: 101, quantity: 1 }],
        }),
      ),
    )
  })

  const renderDeliveredOrder = () => {
    mockedApi.get.mockImplementation((url: string) =>
      /\/admin\/orders\/5$/.test(url)
        ? Promise.resolve({ data: { ...ORDER, status: 'delivered' } } as any)
        : Promise.resolve({ data: {} } as any),
    )
    renderModal()
  }

  it('не пускает менеджера в редактирование закрытого заказа', async () => {
    setRole('manager')
    renderDeliveredOrder()

    expect(await screen.findByText('ORD-0000000005')).toBeInTheDocument()
    fireEvent.click(screen.getByText('edit_order'))

    // Показали причину и не вошли в редактирование
    expect(toast.info).toHaveBeenCalledWith('edit_locked')
    expect(
      screen.queryByPlaceholderText('order_search_placeholder'),
    ).not.toBeInTheDocument()
  })

  it('администратор редактирует заказ в закрытом статусе', async () => {
    setRole('admin')
    renderDeliveredOrder()

    expect(await screen.findByText('ORD-0000000005')).toBeInTheDocument()
    fireEvent.click(screen.getByText('edit_order'))

    // Администратора пускаем: в футере появляется поиск товаров
    expect(
      await screen.findByPlaceholderText('order_search_placeholder'),
    ).toBeInTheDocument()
    expect(toast.info).not.toHaveBeenCalledWith('edit_locked')
  })

  it('применяет промокод в режиме редактирования', async () => {
    mockedApi.post.mockImplementation((url: string) =>
      url.includes('/loyalty/validate')
        ? Promise.resolve({
            data: { valid: true, discount_amount: 50, type: 'margin' },
          } as any)
        : Promise.resolve({ data: {} } as any),
    )
    renderModal()

    expect(await screen.findByText('ORD-0000000005')).toBeInTheDocument()
    fireEvent.click(screen.getByText('edit_order'))

    const promoInput = screen.getByPlaceholderText('promocode_placeholder')
    fireEvent.change(promoInput, { target: { value: 'PROMO12345' } })
    fireEvent.click(promoInput.parentElement!.querySelector('button')!)

    await waitFor(() =>
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/admin/orders/5',
        expect.objectContaining({
          promocode_code: 'PROMO12345',
          discount_amount: 50,
          total: 250,
        }),
      ),
    )
  })
})

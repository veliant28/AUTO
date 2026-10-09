import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import OrderDetailModal from '@/app/(admin)/[locale]/admin/components/OrderDetailModal'

jest.mock('@/lib/api/payments', () => ({
  fetchPaymentMethods: jest.fn().mockResolvedValue({
    methods: [
      { code: 'cod', name: 'COD', enabled: true },
      { code: 'monobank', name: 'Monobank', enabled: true },
      { code: 'liqpay', name: 'LiqPay', enabled: false },
    ],
  }),
}))

jest.mock('@/lib/api/nova-poshta-public', () => ({
  novaPoshtaPublicApi: {
    searchSettlements: jest.fn().mockResolvedValue({
      data: [
        {
          ref: 'city-ref-1',
          delivery_city_ref: 'city-ref-1',
          settlement_ref: 'settlement-ref-1',
          label: 'м. Київ, Київська обл.',
          area: 'Київська',
          region: 'Київська обл.',
          warehouses_count: '12',
        },
      ],
    }),
    searchWarehouses: jest.fn().mockResolvedValue({
      data: [
        {
          ref: 'wh-19',
          number: '19',
          city_ref: 'city-ref-1',
          type: 'Warehouse',
          label: 'Відділення №19: вул. Хрещатик, 1',
          description: 'вул. Хрещатик, 1',
        },
      ],
    }),
    searchStreets: jest.fn().mockResolvedValue({ data: [] }),
  },
}))

const mockedApi = api as jest.Mocked<typeof api>
const mockedToast = toast as jest.Mocked<typeof toast>

const PRODUCT_SECOND = {
  part_id: 102,
  article: 'ART-102',
  brand: 'Siemens',
  name: 'Siemens ART-102',
  sku: 'SKU102',
  image_url: null,
  price: 500,
  currency: 'UAH',
  quantity: 1,
  supplier_name: 'GPL',
  supplier_offer_id: 56,
}

const PRODUCT = {
  part_id: 101,
  article: 'ART-101',
  brand: 'Bosch',
  name: 'Bosch ART-101',
  sku: 'SKU101',
  image_url: null,
  price: 300,
  currency: 'UAH',
  quantity: 5,
  supplier_name: 'UTR',
  supplier_offer_id: 55,
}

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <OrderDetailModal
        createMode
        orderId={null}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('OrderDetailModal в режиме создания заказа', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('product-search')) {
        return Promise.resolve({
          data: { items: [PRODUCT, PRODUCT_SECOND] },
        } as any)
      }
      return Promise.resolve({ data: {} } as any)
    })
  })

  it('рендерится без падения: шапка, поиск, получатель и плитки оплаты', async () => {
    renderModal()

    expect(await screen.findByText('new_order')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('order_search_placeholder'),
    ).toBeInTheDocument()
    // Обязательные поля получателя помечены звёздочкой, поле телефона пустое, но не падает
    expect(screen.getByText(/phone_label/)).toBeInTheDocument()
    expect(screen.getByText(/last_name/)).toBeInTheDocument()
    expect(screen.getByText(/first_name/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('+38 (0XX) XXX-XX-XX')).toHaveValue('')

    await waitFor(() =>
      expect(screen.getByText('payment_cod')).toBeInTheDocument(),
    )
    expect(screen.getByText('payment_monobank')).toBeInTheDocument()
    // Выключенные способы оплаты не показываем
    expect(screen.queryByText('payment_liqpay')).not.toBeInTheDocument()
  })

  it('добавляет товар из выпадающего списка и считает сумму', async () => {
    renderModal()
    const input = screen.getByPlaceholderText('order_search_placeholder')

    fireEvent.change(input, { target: { value: 'bosch ART-101' } })
    const option = await screen.findByText('Bosch ART-101')
    fireEvent.click(option)

    await waitFor(() => expect(screen.getByText('SKU101')).toBeInTheDocument())
    expect(input).toHaveValue('')
    // Сумма позиции и итог заказа
    await waitFor(() =>
      expect(screen.getAllByText('300 ₴').length).toBeGreaterThanOrEqual(2),
    )
    expect(mockedApi.get).toHaveBeenCalledWith(
      '/admin/orders/product-search',
      expect.objectContaining({
        params: expect.objectContaining({ q: 'bosch ART-101' }),
      }),
    )
  })

  it('не отправляет заказ без товаров', async () => {
    renderModal()
    fireEvent.click(await screen.findByText('create'))

    expect(mockedToast.error).toHaveBeenCalledWith('items_required')
    expect(mockedApi.post).not.toHaveBeenCalled()
  })

  it('выбирает товар клавиатурой: подсветка двигается, Enter добавляет', async () => {
    renderModal()
    const input = screen.getByPlaceholderText('order_search_placeholder')
    fireEvent.change(input, { target: { value: 'bosch 123' } })
    await screen.findByText('Bosch ART-101')

    // По умолчанию подсвечен первый пункт, стрелка вниз — второй, ещё одна — снова первый
    expect(document.querySelector('[data-index="0"]')?.className).toContain(
      'bg-accent',
    )
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.querySelector('[data-index="1"]')?.className).toContain(
      'bg-accent',
    )
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(document.querySelector('[data-index="0"]')?.className).toContain(
      'bg-accent',
    )

    // Enter добавляет подсвеченный товар в заказ
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('SKU101')).toBeInTheDocument())
  })

  it('проверяет промокод вместе с телефоном получателя', async () => {
    mockedApi.post.mockImplementation((url: string) => {
      if (url.includes('/loyalty/validate')) {
        return Promise.resolve({
          data: { valid: true, discount_amount: 100, type: 'margin' },
        } as any)
      }
      return Promise.resolve({ data: {} } as any)
    })
    renderModal()

    // Телефон получателя — по нему бэкенд понимает, кому выдан код
    fireEvent.change(screen.getByPlaceholderText('+38 (0XX) XXX-XX-XX'), {
      target: { value: '+380671112233' },
    })

    const promoInput = screen.getByPlaceholderText('promocode_placeholder')
    fireEvent.change(promoInput, { target: { value: 'PROMO12345' } })
    fireEvent.click(promoInput.parentElement!.querySelector('button')!)

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/loyalty/validate',
        expect.objectContaining({
          code: 'PROMO12345',
          phone: '+380671112233',
        }),
      ),
    )
  })

  it('ищет город и отделения Новой Почты как на витрине', async () => {
    renderModal()

    // Выбираем доставку в отделение
    fireEvent.click(document.getElementById('dw') as HTMLElement)

    const cityInput = await screen.findByPlaceholderText('city')
    fireEvent.change(cityInput, { target: { value: 'Київ' } })

    // Список городов рендерится в портал (popover) и не обрезается колонкой
    expect(
      await screen.findByText('м. Київ, Київська обл.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('м. Київ, Київська обл.'))

    const warehouseInput = screen.getByPlaceholderText('warehouse')
    fireEvent.change(warehouseInput, { target: { value: '19' } })

    // Отображение пункта — как на витрине: бейдж номера и адрес
    expect(await screen.findByText('№19')).toBeInTheDocument()
    expect(screen.getByText('вул. Хрещатик, 1')).toBeInTheDocument()
  })
})

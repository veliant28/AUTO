import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import api from '@/lib/api'
import OrderDetailModal from '@/app/(admin)/[locale]/admin/components/OrderDetailModal'

// Глобальный setup подменяет toast заглушкой — здесь нужен настоящий,
// чтобы проверить, что тосты реально рендерятся в режиме создания
jest.unmock('@/lib/toast')

jest.mock('@/lib/api/payments', () => ({
  fetchPaymentMethods: jest.fn().mockResolvedValue({
    methods: [{ code: 'cod', name: 'COD', enabled: true }],
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
          label: 'м. Київ',
          area: 'Київська',
          region: 'Київська обл.',
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
      <Toaster />
      <OrderDetailModal
        createMode
        orderId={null}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('Тосты в режиме создания заказа', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('product-search')) {
        return Promise.resolve({ data: { items: [PRODUCT] } } as any)
      }
      return Promise.resolve({ data: {} } as any)
    })
  })

  it('валидация показывает тост, если товары не добавлены', async () => {
    renderModal()
    fireEvent.click(await screen.findByText('create'))

    expect(await screen.findByText('items_required')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-sonner-toast]').length).toBe(1)
  })

  it('валидация показывает тост по обязательной фамилии', async () => {
    renderModal()
    // Добавляем товар, чтобы дойти до проверки получателя
    const input = screen.getByPlaceholderText('order_search_placeholder')
    fireEvent.change(input, { target: { value: 'bosch 123' } })
    fireEvent.click(await screen.findByText('Bosch ART-101'))

    fireEvent.click(screen.getByText('create'))

    expect(await screen.findByText('last_name_required')).toBeInTheDocument()
  })

  it('без выбранного способа доставки заказ не создаётся', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('order_search_placeholder'), {
      target: { value: 'bosch 123' },
    })
    fireEvent.click(await screen.findByText('Bosch ART-101'))

    fireEvent.change(screen.getByPlaceholderText('+38 (0XX) XXX-XX-XX'), {
      target: { value: '+380671112233' },
    })
    const nameInputs = Array.from(document.querySelectorAll('input')).filter(
      (node) => !node.placeholder,
    )
    fireEvent.change(nameInputs[0], { target: { value: 'Тестовий' } })
    fireEvent.change(nameInputs[1], { target: { value: 'Тест' } })

    // Способ доставки не выбран и поле города не показывается
    expect(screen.queryByPlaceholderText('city')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('create'))

    expect(await screen.findByText('delivery_required')).toBeInTheDocument()
    expect(mockedApi.post).not.toHaveBeenCalled()
  })

  it('без выбранного способа оплаты заказ не создаётся', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('order_search_placeholder'), {
      target: { value: 'bosch 123' },
    })
    fireEvent.click(await screen.findByText('Bosch ART-101'))

    fireEvent.change(screen.getByPlaceholderText('+38 (0XX) XXX-XX-XX'), {
      target: { value: '+380671112233' },
    })
    const nameInputs = Array.from(document.querySelectorAll('input')).filter(
      (node) => !node.placeholder,
    )
    fireEvent.change(nameInputs[0], { target: { value: 'Тестовий' } })
    fireEvent.change(nameInputs[1], { target: { value: 'Тест' } })

    // Доставку заполняем, оплату — нет
    fireEvent.click(document.getElementById('dw') as HTMLElement)
    fireEvent.change(screen.getByPlaceholderText('city'), {
      target: { value: 'Київ' },
    })
    fireEvent.click(await screen.findByText('м. Київ'))
    fireEvent.change(screen.getByPlaceholderText('warehouse'), {
      target: { value: '19' },
    })
    fireEvent.click(await screen.findByText('Відділення №19'))

    fireEvent.click(screen.getByText('create'))

    expect(await screen.findByText('payment_required')).toBeInTheDocument()
    expect(mockedApi.post).not.toHaveBeenCalled()
  })

  it('успешное создание показывает тост и закрывает модалку', async () => {
    const onOpenChange = jest.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <Toaster />
        <OrderDetailModal
          createMode
          orderId={null}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    )

    // Товар
    fireEvent.change(screen.getByPlaceholderText('order_search_placeholder'), {
      target: { value: 'bosch 123' },
    })
    fireEvent.click(await screen.findByText('Bosch ART-101'))

    // Получатель: телефон + фамилия + имя (остальные поля не обязательны)
    fireEvent.change(screen.getByPlaceholderText('+38 (0XX) XXX-XX-XX'), {
      target: { value: '+380671112233' },
    })
    const nameInputs = Array.from(document.querySelectorAll('input')).filter(
      (node) => !node.placeholder,
    )
    fireEvent.change(nameInputs[0], { target: { value: 'Тестовий' } })
    fireEvent.change(nameInputs[1], { target: { value: 'Тест' } })

    // Оплата выбирается вручную (автовыбора нет)
    fireEvent.click(document.getElementById('order-pay-cod') as HTMLElement)

    // Доставка в отделение: способ + город + отделение НП
    fireEvent.click(document.getElementById('dw') as HTMLElement)
    fireEvent.change(screen.getByPlaceholderText('city'), {
      target: { value: 'Київ' },
    })
    fireEvent.click(await screen.findByText('м. Київ'))
    fireEvent.change(screen.getByPlaceholderText('warehouse'), {
      target: { value: '19' },
    })
    fireEvent.click(await screen.findByText('Відділення №19'))

    mockedApi.post.mockResolvedValueOnce({ data: { id: 777 } } as any)

    fireEvent.click(screen.getByText('create'))

    expect(await screen.findByText('order_created')).toBeInTheDocument()
    // Модалка закрывается сама и не открывает созданный заказ
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/admin/orders',
      expect.objectContaining({
        last_name: 'Тестовий',
        first_name: 'Тест',
        phone: '+380671112233',
        delivery_type: 'warehouse',
        delivery_city_ref: 'city-ref-1',
        delivery_warehouse_ref: 'wh-19',
        payment_method: 'cod',
        items: [{ part_id: 101, quantity: 1 }],
      }),
    )
  })
})

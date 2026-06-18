import { Page } from '@playwright/test';

const API = 'http://localhost:8000/api/v1';

export function mockApi(page: Page) {
  const mocks = [
    { url: `${API}/categories/header*`, body: CATEGORIES },
    { url: `${API}/footer*`, body: FOOTER },
    { url: `${API}/settings`, body: SETTINGS },
    { url: `${API}/catalog/search/autocomplete*`, body: AUTOCOMPLETE },
    { url: `${API}/catalog/search*`, body: SEARCH_RESULTS },
    { url: `${API}/catalog/makes`, body: [{ id: 1, name: 'Toyota' }] },
    { url: `${API}/catalog/vehicle/years*`, body: [{ year: 2020 }, { year: 2021 }] },
    { url: `${API}/catalog/vehicle/makes*`, body: [{ id: 1, name: 'Toyota' }] },
    { url: `${API}/catalog/vehicle/models*`, body: [{ id: 10, name: 'Camry' }] },
    { url: `${API}/catalog/vehicle/cars*`, body: [{ id: 100, name: '2.0', year_from: 2020, year_to: 2023 }] },
    { url: `${API}/users/me`, body: { id: 1, email: 'test@test.com', full_name: 'Test', role: 'retail' } },
    { url: `${API}/users/garage`, body: [] },
    { url: `${API}/orders*`, body: [] },
    { url: `${API}/fav*`, body: [] },
  ];
  for (const m of mocks) {
    page.route(m.url, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: m.body });
    });
  }
}

export async function loginUser(page: Page, email = 'test@example.com', password = 'password123') {
  page.route(`${API}/auth/login`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      json: { access_token: 'fake-jwt-token', token_type: 'bearer', user_id: 1, role: 'retail', avatar_index: null },
    });
  });
  mockApi(page);
  await page.goto('/ru/auth/login');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/ru', { timeout: 15000 });
}

const CATEGORIES = {
  categories: [{
    id: 1, name: 'Запчасти', name_ru: 'Запчасти',
    groups: [{
      name: 'Тормозная система', name_ru: 'Тормозная система',
      children: [
        { id: 10, name: 'Тормозные колодки', name_ru: 'Тормозные колодки', product_count: 50 },
      ],
    }],
  }],
  zapchasti_dlya_to: [],
};

const FOOTER = {
  locale: 'ru',
  data: {
    description: 'Крупнейший интернет-магазин автозапчастей',
    company_title: 'Компания',
    about: 'О нас',
    contacts: 'Контакты',
    delivery: 'Доставка',
    help_title: 'Помощь',
    faq: 'FAQ',
    support: 'Поддержка',
    terms: 'Условия',
    admin_panel: 'Админ-панель',
  },
};

const SETTINGS = { brand_name: 'SVOM', timezone: 'Europe/Kyiv' };

const SEARCH_RESULTS = [
  { id: 1, article: 'BR001', name: 'Тормозные колодки', brand: 'Bosch', price: 1500, quantity: 10, supplier_name: 'АвтоСклад', currency: 'UAH', image_url: null },
  { id: 2, article: 'BR002', name: 'Тормозные диски', brand: 'Bosch', price: 3200, quantity: 5, supplier_name: 'АвтоСклад', currency: 'UAH', image_url: null },
];

const AUTOCOMPLETE = [
  { id: 1, label: 'BR001 — Тормозные колодки [Bosch]', article: 'BR001' },
  { id: 2, label: 'BR002 — Тормозные диски [Bosch]', article: 'BR002' },
];

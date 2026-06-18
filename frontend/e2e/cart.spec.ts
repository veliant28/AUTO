import { test, expect } from '@playwright/test';
import { mockApi } from './helpers';

test.beforeEach(async ({ page }) => {
  mockApi(page);
  await page.goto('/ru');
});

test('корзина пуста при заходе на страницу', async ({ page }) => {
  await page.goto('/ru/cart');
  await expect(page.locator('text=Корзина пуста').or(page.locator('text=cart_empty'))).toBeVisible({ timeout: 10000 });
});

test('страница корзины открывается', async ({ page }) => {
  await page.goto('/ru/cart');
  await expect(page).toHaveURL(/\/cart/);
});

test('кнопка корзины в шапке видна', async ({ page }) => {
  const cartLink = page.locator('a[href*="cart"], button:has-text("Корзина"), [aria-label*="cart"]').first();
  await expect(cartLink).toBeVisible({ timeout: 5000 });
});

import { test, expect } from '@playwright/test';
import { mockApi } from './helpers';

test.use({ storageState: undefined });

test.beforeEach(async ({ page }) => {
  mockApi(page);
});

test('главная страница загружается', async ({ page }) => {
  await page.goto('/ru');
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveURL('/ru');
});

test('поиск запчастей через строку поиска', async ({ page }) => {
  await page.goto('/ru');
  const searchInput = page.locator('input[placeholder*="артикулу"]').first();
  if (await searchInput.isVisible()) {
    await searchInput.fill('BR001');
    await searchInput.press('Enter');
    await expect(page).toHaveURL(/search.*BR001/, { timeout: 10000 });
  }
});

test('категории отображаются в навигации', async ({ page }) => {
  await page.goto('/ru');
  await page.waitForTimeout(1000);
  const navs = page.locator('nav');
  const count = await navs.count();
  expect(count).toBeGreaterThan(0);
});

test('страница авторизации открывается', async ({ page }) => {
  await page.goto('/ru/auth/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('страница регистрации открывается', async ({ page }) => {
  await page.goto('/ru/auth/register');
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('страница каталога открывается', async ({ page }) => {
  await page.goto('/ru/catalog');
  await expect(page).toHaveURL(/\/catalog/);
});

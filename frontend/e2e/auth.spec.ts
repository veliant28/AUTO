import { test, expect } from '@playwright/test';
import { mockApi } from './helpers';

test.beforeEach(async ({ page }) => {
  mockApi(page);
});

test('регистрация — форма отображается', async ({ page }) => {
  await page.goto('/ru/auth/register');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('восстановление пароля — форма отображается', async ({ page }) => {
  await page.goto('/ru/auth/forgot-password');
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test('вход — форма заполняется и отправляется', async ({ page }) => {
  await page.route('http://localhost:8000/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      json: { access_token: 'token', token_type: 'bearer', user_id: 1, role: 'retail', avatar_index: null },
    });
  });
  mockApi(page);
  await page.goto('/ru/auth/login');
  await page.waitForSelector('form', { timeout: 10000 });
  await page.locator('form input[type="email"]').fill('test@example.com');
  await page.locator('form input[type="password"]').fill('password123');
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  await expect(page.locator('form')).toBeVisible({ timeout: 5000 });
});

test('страница профиля открывается', async ({ page }) => {
  mockApi(page);
  await page.goto('/ru/profile');
  await expect(page).toHaveURL(/\/profile/);
});

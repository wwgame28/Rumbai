import { expect, open, test } from './helpers.ts';

test('the app shell works offline after the service worker takes control', async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit installs the worker; a reload puts the page under its control.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Visit lazily loaded screens once so their chunks are cached.
  for (const r of ['tasks', 'notes', 'settings']) await open(page, r);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main .screen').first()).toBeVisible();
  await expect(page.getByText('Нет сети.', { exact: false })).toBeVisible();

  await open(page, 'tasks');
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  await page.getByLabel('Название').fill('Создана офлайн');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать задачу' }).click();
  await expect(page.getByText('Создана офлайн')).toBeVisible();

  await open(page, 'models');
  await expect(page.getByText('Оболочка приложения закэширована')).toBeVisible();
  await context.setOffline(false);
});

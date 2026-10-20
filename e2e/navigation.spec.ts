import { expect, noHorizontalOverflow, open, test } from './helpers.ts';

const SCREENS: Array<[string, RegExp]> = [
  ['home', /Добр(ое|ый|ой)/],
  ['assistant', /Новый разговор/],
  ['tasks', /Задачи/],
  ['notes', /Заметки/],
  ['knowledge', /Знания/],
  ['files', /Файлы/],
  ['automations', /Автоматизации/],
  ['models', /Локальный ИИ/],
  ['settings', /Настройки/],
];

test('every screen renders at the iPhone 16 Pro Max width without horizontal overflow', async ({ page }) => {
  for (const [route, heading] of SCREENS) {
    await open(page, route);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
    await noHorizontalOverflow(page);
  }
});

test('bottom navigation and the "More" sheet', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Задачи' }).click();
  await expect(page).toHaveURL(/#\/tasks/);
  await expect(nav.getByRole('button', { name: 'Задачи' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('button', { name: 'Ещё' }).click();
  const sheet = page.getByRole('dialog', { name: 'Разделы' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Настройки' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/settings/);
});

test('touch targets in the tab bar are at least 44×44', async ({ page }) => {
  await open(page);
  for (const b of await page.locator('.tabbar button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('landscape switches to a side rail', async ({ page }) => {
  await page.setViewportSize({ width: 956, height: 440 });
  await open(page, 'tasks');
  await expect(page.locator('nav.rail')).toBeVisible();
  const rail = (await page.locator('nav.rail').boundingBox())!;
  expect(rail.width).toBeLessThan(120);
  await expect(page.locator('.tabbar')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('dashboard shows honest AI and storage status', async ({ page }) => {
  await open(page);
  // Headless Chromium has no WebGPU and the test server has no API key.
  await expect(page.getByText('Недоступно: нет WebGPU')).toBeVisible();
  await expect(page.getByText('Не настроен на сервере')).toBeVisible();
  await expect(page.getByText('IndexedDB на устройстве')).toBeVisible();
});

test('dashboard widgets can be hidden and reordered', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Настроить главный экран' }).click();
  const sheet = page.getByRole('dialog', { name: 'Главный экран' });
  await sheet.getByRole('switch', { name: 'Показывать «Быстрые действия»' }).click();
  await sheet.getByRole('button', { name: 'Переместить «Последние действия» выше' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Быстрые действия' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('main .screen').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Быстрые действия' })).toHaveCount(0);
});

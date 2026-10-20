import { expect, open, test } from './helpers.ts';
import type { Page } from '@playwright/test';

async function createTask(page: Page, title: string, opts: { today?: boolean; priority?: string } = {}) {
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Новая задача' });
  await sheet.getByLabel('Название').fill(title);
  if (opts.priority) await sheet.getByRole('radio', { name: opts.priority }).click();
  if (opts.today) await sheet.getByRole('button', { name: 'Сегодня' }).click();
  await sheet.getByRole('button', { name: 'Создать задачу' }).click();
  await expect(sheet).toBeHidden();
}

test('create, complete with undo, edit, delete and persist tasks', async ({ page }) => {
  await open(page, 'tasks');
  await createTask(page, 'Позвонить в банк', { today: true, priority: 'Высокий' });
  await createTask(page, 'Купить продукты');

  const list = page.getByRole('list', { name: 'Список задач' });
  await expect(list.getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByText('Выполнено 0 · осталось 1')).toBeVisible();

  // Today filter
  await page.getByRole('radio', { name: 'Сегодня' }).click();
  await expect(list.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Открытые' }).click();

  // Complete, then undo from the toast
  await page.getByRole('checkbox', { name: 'Выполнить задачу «Позвонить в банк»' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Готово: «Позвонить в банк»' })).toBeVisible();
  await expect(list.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(list.getByTestId('task-row')).toHaveCount(2);

  // Complete for real and find it under "Готово"
  await page.getByRole('checkbox', { name: 'Выполнить задачу «Позвонить в банк»' }).click();
  await page.getByRole('radio', { name: 'Готово' }).click();
  await expect(page.getByRole('checkbox', { name: 'Вернуть задачу «Позвонить в банк»' })).toBeChecked();

  // Search
  await page.getByRole('radio', { name: 'Открытые' }).click();
  await page.getByRole('searchbox', { name: 'Поиск задач' }).fill('продукт');
  await expect(list.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Поиск задач' }).fill('');

  // Edit
  await page.getByRole('button', { name: /Купить продукты/ }).click();
  const editor = page.getByRole('dialog', { name: 'Задача' });
  await editor.getByLabel('Название').fill('Купить продукты на неделю');
  await editor.getByRole('button', { name: 'Сохранить' }).click();
  // The list updates instantly, but the sheet closes only after IndexedDB commits.
  // Reloading before that would abort the write, so wait like a user would.
  await expect(editor).toBeHidden();
  await expect(page.getByText('Купить продукты на неделю')).toBeVisible();

  // Persist across reload
  await page.reload();
  await expect(page.locator('main .screen').first()).toBeVisible();
  await expect(page.getByText('Купить продукты на неделю')).toBeVisible();

  // Delete with confirmation
  await page.getByRole('button', { name: /Купить продукты на неделю/ }).click();
  await page.getByRole('button', { name: 'Удалить задачу' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Удалить задачу?' });
  await confirm.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText('Купить продукты на неделю')).toHaveCount(0);
});

test('sorting by priority', async ({ page }) => {
  await open(page, 'tasks');
  await createTask(page, 'Низкая', { priority: 'Низкий' });
  await createTask(page, 'Высокая', { priority: 'Высокий' });
  await page.getByRole('combobox').selectOption('priority');
  const titles = await page.locator('.task-title').allTextContents();
  expect(titles).toEqual(['Высокая', 'Низкая']);
});

test('quick action on the dashboard opens the task editor', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Новая задача' }).click();
  await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
});

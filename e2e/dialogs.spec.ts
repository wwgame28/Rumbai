import { expect, open, test } from './helpers.ts';

test('sheets trap focus, close on Escape and restore focus', async ({ page }) => {
  await open(page, 'tasks');
  const fab = page.getByRole('button', { name: 'Задача', exact: true });
  await fab.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Новая задача' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Название')).toBeFocused();
  // Tab many times: focus must stay inside the sheet.
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(fab).toBeFocused();
});

test('keyboard-only task creation', async ({ page }) => {
  await open(page, 'tasks');
  await page.getByRole('button', { name: 'Задача', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Задача с клавиатуры');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Задача с клавиатуры')).toBeVisible();
});

test('deleting all data requires typing the confirmation word', async ({ page }) => {
  await open(page, 'tasks');
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  await page.getByLabel('Название').fill('Важная задача');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать задачу' }).click();

  await open(page, 'settings');
  await page.getByRole('button', { name: 'Удалить', exact: true }).last().click();
  const dialog = page.getByRole('alertdialog', { name: 'Удалить все данные RUMBAI?' });
  const confirm = dialog.getByRole('button', { name: 'Удалить всё' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill('удалить');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill('УДАЛИТЬ');
  await confirm.click();
  await expect(page).toHaveURL(/#\/home/);
  await open(page, 'tasks');
  await expect(page.getByText('Важная задача')).toHaveCount(0);
});

test('export downloads all data as JSON', async ({ page }) => {
  await open(page, 'tasks');
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  await page.getByLabel('Название').fill('Экспортируемая задача');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать задачу' }).click();
  await open(page, 'settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^rumbai-export-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(json.app).toBe('RUMBAI');
  expect(json.tasks.map((t: { title: string }) => t.title)).toContain('Экспортируемая задача');
});

test('theme and motion preferences apply to the document', async ({ page }) => {
  await open(page, 'settings');
  await page.getByRole('radiogroup', { name: 'Тема' }).getByRole('radio', { name: 'Светлая' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radiogroup', { name: 'Анимации' }).getByRole('radio', { name: 'Минимум' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('app works with the OS reduced-motion setting', async ({ page }) => {
    await open(page, 'tasks');
    await page.getByRole('button', { name: 'Задача', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

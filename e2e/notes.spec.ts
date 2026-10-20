import { expect, open, test } from './helpers.ts';

test('notes autosave, search, categories, pinning, export and delete', async ({ page }) => {
  await open(page, 'notes');
  await page.getByRole('button', { name: 'Заметка', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Новая заметка' });
  await editor.getByLabel('Заголовок').fill('Встреча с командой');
  await editor.getByLabel('Категория').fill('Работа');
  await editor.getByLabel('Теги').fill('встречи, план');
  await editor.getByLabel('Текст заметки').fill('Обсудить **бюджет** и сроки релиза.');
  await expect(editor.getByRole('status')).toHaveText(/Сохранено/);

  // Markdown preview is sanitized HTML
  await editor.getByRole('button', { name: 'Предпросмотр' }).click();
  await expect(editor.locator('.md strong')).toHaveText('бюджет');
  await editor.getByRole('button', { name: 'Закрепить' }).click();
  await expect(editor.getByRole('status')).toHaveText(/Сохранено/);

  // Export a single note
  const download = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Экспорт в Markdown' }).click();
  // The file is named after the note; headless Chromium reports non-ASCII names as "download", so check the content.
  const file = await download;
  const md = Buffer.concat(await (await file.createReadStream()).toArray()).toString('utf8');
  expect(md).toContain('# Встреча с командой');
  expect(md).toContain('Категория: Работа · Теги: встречи, план');

  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  const card = page.getByTestId('note-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByLabel('Закреплена')).toBeVisible();

  // Persist across reload
  await page.reload();
  await expect(page.getByTestId('note-card')).toContainText('Встреча с командой');

  // Search and category filter
  await page.getByRole('searchbox', { name: 'Поиск по заметкам' }).fill('бюджет');
  await expect(page.getByTestId('note-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Поиск по заметкам' }).fill('несуществующее');
  await expect(page.getByText('Ничего не найдено')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Поиск по заметкам' }).fill('');
  await page.getByRole('group', { name: 'Категории' }).getByRole('button', { name: 'Работа' }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(1);

  // Delete
  await page.getByTestId('note-card').click();
  await page.getByRole('dialog', { name: 'Заметка' }).getByRole('button', { name: 'Удалить заметку' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByTestId('note-card')).toHaveCount(0);
});

test('an empty new note is not saved', async ({ page }) => {
  await open(page, 'notes');
  await page.getByRole('button', { name: 'Заметка', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Заметок пока нет')).toBeVisible();
});

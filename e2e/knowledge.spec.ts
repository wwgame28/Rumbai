import { expect, mockCloud, open, sse, test } from './helpers.ts';

const DOC = 'Бюджет проекта\nКоманда: 5 человек\nСрок релиза — декабрь\nБюджет на маркетинг: 2 млн';

test('import a file locally, search it with line references, save an excerpt, remove it', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (r) => r.method() !== 'GET' && uploads.push(r.url()));
  await open(page, 'files');
  await page.locator('#file-input').setInputFiles({ name: 'проект.md', mimeType: 'text/markdown', buffer: Buffer.from(DOC) });
  await expect(page.getByText('Импортировано: 1 файл')).toBeVisible();
  const row = page.getByRole('list', { name: 'Импортированные файлы' }).getByRole('listitem');
  await expect(row).toContainText('проект.md');
  await expect(row).toContainText('MD');
  await expect(row).toContainText('локально');

  // Unsupported formats are refused with a reason.
  await page.locator('#file-input').setInputFiles({ name: 'скан.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.getByRole('alert').filter({ hasText: 'PDF пока не реализовано' })).toBeVisible();

  await open(page, 'knowledge');
  await expect(page.getByText('Семантический поиск (по смыслу) не реализован')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Поиск по документам' }).fill('бюджет');
  const result = page.getByRole('region', { name: 'Результаты поиска' });
  await expect(result.getByText('стр. 1')).toBeVisible();
  await expect(result.getByText('стр. 4')).toBeVisible();
  await result.getByRole('button', { name: 'Сохранить фрагмент со строки 4' }).click();
  await page.getByRole('searchbox', { name: 'Поиск по документам' }).fill('');
  await page.getByRole('radio', { name: 'Фрагменты' }).click();
  await expect(page.getByText('проект.md, стр. 4', { exact: false })).toBeVisible();

  // Nothing was uploaded anywhere.
  expect(uploads).toEqual([]);

  await open(page, 'files');
  await page.getByRole('button', { name: 'Удалить «проект.md»' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText('Файлов пока нет')).toBeVisible();
  await open(page, 'knowledge');
  await page.getByRole('radio', { name: 'Фрагменты' }).click();
  await expect(page.getByText('Фрагментов нет')).toBeVisible();
});

test('HTML imports are reduced to inert text', async ({ page }) => {
  await open(page, 'files');
  await page.locator('#file-input').setInputFiles({
    name: 'page.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<h1>Заголовок</h1><script>window.pwned=1</script><img src=x onerror="window.pwned=2"><p>Текст</p>'),
  });
  await expect(page.getByText('Импортировано: 1 файл')).toBeVisible();
  await open(page, 'knowledge');
  await page.getByRole('button', { name: /page\.html/ }).first().click();
  const text = page.locator('.doc-text');
  await expect(text).toContainText('Заголовок');
  await expect(text).not.toContainText('pwned');
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});

test('a selected document is sent as context and cited as a source', async ({ page }) => {
  await mockCloud(page);
  let body: { context?: Array<{ title: string; text: string }> } = {};
  await page.route('/api/chat', async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([{ type: 'done', stopReason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Срок — декабрь.' }] }]),
    });
  });
  await open(page, 'files');
  await page.locator('#file-input').setInputFiles({ name: 'проект.md', mimeType: 'text/markdown', buffer: Buffer.from(DOC) });
  await open(page, 'knowledge');
  await page.getByRole('button', { name: 'Спросить' }).click();
  await expect(page).toHaveURL(/#\/assistant\//);
  await expect(page.getByRole('button', { name: 'Документы для контекста: выбрано 1' })).toBeVisible();
  await page.getByRole('radio', { name: 'Облако Claude' }).click();
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Когда релиз?');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Разрешить облако' }).click();
  await expect(page.getByText('Срок — декабрь.')).toBeVisible();
  expect(body.context?.[0]?.title).toBe('проект.md');
  await expect(page.locator('.sources')).toContainText('проект.md');
});

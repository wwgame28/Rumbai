import { expect, open, test } from './helpers.ts';

test('capability detection reports missing WebGPU and disables downloads', async ({ page }) => {
  await open(page, 'models');
  // Headless Chromium may expose the API without granting an adapter; both mean "no WebGPU".
  await expect(page.getByText(/WebGPU не поддерживается|видеоадаптер не выдан/)).toBeVisible();
  await expect(page.getByText('Локальная модель здесь не запустится.', { exact: false })).toBeVisible();
  for (const b of await page.getByRole('button', { name: /Скачать и запустить/ }).all()) await expect(b).toBeDisabled();
  // The five readiness states are reported separately.
  const states = page.getByRole('list').filter({ hasText: 'Инференс подтверждён' });
  await expect(states.locator('li')).toHaveCount(5);
  await expect(states.locator('li').filter({ hasText: 'Документы доступны офлайн' })).toHaveClass(/is-ok/);
  // Without a model nothing about local AI may be marked as done.
  for (const label of ['Модель скачана', 'Среда выполнения запущена', 'Инференс подтверждён']) {
    await expect(states.locator('li').filter({ hasText: label })).not.toHaveClass(/is-ok/);
  }
});

test.describe('with a WebGPU adapter that cannot run models', () => {
  test.use({ consoleErrors: [] as string[] });
  test('download needs consent, failure is explained, nothing is advertised as ready', async ({ page }) => {
    // Pretend WebGPU exists so the download path is reachable; the worker still has no real GPU.
    await page.addInitScript(() => {
      const adapter = { features: new Set(['shader-f16']), limits: { maxBufferSize: 1 << 30 }, info: { vendor: 'test' }, requestDevice: () => Promise.reject(new Error('no device in test')) };
      Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' } });
    });
    // Never download real model files in tests.
    const external: string[] = [];
    await page.route(/huggingface\.co|githubusercontent\.com|hf\.co/, (r) => (external.push(r.request().url()), r.abort()));
    await open(page, 'models');
    await expect(page.getByText('WebGPU доступен (с f16)')).toBeVisible();

    await page.getByRole('button', { name: 'Скачать и запустить' }).first().click();
    const dialog = page.getByRole('alertdialog', { name: 'Скачать Qwen2.5 0.5B Instruct?' });
    await expect(dialog).toContainText('около 290 МБ');
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    expect(external).toEqual([]);

    await page.getByRole('button', { name: 'Скачать и запустить' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Скачать' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: /./ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Инференс подтверждён').locator('..').locator('..')).not.toHaveClass(/is-ok/);

    await open(page, 'assistant');
    await expect(page.getByText('Модель не запустилась')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  });
});

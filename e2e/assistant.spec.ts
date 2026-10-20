import { expect, mockCloud, open, sse, test } from './helpers.ts';
import type { Page, Route } from '@playwright/test';

async function useCloud(page: Page) {
  await page.getByRole('radiogroup', { name: 'Где работает ассистент' }).getByRole('radio', { name: 'Облако Claude' }).click();
  await expect(page.getByText('Claude Opus 5.5 · облако').first()).toBeVisible();
}

async function sendMessage(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Сообщение' }).fill(text);
  await page.getByRole('button', { name: 'Отправить' }).click();
}

test('local mode is honestly unavailable without WebGPU and never falls back to the cloud', async ({ page }) => {
  let chatCalls = 0;
  await page.route('/api/chat', (r) => (chatCalls++, r.abort()));
  await open(page, 'assistant');
  await expect(page.getByText('Локальный ИИ недоступен')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveAttribute('placeholder', 'Ассистент недоступен');
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Привет');
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  expect(chatCalls).toBe(0);
});

test('cloud mode asks for consent, streams, labels the engine and supports copy/retry', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockCloud(page);
  const bodies: unknown[] = [];
  await page.route('/api/chat', async (r: Route) => {
    bodies.push(r.request().postDataJSON());
    await r.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([
        { type: 'start', model: 'claude-opus-5-5' },
        { type: 'text', text: 'Сегодня у вас ' },
        { type: 'text', text: '**нет задач**.' },
        { type: 'done', stopReason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Сегодня у вас **нет задач**.' }] },
      ]),
    });
  });
  await open(page, 'assistant');
  await useCloud(page);
  await expect(page.getByRole('note')).toHaveText(/сообщение уйдёт в Anthropic/);

  await sendMessage(page, 'Что у меня сегодня?');
  const consent = page.getByRole('alertdialog', { name: 'Включить облачный режим?' });
  await expect(consent).toBeVisible();
  await consent.getByRole('button', { name: 'Разрешить облако' }).click();

  const answer = page.locator('.msg-assistant').last();
  await expect(answer.locator('.md strong')).toHaveText('нет задач');
  await expect(answer.locator('.engine-tag')).toHaveText('Claude Opus 5.5 · облако');
  await expect(page).toHaveURL(/#\/assistant\/[0-9a-f-]+/);
  expect(bodies).toHaveLength(1);
  const req = bodies[0] as { messages: Array<{ role: string; content: string }>; tools: string[]; today: string };
  expect(req.messages).toEqual([{ role: 'user', content: 'Что у меня сегодня?' }]);
  expect(req.tools).toContain('create_task');
  expect(req.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await answer.getByRole('button', { name: 'Копировать ответ' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Сегодня у вас **нет задач**.');

  await answer.getByRole('button', { name: 'Повторить ответ' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  await expect(page.locator('.msg-assistant')).toHaveCount(1);

  // History survives a reload and is searchable
  await page.reload();
  await expect(page.locator('.msg-assistant')).toHaveCount(1);
  await page.getByRole('button', { name: 'История разговоров' }).click();
  await page.getByRole('searchbox', { name: 'Поиск по истории' }).fill('сегодня');
  await expect(page.getByRole('dialog', { name: 'История разговоров' }).getByText('Что у меня сегодня?')).toBeVisible();
});

test('declining cloud consent sends nothing', async ({ page }) => {
  await mockCloud(page);
  let calls = 0;
  await page.route('/api/chat', (r) => (calls++, r.abort()));
  await open(page, 'assistant');
  await useCloud(page);
  await sendMessage(page, 'Секрет');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена' }).click();
  expect(calls).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('Секрет');
});

test.describe('cloud errors', () => {
  for (const [label, handler, text] of [
    ['rate limit event', (r: Route) => r.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse([{ type: 'error', code: 'rate_limited', message: 'Превышен лимит запросов к Claude. Попробуйте чуть позже.' }]) }), 'Превышен лимит запросов'],
    ['server not configured', (r: Route) => r.fulfill({ status: 503, json: { error: { code: 'not_configured', message: 'Claude не настроен на сервере: не задан ANTHROPIC_API_KEY.' } } }), 'не задан ANTHROPIC_API_KEY'],
    ['network failure', (r: Route) => r.abort('internetdisconnected'), 'Не удалось связаться с сервером RUMBAI'],
  ] as const) {
    test(label, async ({ page }) => {
      await mockCloud(page);
      await page.route('/api/chat', handler);
      await open(page, 'assistant');
      await useCloud(page);
      await sendMessage(page, 'Привет');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Разрешить облако' }).click();
      await expect(page.locator('.msg-assistant [role="alert"]')).toContainText(text);
      // The user's message is kept.
      await expect(page.locator('.msg-user .bubble')).toHaveText('Привет');
    });
  }
});

test('stop generation keeps the partial answer', async ({ page }) => {
  await mockCloud(page);
  await page.route('/api/chat', () => {
    // Never respond: the user stops while waiting.
  });
  await open(page, 'assistant');
  await useCloud(page);
  await sendMessage(page, 'Длинный ответ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Разрешить облако' }).click();
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByText('Генерация остановлена')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeVisible();
});

test('agent tools: confirmation before a write, results sent back, task created', async ({ page }) => {
  await mockCloud(page);
  const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
  await page.route('/api/chat', async (r) => {
    bodies.push(r.request().postDataJSON());
    const first = bodies.length === 1;
    const content = first
      ? [
          { type: 'text', text: 'Создаю задачу.' },
          { type: 'tool_use', id: 'toolu_1', name: 'create_task', input: { title: 'Отправить отчёт', due: '2026-10-21', priority: 'high' } },
        ]
      : [{ type: 'text', text: 'Готово, задача создана.' }];
    await r.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([
        { type: 'start', model: 'claude-opus-5-5' },
        ...(first ? [{ type: 'text', text: 'Создаю задачу.' }, { type: 'tool_use_start', id: 'toolu_1', name: 'create_task' }] : [{ type: 'text', text: 'Готово, задача создана.' }]),
        { type: 'done', stopReason: first ? 'tool_use' : 'end_turn', model: 'claude-opus-5-5', content },
      ]),
    });
  });
  await open(page, 'assistant');
  await useCloud(page);
  await sendMessage(page, 'Напомни отправить отчёт завтра');
  await page.getByRole('alertdialog', { name: 'Включить облачный режим?' }).getByRole('button', { name: 'Разрешить облако' }).click();

  const permission = page.getByRole('alertdialog', { name: 'Ассистент просит разрешения' });
  await expect(permission).toContainText('Создать задачу «Отправить отчёт» со сроком 2026-10-21.');
  await permission.getByRole('button', { name: 'Разрешить' }).click();

  await expect(page.getByText('Готово, задача создана.')).toBeVisible();
  await expect(page.locator('.tool-card.tool-done')).toContainText('Создана задача «Отправить отчёт»');

  // The second request carried the original assistant blocks and the tool result.
  const second = bodies[1]!.messages;
  expect(second[1]).toMatchObject({ role: 'assistant', content: [{ type: 'text' }, { type: 'tool_use', id: 'toolu_1' }] });
  expect(second[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] });

  await open(page, 'tasks');
  await expect(page.getByRole('list', { name: 'Список задач' })).toContainText('Отправить отчёт');
  await open(page, 'home');
  await expect(page.getByText('Ассистент создал задачу')).toBeVisible();
});

test('agent tools: a declined write is not executed', async ({ page }) => {
  await mockCloud(page);
  let n = 0;
  await page.route('/api/chat', async (r) => {
    n++;
    const content =
      n === 1 ? [{ type: 'tool_use', id: 'toolu_9', name: 'create_task', input: { title: 'Нежелательная' } }] : [{ type: 'text', text: 'Хорошо, не создаю.' }];
    await r.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([{ type: 'start', model: 'claude-opus-5-5' }, { type: 'done', stopReason: n === 1 ? 'tool_use' : 'end_turn', model: 'claude-opus-5-5', content }]),
    });
  });
  await open(page, 'assistant');
  await useCloud(page);
  await sendMessage(page, 'Создай задачу');
  await page.getByRole('alertdialog', { name: 'Включить облачный режим?' }).getByRole('button', { name: 'Разрешить облако' }).click();
  await page.getByRole('alertdialog', { name: 'Ассистент просит разрешения' }).getByRole('button', { name: 'Отклонить' }).click();
  await expect(page.locator('.tool-card.tool-denied')).toContainText('Отклонено пользователем');
  await open(page, 'tasks');
  await expect(page.getByText('Нежелательная')).toHaveCount(0);
});

test('editing the last user message regenerates the answer', async ({ page }) => {
  await mockCloud(page);
  const seen: string[] = [];
  await page.route('/api/chat', async (r) => {
    const body = r.request().postDataJSON() as { messages: Array<{ content: string }> };
    seen.push(body.messages.at(-1)!.content);
    await r.fulfill({
      headers: { 'content-type': 'text/event-stream' },
      body: sse([{ type: 'done', stopReason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: `Ответ ${seen.length}` }] }]),
    });
  });
  await open(page, 'assistant');
  await useCloud(page);
  await sendMessage(page, 'Первый вариант');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Разрешить облако' }).click();
  await expect(page.getByText('Ответ 1')).toBeVisible();
  await page.getByRole('button', { name: 'Изменить сообщение' }).click();
  await page.getByRole('dialog', { name: 'Изменить сообщение' }).getByRole('textbox').fill('Второй вариант');
  await page.getByRole('button', { name: 'Отправить заново' }).click();
  await expect(page.getByText('Ответ 2')).toBeVisible();
  await expect(page.getByText('Ответ 1')).toHaveCount(0);
  expect(seen).toEqual(['Первый вариант', 'Второй вариант']);
});

import { expect, open, test } from './helpers.ts';

test('manual run, enable toggle, history and unavailable integrations', async ({ page }) => {
  await open(page, 'tasks');
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  await page.getByLabel('Название').fill('Задача на сегодня');
  await page.getByRole('button', { name: 'Сегодня' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Создать задачу' }).click();

  await open(page, 'automations');
  const digest = page.getByRole('listitem').filter({ hasText: 'Утренняя сводка' });
  await digest.getByRole('button', { name: 'Запустить сейчас' }).click();
  await expect(page.getByText('Создана сводка: 1 на сегодня, 0 просрочено').first()).toBeVisible();
  await expect(page.getByRole('list').filter({ hasText: 'Выполнено ·' })).toBeVisible();

  await digest.getByRole('switch', { name: 'Включить «Утренняя сводка»' }).click();
  await expect(digest.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

  // Consequential automations ask first and report when there is nothing to do.
  const cleanup = page.getByRole('listitem').filter({ hasText: 'Очистка выполненных' });
  await expect(cleanup.getByRole('switch')).toHaveCount(0);
  await cleanup.getByRole('button', { name: 'Запустить сейчас' }).click();
  await expect(page.getByText('Нет задач, выполненных больше недели назад').first()).toBeVisible();

  // Integrations that are not configured cannot be run.
  const telegram = page.getByRole('listitem').filter({ hasText: 'Сводка в Telegram' });
  await expect(telegram).toContainText('Недоступно');
  await expect(telegram.getByRole('button')).toHaveCount(0);

  await open(page, 'notes');
  await expect(page.getByTestId('note-card')).toContainText('Сводка на');
});

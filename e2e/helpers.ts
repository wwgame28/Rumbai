import { expect, test as base, type Page } from '@playwright/test';

/** Fails a test on any console error or uncaught exception. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        // Chromium logs failed requests (offline, mocked 5xx) itself; those are not app errors.
        if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function open(page: Page, route = 'home') {
  await page.goto(`/#/${route}`);
  await expect(page.locator('#boot')).toHaveCount(0);
  // Wait until the previous screen's exit animation is over, so locators only see this screen.
  await expect(page.locator(`main > .screen[data-screen="${route}"]`)).toBeVisible();
  await expect(page.locator('main > .screen')).toHaveCount(1);
}

export function sse(events: unknown[]) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

export async function mockCloud(page: Page, configured = true) {
  await page.route('/api/health', (r) =>
    r.fulfill({ json: { ok: true, claude: { configured, model: configured ? 'claude-opus-5-5' : null }, version: '1.0.0' } }),
  );
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

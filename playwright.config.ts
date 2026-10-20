import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const PORT = 4317;
// Cloud sessions ship a preinstalled Chromium that may predate this Playwright version.
const bundledChromium = '/opt/pw-browsers/chromium';

/** iPhone 16 Pro Max portrait in CSS pixels. */
const iphone16ProMax = { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iphone-16-pro-max-chromium',
      use: { browserName: 'chromium', ...iphone16ProMax, launchOptions: existsSync(bundledChromium) ? { executablePath: bundledChromium } : {} },
    },
    // WebKit is the closest engine to iOS Safari; run with PW_WEBKIT=1 after `npx playwright install webkit`.
    ...(process.env.PW_WEBKIT ? [{ name: 'iphone-16-pro-max-webkit', use: { browserName: 'webkit' as const, ...iphone16ProMax } }] : []),
  ],
  webServer: {
    command: `npm run build && PORT=${PORT} ANTHROPIC_API_KEY= node --experimental-strip-types server/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

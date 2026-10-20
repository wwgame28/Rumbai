// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const bundled = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(bundled) ? { executablePath: bundled } : {});
const page = await browser.newPage();

async function render(file, size, { maskable = false, rounded = true } = {}) {
  const inner = maskable ? size * 0.8 : size;
  const svgBody = rounded ? svg : svg.replace('rx="112"', 'rx="0"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${maskable || !rounded ? '#05070f' : 'transparent'}">
      <div style="width:${inner}px;height:${inner}px">${svgBody.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: !maskable && rounded });
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true, rounded: false });
// iOS applies its own corner mask and shows transparency as black, so use a full-bleed square.
await render('apple-touch-icon.png', 180, { rounded: false });
await browser.close();
console.log('icons written');

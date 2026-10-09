import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
await fs.mkdir('reports/previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, viewport] of Object.entries({
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
})) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/');
  await page.getByRole('button', { name: 'Pausar movimiento' }).click();
  // Trigger lazy images and visible islands before reviewing the whole document.
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = 0; y < height; y += viewport.height * 0.8) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: 'instant' }),
      y,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
    await page.screenshot({ path: `reports/previews/${name}-${theme}.png` });
    await page.screenshot({
      path: `reports/previews/${name}-${theme}-full.png`,
      fullPage: true,
    });
  }
  await page.goto('http://localhost:4321/mascotas/milo/');
  await page
    .locator('.profile-main-photo img')
    .evaluate((image) => image.decode());
  await page.screenshot({
    path: `reports/previews/${name}-profile.png`,
    fullPage: true,
  });
  console.log(`Captured ${name}`);
  await context.close();
}
await browser.close();

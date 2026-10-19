import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseTestUser } from './support/session';

test('wide match studio keeps answers, exposes direct steps and updates the live summary', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  await page.goto('/tu-match/');
  const studio = page.locator('.match-studio');
  const progress = page.getByRole('navigation', {
    name: 'Pasos de búsqueda inteligente',
  });
  await expect(progress.getByRole('button')).toHaveCount(7);
  await expect(page.getByLabel('Entrar como usuario de prueba')).toHaveCount(0);
  await page.getByRole('button', { name: /^Un perro/ }).click();
  await page.getByRole('button', { name: /^Mayor/ }).click();
  await progress
    .getByRole('button', { name: 'Paso 2: Tu ritmo', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tu ritmo de vida' }),
  ).toBeFocused();
  const questionPosition = await page
    .locator('.match-question h2')
    .evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      header: document.querySelector('.header')!.getBoundingClientRect().bottom,
      viewport: innerHeight,
    }));
  expect(questionPosition.top).toBeGreaterThanOrEqual(questionPosition.header);
  expect(questionPosition.bottom).toBeLessThan(questionPosition.viewport);
  await page.getByRole('button', { name: '60 minutos', exact: true }).click();
  await expect(
    page.getByLabel('Minutos diarios disponibles para paseos o juegos', {
      exact: true,
    }),
  ).toHaveValue('60');
  await progress
    .getByRole('button', { name: 'Paso 3: Tu hogar', exact: true })
    .click();
  await page.getByRole('button', { name: /^Apartamento/ }).click();
  await progress
    .getByRole('button', { name: 'Paso 1: Compañero', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Un perro/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^Mayor/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    progress.getByRole('button', { name: 'Paso 1: Compañero', exact: true }),
  ).toHaveAttribute('aria-current', 'step');
  const summary = page.locator('.match-summary');
  if (!(await summary.evaluate((node) => (node as HTMLDetailsElement).open)))
    await summary.locator('summary').click();
  await expect(summary).toContainText('Perros');
  await expect(summary).toContainText('60 min de actividad al día');
  await expect(summary).toContainText('Apartamento');
  for (const width of testInfo.project.name === 'desktop'
    ? [768, 1060, 1440, 1920]
    : [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await studio.evaluate((node) => ({
      studio: node.getBoundingClientRect().width,
      intro: document
        .querySelector('.match-page-heading')!
        .getBoundingClientRect().width,
      question: node.querySelector('.match-question')!.getBoundingClientRect()
        .width,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(sizes.overflow, `page overflow at ${width}`).toBe(false);
    expect(sizes.studio).toBeGreaterThan(sizes.intro * 0.98);
    if (width >= 1100) {
      expect(sizes.question).toBeGreaterThan(sizes.studio * 0.65);
      const positions = await studio
        .locator('[data-field="species"] .quiz-option')
        .evaluateAll((nodes) =>
          nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
        );
      expect(new Set(positions).size).toBe(1);
    }
    const buttonFont = await page
      .getByRole('button', { name: /^Un perro/ })
      .locator('b')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(buttonFont).toBeGreaterThanOrEqual(16);
  }
  await page.setViewportSize(
    testInfo.project.name === 'desktop'
      ? { width: 1440, height: 1000 }
      : { width: 390, height: 844 },
  );
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: `reports/previews/match-studio-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `reports/previews/match-studio-viewport-${testInfo.project.name}.png`,
  });
  expect(
    (await new AxeBuilder({ page }).include('.match-studio').analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
  await page.screenshot({
    path: `reports/previews/match-studio-neon-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).include('.match-studio').analyze())
      .violations,
  ).toEqual([]);
});

test('match results show both compatibility directions and expandable reasons', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  await page.goto('/tu-match/');
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const first = page.locator('.match-result').first();
  await expect(first).toBeVisible({ timeout: 45000 });
  await expect(first).toContainText('Adecuación del hogar');
  await expect(first).toContainText('Afinidad con tus preferencias');
  await first.locator('summary').click();
  await expect(first.locator('details')).toHaveAttribute('open', '');
  await expect(first.locator('.match-result-details h4').first()).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.match-results-grid').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `reports/previews/match-results-${testInfo.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Modificar mis respuestas' }).click();
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: /^Un perro/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

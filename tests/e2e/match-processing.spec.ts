import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseTestUser } from './support/session';
import { expectProductLanguage } from './support/presentation';

test('real local search shows live processing then hands focus to the matches', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  await page.goto('/tu-match/');
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/matches/search') &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Buscando una linda conexión.',
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.match-result')).toHaveCount(0);
  await expect(dialog.locator('.processing-stages li')).toHaveCount(5);
  await expect(dialog).toContainText(
    'Afinidad entre tu historia y sus necesidades',
  );
  await expect(dialog).toContainText(
    'Exploración del catálogo de animales disponibles',
  );
  await expectProductLanguage(dialog);
  // Fast model/cache stages can finish between screenshots. Observe the real
  // rendered transitions while the modal exists, without holding the UI open.
  const observed = await page.evaluateHandle(() => {
    const element = document.querySelector('.match-processing-dialog')!;
    const states = new Set<string>();
    const collect = () =>
      element
        .querySelectorAll('[data-stage]')
        .forEach((node) =>
          states.add(
            `${node.getAttribute('data-stage')}:${node.getAttribute('data-state')}`,
          ),
        );
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(element, {
      attributes: true,
      subtree: true,
      childList: true,
    });
    return { states, disconnect: () => observer.disconnect() };
  });
  await page.screenshot({
    path: `reports/previews/match-processing-${testInfo.project.name}.png`,
  });
  const resultResponse = await response;
  expect(resultResponse.headers()['content-type']).toContain(
    'application/x-ndjson',
  );
  await expect(page.locator('.match-processing-dialog')).not.toBeVisible({
    timeout: 45000,
  });
  await expect(
    page.getByRole('heading', { name: 'Estas historias podrían ir con vos.' }),
  ).toBeFocused();
  await expect(page.locator('.match-result').first()).toBeVisible();
  const states = await observed.evaluate((value) => {
    value.disconnect();
    return [...value.states];
  });
  expect(states).toContain('structured:complete');
  expect(states).toContain('ranking:complete');
  await observed.dispose();
  await expect(page.locator('body')).not.toHaveClass(/locked/);
});

test('processing modal is accessible and escape cancels without publishing late results', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  const release: (() => void)[] = [];
  await page.route('**/api/v1/matches/search', async (route) => {
    await new Promise<void>((resolve) => release.push(resolve));
    await route
      .fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: '{"type":"progress","stage":"embedding","state":"running","elapsed_ms":100}\n',
      })
      .catch(() => {});
  });
  await page.goto('/tu-match/');
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Buscando una linda conexión.',
  });
  await expect(dialog).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.match-processing-dialog')
        .analyze()
    ).violations,
  ).toEqual([]);
  if (testInfo.project.name === 'mobile')
    await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await dialog.evaluate(
      (node) =>
        node.getBoundingClientRect().width <= innerWidth &&
        node.scrollWidth <= node.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `reports/previews/match-processing-compact-${testInfo.project.name}.png`,
  });
  await page.keyboard.press('Escape');
  release.splice(0).forEach((resolve) => resolve());
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.match-result')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Buscar con mi perfil guardado' }),
  ).toBeEnabled();
  await expect(page.locator('body')).not.toHaveClass(/locked/);
  await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  await expect(dialog).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.match-processing-dialog')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `reports/previews/match-processing-neon-${testInfo.project.name}.png`,
  });
  await page.keyboard.press('Escape');
  release.splice(0).forEach((resolve) => resolve());
});

test('failed searches remain explicit and retry starts a fresh processing attempt', async ({
  page,
}) => {
  await chooseTestUser(page, 'ana');
  let attempts = 0;
  await page.route('**/api/v1/matches/search', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          type: 'error',
          code: 'search_unavailable',
          message: `Bekko Horizon LanceDB: fallo de inferencia ${++attempts}`,
        }) + '\n',
    }),
  );
  await page.goto('/tu-match/');
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Nos falta un pasito.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText(
    'Volvé a intentar en unos minutos',
  );
  expect(attempts).toBe(1);
  await expectProductLanguage(dialog);
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(dialog.getByRole('alert')).toContainText(
    'Volvé a intentar en unos minutos',
  );
  await expectProductLanguage(dialog);
  await expect(page.locator('.match-result')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Volver a mis respuestas' }).click();
  await expect(dialog).not.toBeVisible();
});

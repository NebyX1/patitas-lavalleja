import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseTestUser } from './support/session';

const petId = 'demo-animal-01-07';
const petPath = `/mascotas/${petId}/`;

async function headerFits(page: Page) {
  const problems = await page.locator('.nav').evaluate((nav) => {
    const brand = nav.querySelector('.brand')!.getBoundingClientRect();
    const links = nav.querySelector('.nav-links')!.getBoundingClientRect();
    const actions = nav.querySelector('.nav-actions')!.getBoundingClientRect();
    return {
      overlap:
        links.width > 0 &&
        (brand.right > links.left || links.right > actions.left),
      outside: actions.right > innerWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(problems).toEqual({
    overlap: false,
    outside: false,
    pageOverflow: false,
  });
}

test('intelligent search is shown after login and anonymous analysis is rejected', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/favoritos/');
  await expect(page.locator('.nav-account')).toHaveAttribute(
    'aria-label',
    'Iniciar sesión',
  );
  await expect(page.locator('.nav-smart-search')).toHaveCount(0);
  await expect(page.locator('.catalog-smart-search')).toHaveCount(0);
  await page.goto(petPath);
  await expect(
    page.getByRole('region', { name: 'Tu compatibilidad con este animal' }),
  ).toHaveCount(0);
  const denied = await page.request.post(
    `/api/v1/me/pets/${petId}/compatibility`,
  );
  expect(denied.status()).toBe(401);
  expect(
    (
      await page.request.post('/api/v1/matches/search', {
        data: { profile: {} },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/tu-match/');
  await expect(page).toHaveURL(/\/login\/\?next=%2Ftu-match%2F$/);
  await expect(
    page.getByRole('button', { name: 'Ver mis afinidades', exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Entrar como usuario de prueba')
    .selectOption('demo-user-ana');
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/tu-match\/$/);
  await expect(page.getByLabel('Entrar como usuario de prueba')).toHaveCount(0);
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Navegación móvil' })
        .getByRole('link', { name: 'Búsqueda inteligente' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar menú' }).click();
  } else await expect(page.locator('.nav-smart-search')).toBeVisible();
  await page.goto('/favoritos/');
  await page
    .locator('.catalog-smart-search')
    .getByRole('link', { name: 'Búsqueda inteligente' })
    .click();
  await expect(page).toHaveURL(/\/tu-match\/$/);
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith('/api/v1/matches/search') &&
      value.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const completed = await response;
  expect(completed.status()).toBe(200);
  await expect(page.locator('.match-result').first()).toBeVisible({
    timeout: 45000,
  });
});

test('saved household powers analysis on the viewed animal and clears after logout', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  await page.goto(petPath);
  const panel = page.getByRole('region', {
    name: 'Tu compatibilidad con este animal',
    exact: true,
  });
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith(`/api/v1/me/pets/${petId}/compatibility`) &&
      value.request().method() === 'POST',
  );
  await panel
    .getByRole('button', { name: 'Analizar compatibilidad', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Tu mundo y el de Nube.' }),
  ).toBeVisible();
  const result = await response;
  expect(result.status()).toBe(200);
  const report = await result.json();
  expect(report.pet_id).toBe(petId);
  expect(report.match.home_score).toBeGreaterThan(0);
  await expect(panel.getByLabel('Informe de compatibilidad')).toContainText(
    'Hogar → Animal',
  );
  await expect(panel.getByLabel('Informe de compatibilidad')).toContainText(
    'Animal → Persona',
  );
  await panel
    .getByRole('button', { name: 'Ver explicación y puntos a conversar' })
    .click();
  expect(
    (await new AxeBuilder({ page }).include('.pet-compatibility').analyze())
      .violations,
  ).toEqual([]);
  for (const width of testInfo.project.name === 'mobile'
    ? [320, 390]
    : [768, 1024, 1061, 1240, 1361, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await headerFits(page);
    for (const score of await panel
      .locator('.compatibility-directions strong')
      .all())
      expect(
        await score.evaluate(
          (element) =>
            element.getBoundingClientRect().height <=
            Number.parseFloat(getComputedStyle(element).lineHeight) + 1,
        ),
      ).toBe(true);
  }
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `reports/previews/personal-compatibility-${testInfo.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
  expect(
    (await new AxeBuilder({ page }).include('.pet-compatibility').analyze())
      .violations,
  ).toEqual([]);
  await page.goto('/cuenta/');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\/$/);
  await page.goto(petPath);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.nav-smart-search')).toHaveCount(0);
  await chooseTestUser(page, 'bruno');
  await page.goto(petPath);
  await expect(page.getByLabel('Informe de compatibilidad')).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Analizar compatibilidad', exact: true })
    .click();
  await expect(
    panel.getByRole('heading', {
      name: 'Incompatibilidades observadas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByLabel('Informe de compatibilidad')).toContainText(
    'Orientación inicial',
  );
});

test('an account without a saved home gets a useful completion step', async ({
  page,
}) => {
  await chooseTestUser(page, 'lucia');
  await page.goto(petPath);
  const panel = page.getByRole('region', {
    name: 'Tu compatibilidad con este animal',
    exact: true,
  });
  await expect(
    panel.getByRole('link', { name: 'Completar mi hogar' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Analizar compatibilidad' }),
  ).toHaveCount(0);
  await panel.getByRole('link', { name: 'Completar mi hogar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeVisible();
});

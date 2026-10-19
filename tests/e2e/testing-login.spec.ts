import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function changeAccount(page: Page, userId: string) {
  await page.goto('/cuenta/');
  await expect(page.getByLabel('Entrar como usuario de prueba')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\/$/);
  await page.getByLabel('Entrar como usuario de prueba').selectOption(userId);
  await expect(page).toHaveURL(/\/cuenta\/$/);
  await page.goto('/tu-match/');
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeVisible();
  await expect(page.getByLabel('Entrar como usuario de prueba')).toHaveCount(0);
}

test('switch fictitious households and search with saved profiles', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const available = await (await request.get('/api/v1/auth/demo-users')).json();
  test.skip(
    !available.enabled,
    'Requires the explicit local testing mode and seed-testing.',
  );
  await page.goto('/');
  const navbar = page.getByRole('navigation', {
    name: 'Navegación principal',
    exact: true,
  });
  if ((page.viewportSize()?.width ?? 1440) <= 580) {
    await navbar.getByRole('button', { name: 'Abrir menú' }).click();
    await page
      .getByRole('navigation', { name: 'Navegación móvil', exact: true })
      .getByRole('link', { name: 'Iniciar sesión', exact: true })
      .click();
  } else {
    await navbar
      .getByRole('link', { name: 'Iniciar sesión', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/login\/$/);
  const selector = page.getByLabel('Entrar como usuario de prueba');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option:not([disabled])')).toHaveCount(13);
  expect(
    (await new AxeBuilder({ page }).include('.testing-login').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `reports/previews/dedicated-login-${testInfo.project.name}.png`,
  });
  await selector.selectOption('demo-user-ana');
  await expect(page).toHaveURL(/\/cuenta\/$/);
  await expect(
    page.getByRole('heading', { name: 'Ana', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.nav-account')).toHaveAttribute(
    'aria-label',
    'Mi cuenta: Ana · Hogar tranquilo',
  );
  await expect(
    page.getByLabel('Contraseña', { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: `reports/previews/testing-login-${testInfo.project.name}.png`,
  });
  // Authenticated users must sign out before seeing the login selector again.
  await page.goto('/login/');
  await expect(page).toHaveURL(/\/cuenta\/$/);
  await expect(selector).toHaveCount(0);
  await page.goto('/tu-match/');
  await expect(selector).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeVisible();
  await page.screenshot({
    path: `reports/previews/match-without-login-${testInfo.project.name}.png`,
  });
  await changeAccount(page, 'demo-user-bruno');
  const search = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/matches/search') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  const response = await search;
  expect(response.status()).toBe(200);
  await expect(page.locator('.match-result').first()).toBeVisible({
    timeout: 45000,
  });
  expect(
    await page
      .locator('.match-result')
      .evaluateAll((cards) =>
        cards.every((card) => card.getAttribute('data-species') === 'dog'),
      ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `reports/previews/testing-results-${testInfo.project.name}.png`,
  });

  await changeAccount(page, 'demo-user-carla');
  await expect(page.locator('.match-result')).toHaveCount(0);
  const second = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/matches/search') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  expect((await second).status()).toBe(200);
  await expect(page.locator('.match-result').first()).toBeVisible({
    timeout: 45000,
  });
  expect(
    await page
      .locator('.match-result')
      .evaluateAll((cards) =>
        cards.every((card) => card.getAttribute('data-species') === 'cat'),
      ),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test('private account routes use the dedicated login and keep return navigation local', async ({
  page,
  request,
}) => {
  const available = await (await request.get('/api/v1/auth/demo-users')).json();
  test.skip(!available.enabled, 'Requires local testing mode.');
  await page.goto('/cuenta/');
  await expect(page).toHaveURL(/\/login\/\?next=%2Fcuenta%2F$/);
  await expect(page.getByLabel('Entrar como usuario de prueba')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  await page
    .getByLabel('Entrar como usuario de prueba')
    .selectOption('demo-user-hugo');
  await expect(page).toHaveURL(/\/cuenta\/$/);
  await expect(
    page.getByRole('heading', { name: 'Hugo', exact: true }),
  ).toBeVisible();
  await page.goto('/login/?next=https%3A%2F%2Fexample.org%2F');
  await expect(page).toHaveURL(/\/cuenta\/$/);
  await expect(page.getByLabel('Entrar como usuario de prueba')).toHaveCount(0);
  await page.goto('/login/?next=%2Fadopcion%2F');
  await expect(page).toHaveURL(/\/adopcion\/$/);
  await page.goto('/cuenta/');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\/$/);
  await page.reload();
  await expect(page.getByLabel('Entrar como usuario de prueba')).toBeVisible();
  await expect(page.locator('.nav-smart-search')).toHaveCount(0);
});

test('association test account keeps its own management permissions', async ({
  page,
  request,
}) => {
  const available = await (await request.get('/api/v1/auth/demo-users')).json();
  test.skip(
    !available.enabled,
    'Requires the explicit local testing mode and seed-testing.',
  );
  await page.goto('/login/');
  await page
    .getByLabel('Entrar como usuario de prueba')
    .selectOption('demo-user-lucia');
  await expect(
    page.getByRole('heading', { name: 'Lucía', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Revisar solicitudes con IA' }).click();
  await expect(
    page.getByRole('heading', { name: 'Detrás de cada encuentro.' }),
  ).toBeVisible();
  const own = await (await page.request.get('/api/v1/admin/pets')).json();
  expect(own.items.length).toBeGreaterThan(0);
  expect(
    own.items.every(
      (pet: { organization_id: string }) =>
        pet.organization_id === 'demo-org-serrano',
    ),
  ).toBeTruthy();
  expect(
    (await page.request.get('/api/v1/admin/pets/demo-animal-02-01')).status(),
  ).toBe(403);
});

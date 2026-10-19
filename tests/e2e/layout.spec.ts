import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function testAccount(page: Page, name: string) {
  const available = await (
    await page.request.get('/api/v1/auth/demo-users')
  ).json();
  test.skip(
    !available.enabled,
    'Requires the explicitly enabled local testing fixtures.',
  );
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  const response = await page.request.post('/api/v1/auth/demo-login', {
    headers: {
      Origin: 'http://localhost:4321',
      'X-CSRF-Token': session.csrf_token,
    },
    data: { user_id: `demo-user-${name}` },
  });
  expect(response.status()).toBe(200);
}

async function fitsViewport(page: Page) {
  const problems = await page.evaluate(() => {
    const outside = [
      ...document.querySelectorAll<HTMLElement>(
        'main input, main select, main textarea, main button, main .btn',
      ),
    ]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
      })
      .map(
        (element) =>
          `${element.tagName}: ${element.getAttribute('name') ?? element.textContent?.trim().slice(0, 70)}`,
      );
    if (document.documentElement.scrollWidth > innerWidth + 1)
      outside.push(
        `document ${document.documentElement.scrollWidth} > ${innerWidth}`,
      );
    for (const field of document.querySelectorAll<HTMLElement>('.form-field')) {
      const label = field.querySelector('label')?.getBoundingClientRect();
      const input = field
        .querySelector('input,select,textarea')
        ?.getBoundingClientRect();
      if (label?.height && input?.height && input.top < label.bottom - 1)
        outside.push(
          `overlapping field: ${field.textContent?.trim().slice(0, 70)}`,
        );
    }
    return outside;
  });
  expect(problems).toEqual([]);
}

async function separatedHeading(page: Page) {
  const gap = await page.evaluate(() => {
    const heading = document
      .querySelector('.management-page > .flow-heading, .person-hero')!
      .getBoundingClientRect();
    const panel = document
      .querySelector('.management-panel, .person-tabs')!
      .getBoundingClientRect();
    return panel.top - heading.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(24);
}

test('account headings and profile actions stay separated when scrolling and navigating', async ({
  page,
}, testInfo) => {
  await testAccount(page, 'ana');
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/cuenta/');
  await page
    .locator('.person-tabs')
    .getByRole('button', { name: 'Mi hogar', exact: true })
    .click();
  const edit = page.locator('.account-profile-actions').getByRole('link', {
    name: 'Editar mi perfil',
    exact: true,
  });
  await expect(edit).toBeVisible();
  for (const width of testInfo.project.name === 'mobile'
    ? [320, 390]
    : [768, 1061, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const top of [0, 300, 700]) {
      await page.evaluate(
        (position) => window.scrollTo({ top: position, behavior: 'instant' }),
        top,
      );
      await separatedHeading(page);
    }
    const primary = await edit.boundingBox();
    const secondary = await page
      .getByRole('button', {
        name: 'Eliminar mi perfil de compatibilidad',
        exact: true,
      })
      .boundingBox();
    expect(
      secondary!.y - (primary!.y + primary!.height),
    ).toBeGreaterThanOrEqual(12);
    await fitsViewport(page);
  }
  await page.locator('.account-profile-actions').screenshot({
    path: `reports/previews/layout-profile-actions-${testInfo.project.name}.png`,
  });
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await page.screenshot({
    path: `reports/previews/layout-account-${testInfo.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    (await new AxeBuilder({ page }).include('.management-page').analyze())
      .violations,
  ).toEqual([]);
  await separatedHeading(page);
  await page.screenshot({
    path: `reports/previews/layout-account-neon-${testInfo.project.name}.png`,
  });
  await edit.click();
  await expect(page).toHaveURL(/\/tu-match\/$/);
  await expect(
    page.getByRole('heading', { name: 'Qué compañero buscás' }),
  ).toBeVisible();
  await fitsViewport(page);
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Ingresar · Mi cuenta', exact: true })
    .click();
  await page
    .locator('.person-tabs')
    .getByRole('button', { name: 'Mi hogar', exact: true })
    .click();
  await expect(edit).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
  await separatedHeading(page);
});

test('admin tabs and expanded animal forms fit small screens and separate controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await testAccount(page, 'sofia');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/');
  await expect(
    page.getByLabel('Organización responsable', { exact: true }),
  ).toBeVisible();
  const tabs = page.getByRole('group', { name: 'Secciones de gestión' });
  for (const width of testInfo.project.name === 'mobile'
    ? [320, 390]
    : [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await tabs.getByRole('button', { name: 'Mascotas', exact: true }).click();
    await page.locator('.admin-list .admin-pet-button').first().click();
    await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
    for (const summary of [
      'Personalidad observada',
      'Actividad, hogar y cuidados',
    ])
      await page.locator('summary').filter({ hasText: summary }).click();
    await fitsViewport(page);
    await page
      .getByRole('heading', { name: 'Convivencia observada' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `reports/previews/layout-admin-form-${testInfo.project.name}-${width}.png`,
    });
    for (const [tab, route] of [
      ['Solicitudes', 'applications'],
      ['Organizaciones', 'organizations'],
      ['Cuentas', 'users'],
      ['Auditoría', 'audit'],
      ['Sistema', 'system/ai'],
    ] as const) {
      const response = page.waitForResponse(
        (item) =>
          item
            .url()
            .includes(
              `/api/v1/${route === 'system/ai' ? route : `admin/${route}`}`,
            ) && item.request().method() === 'GET',
      );
      await tabs.getByRole('button', { name: tab, exact: true }).click();
      expect((await response).ok()).toBeTruthy();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await fitsViewport(page);
      await page.evaluate(() =>
        window.scrollTo({ top: 500, behavior: 'instant' }),
      );
      await separatedHeading(page);
    }
  }
});

test('public pages and forms keep their content within the viewport', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const widths = testInfo.project.name === 'mobile' ? [320, 390] : [768, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/',
      '/adopcion/',
      '/tu-match/',
      '/publicar/',
      '/sumate/',
      '/privacidad/',
    ]) {
      await page.goto(route);
      await expect(page.locator('.theme-toggle:not([disabled])')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await fitsViewport(page);
    }
  }
});

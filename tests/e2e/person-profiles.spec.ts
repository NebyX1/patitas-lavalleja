import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectProductLanguage } from './support/presentation';
import type { Identity } from '../../src/features/auth/profile';

async function choose(page: Page, name: string) {
  const available = await (
    await page.request.get('/api/v1/auth/demo-users')
  ).json();
  test.skip(
    !available.enabled,
    'Requires the explicit local testing fixtures.',
  );
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  const result = await page.request.post('/api/v1/auth/demo-login', {
    data: { user_id: `demo-user-${name}` },
    headers: {
      Origin: 'http://localhost:4321',
      'X-CSRF-Token': session.csrf_token,
    },
  });
  expect(result.status()).toBe(200);
}

test('about me opens a visible editor for creating, cancelling and updating a presentation', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await choose(page, mobile ? 'elena' : 'gabriela');
  const original: Identity = (
    await (await page.request.get('/api/v1/me/dashboard')).json()
  ).identity;
  const fields = [
    'display_name',
    'headline',
    'biography',
    'location',
    'avatar_color',
  ] as const;
  const originalBody = Object.fromEntries(
    fields.map((field) => [field, original[field]]),
  );
  async function updateIdentity(body: Record<string, unknown>) {
    const session = await (
      await page.request.get('/api/v1/auth/session')
    ).json();
    const response = await page.request.patch('/api/v1/me/identity', {
      headers: {
        Origin: 'http://localhost:4321',
        'X-CSRF-Token': session.csrf_token,
      },
      data: body,
    });
    expect(response.status()).toBe(200);
  }
  try {
    await updateIdentity({ ...originalBody, headline: '', biography: '' });
    await page.goto('/cuenta/');
    const about = page.locator('.profile-about');
    const create = about.getByRole('button', {
      name: 'Completar mi información',
      exact: true,
    });
    await expect(about).toContainText('Todavía no agregaste una presentación');
    await create.click();
    const form = page.locator('.profile-editor');
    const title = form.getByRole('heading');
    await expect(title).toHaveText('Creá tu presentación');
    await expect(title).toBeFocused();
    const headingBox = await title.boundingBox();
    const navBox = await page.locator('.nav').boundingBox();
    expect(headingBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height);
    expect(headingBox!.y).toBeLessThan(page.viewportSize()!.height - 60);
    await form
      .getByLabel('Acerca de mí', { exact: true })
      .fill('Este borrador se descarta al cancelar.');
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(create).toBeFocused();
    await expect(about).not.toContainText('Este borrador');
    await create.click();
    await expect(form.getByLabel('Acerca de mí', { exact: true })).toHaveValue(
      '',
    );
    const name = mobile ? 'Elena Prueba' : 'Gabriela Prueba';
    const biography =
      'Me gusta compartir paseos tranquilos.\nBusco una nueva compañía para mi hogar.';
    await form.getByLabel('Nombre o alias').fill(name);
    await form
      .getByLabel('Una frase sobre vos')
      .fill('Tiempo, cariño y una historia por empezar.');
    await form.getByLabel('Acerca de mí', { exact: true }).fill(biography);
    await form.getByRole('radio', { name: 'Lavanda', exact: true }).check();
    await form
      .getByRole('button', { name: 'Guardar mi presentación', exact: true })
      .click();
    await expect(page.locator('.profile-feedback')).toContainText(
      'Guardamos tu presentación',
    );
    const edit = about.getByRole('button', {
      name: 'Editar mi información',
      exact: true,
    });
    await expect(edit).toBeFocused();
    await expect(about.locator('p')).toHaveText(biography);
    await expect(page.locator('.nav-account')).toHaveAttribute(
      'aria-label',
      `Mi cuenta: ${name}`,
    );
    await page.reload();
    await expect(about.locator('p')).toHaveText(biography);
    await edit.click();
    await expect(title).toHaveText('Tu presentación');
    await expect(form.getByLabel('Nombre o alias')).toHaveValue(name);
    await expect(form.getByLabel('Acerca de mí', { exact: true })).toHaveValue(
      biography,
    );
    for (const width of mobile ? [320, 390] : [768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await edit.click();
    expect(
      (await new AxeBuilder({ page }).include('.profile-dashboard').analyze())
        .violations,
    ).toEqual([]);
    await expectProductLanguage(form);
    await page.screenshot({
      path: `reports/previews/about-me-editor-${testInfo.project.name}.png`,
    });
    await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
    await edit.click();
    expect(
      (await new AxeBuilder({ page }).include('.profile-dashboard').analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `reports/previews/about-me-editor-neon-${testInfo.project.name}.png`,
    });
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(edit).toBeFocused();
    await about.screenshot({
      path: `reports/previews/about-me-card-neon-${testInfo.project.name}.png`,
    });
  } finally {
    await updateIdentity(originalBody);
  }
});

test('personal presentation persists and the profile exposes household, favorites and requests', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await choose(page, mobile ? 'diego' : 'ana');
  await page.goto('/cuenta/');
  await expect(
    page.getByRole('heading', { name: mobile ? 'Diego' : 'Ana', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.person-hero')).toBeVisible();
  await expect(
    page.getByLabel('Entrar como usuario de prueba'),
  ).not.toBeVisible();
  const dashboard = await (
    await page.request.get('/api/v1/me/dashboard')
  ).json();
  const original = dashboard.identity;
  const initialFavorites = dashboard.favorites.length;
  let removedFavorite: string | null = null;
  try {
    await page
      .getByRole('button', { name: 'Editar presentación', exact: true })
      .click();
    await page
      .getByLabel('Una frase sobre vos')
      .fill(`Paseos, compañía y nuevas historias · ${testInfo.project.name}`);
    await page
      .getByLabel('Acerca de mí')
      .fill(
        'Presentación ficticia para verificar que este perfil se puede editar y conservar entre visitas.',
      );
    await page.getByRole('radio', { name: 'Lavanda', exact: true }).check();
    await page
      .getByRole('button', { name: 'Guardar mi presentación', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Guardamos tu presentación' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('.person-identity > p')).toContainText(
      'Paseos, compañía y nuevas historias',
    );
    await expect(page.locator('.person-avatar').first()).toHaveClass(
      /avatar-lilac/,
    );
    await page
      .locator('.person-tabs')
      .getByRole('button', { name: 'Mi hogar', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Tu hogar y tu rutina', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.household-facts')).toContainText(
      mobile ? '25 min al día' : '35 min al día',
    );
    await page
      .locator('.person-tabs')
      .getByRole('button', { name: 'Favoritos', exact: true })
      .click();
    await expect(page.locator('.profile-pet-grid .pet-card')).toHaveCount(
      initialFavorites,
    );
    if (initialFavorites > 0) {
      removedFavorite = await page
        .locator('.profile-pet-grid .pet-card')
        .first()
        .getAttribute('data-card');
      const removed = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/me/favorites/${removedFavorite}`) &&
          response.request().method() === 'DELETE',
      );
      await page
        .locator('.profile-pet-grid .pet-card .fav-button')
        .first()
        .click();
      expect((await removed).status()).toBe(200);
      await expect(page.locator('.profile-pet-grid .pet-card')).toHaveCount(
        initialFavorites - 1,
      );
    } else {
      await expect(page.locator('.profile-empty')).toContainText(
        'Las historias que guardes van a encontrarse acá.',
      );
    }
    await expect(
      page.locator('.profile-stat-grid > div').first().locator('strong'),
    ).toHaveText(String(Math.max(0, initialFavorites - 1)));
    await page
      .locator('.person-tabs')
      .getByRole('button', { name: /^Solicitudes/ })
      .click();
    await expect(
      page.getByRole('heading', {
        name: mobile ? 'Tu encuentro con Nori' : 'Tu encuentro con Brisa',
      }),
    ).toBeVisible();
    await page
      .locator('.person-tabs')
      .getByRole('button', { name: 'Resumen', exact: true })
      .click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `reports/previews/person-profile-${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('.profile-dashboard').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      (await new AxeBuilder({ page }).include('.profile-dashboard').analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `reports/previews/person-profile-neon-${testInfo.project.name}.png`,
      fullPage: true,
    });
  } finally {
    const session = await (
      await page.request.get('/api/v1/auth/session')
    ).json();
    const restored = await page.request.patch('/api/v1/me/identity', {
      headers: {
        Origin: 'http://localhost:4321',
        'X-CSRF-Token': session.csrf_token,
      },
      data: Object.fromEntries(
        [
          'display_name',
          'headline',
          'biography',
          'location',
          'avatar_color',
        ].map((key) => [key, original[key]]),
      ),
    });
    expect(restored.status()).toBe(200);
    if (removedFavorite) {
      const restoredFavorite = await page.request.post('/api/v1/me/favorites', {
        headers: {
          Origin: 'http://localhost:4321',
          'X-CSRF-Token': session.csrf_token,
        },
        data: { pet_id: removedFavorite },
      });
      expect(restoredFavorite.status()).toBe(201);
    }
  }
});

test('responsible evaluates an applicant with local AI and the applicant sees the saved report', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await choose(page, 'lucia');
  await page.goto('/admin/#solicitudes');
  const card = page
    .locator('article.management-card')
    .filter({ has: page.getByRole('heading', { name: 'Brisa', exact: true }) });
  await expect(card).toBeVisible();
  await card
    .getByRole('button', { name: 'Ver perfil del solicitante', exact: true })
    .click();
  await expect(
    card.getByRole('heading', { name: 'Ana', exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (item) =>
      item
        .url()
        .endsWith(
          '/api/v1/admin/applications/demo-application-ana/compatibility',
        ) && item.request().method() === 'POST',
  );
  await card
    .getByRole('button', {
      name: /Evaluar compatibilidad con IA|Actualizar evaluación/,
    })
    .click();
  const result = await response;
  expect(result.status()).toBe(200);
  const report = await result.json();
  expect(['favorable', 'review_required']).toContain(report.decision);
  expect(report.match.home_score).toBeGreaterThan(0);
  expect(report.match.preference_score).toBeGreaterThan(0);
  await expect(card.getByLabel('Informe de compatibilidad')).toBeVisible();
  await card
    .getByRole('button', { name: 'Ver explicación y puntos a conversar' })
    .click();
  await expect(
    card.getByRole('heading', { name: 'Afinidades observadas' }),
  ).toBeVisible();
  await expectProductLanguage(card.getByLabel('Informe de compatibilidad'));
  await card.getByLabel('Informe de compatibilidad').screenshot({
    path: `reports/previews/application-assessment-${testInfo.project.name}.png`,
  });
  expect(
    (await new AxeBuilder({ page }).include('.application-review').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const applications = (
    await (await page.request.get('/api/v1/admin/applications')).json()
  ).items;
  expect(
    applications.find(
      (item: { id: string }) => item.id === 'demo-application-ana',
    ).status,
  ).toBe('under_review');
  await choose(page, 'ana');
  await page.goto('/cuenta/');
  await page
    .locator('.person-tabs')
    .getByRole('button', { name: /^Solicitudes/ })
    .click();
  await expect(page.getByLabel('Informe de compatibilidad')).toBeVisible();
  await expect(page.getByLabel('Informe de compatibilidad')).toContainText(
    'Hogar → Animal',
  );
  await expect(page.getByLabel('Informe de compatibilidad')).toContainText(
    'Animal → Persona',
  );
});

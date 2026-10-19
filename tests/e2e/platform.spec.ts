import { test, expect } from '@playwright/test';
import path from 'node:path';
import type { Page } from '@playwright/test';

async function openPasswordAccess(page: Page) {
  const configuration = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/demo-users'),
  );
  await page.goto('/login/');
  const testing = await (await configuration).json();
  if (testing.enabled && testing.items.length)
    await page
      .getByRole('button', { name: 'Usar correo y contraseña' })
      .click();
}

async function authorizedRequest(
  page: Page,
  route: string,
  method = 'GET',
  data?: unknown,
) {
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  return page.request.fetch(`/api/v1${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:4321',
      'X-CSRF-Token': session.csrf_token,
    },
    ...(data === undefined ? {} : { data }),
  });
}

test('API failures remain visible and unknown profiles return a real 404', async ({
  page,
  request,
}) => {
  await page.route('**/api/v1/pets?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'temporarily_unavailable',
          message: 'El catálogo necesita un momento.',
        },
      }),
    }),
  );
  await page.goto('/adopcion/');
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos completar la operación. Volvé a intentar en unos minutos.',
  );
  await expect(page.locator('.pet-card')).toHaveCount(0);
  const absent = await request.get('/mascotas/no-such-published-profile/');
  expect(absent.status()).toBe(404);
  expect(await absent.text()).toContain('Esta historia no está publicada.');
  const oversized = await request.post('/api/v1/auth/login', {
    data: { email: 'x'.repeat(66 * 1024) },
    headers: { Origin: 'http://localhost:4321' },
  });
  expect(oversized.status()).toBe(413);
  expect((await oversized.json()).error.code).toBe('payload_too_large');
  await page.goto('/cuenta/#reset_token=not-a-real-reset-token-for-ui-check');
  await expect(
    page.getByRole('heading', { name: 'Elegí una nueva contraseña.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(
    page.getByLabel('Contraseña de al menos 12 caracteres'),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('account registration, persistent favorites, optional profile saving and CSRF protection', async ({
  page,
}) => {
  const email = `adopter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.test`;
  await openPasswordAccess(page);
  await page
    .getByRole('button', { name: 'Crear mi cuenta', exact: true })
    .first()
    .click();
  await page.getByLabel('Tu nombre o alias').fill('Alex de prueba');
  await page.getByLabel('Correo electrónico').fill(email);
  await page
    .getByLabel('Contraseña de al menos 12 caracteres')
    .fill(`Test-account-${crypto.randomUUID()}!`);
  await page.getByRole('checkbox').check();
  await page
    .locator('form')
    .getByRole('button', { name: 'Crear mi cuenta', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Alex de prueba', exact: true }),
  ).toBeVisible();
  await page.goto('/adopcion/');
  await page
    .getByRole('button', { name: 'Guardar a Milo en favoritos' })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Historia guardada en tu cuenta.' }),
  ).toBeVisible();
  await page.goto('/favoritos/');
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.pet-card')).toContainText('Milo');
  const denied = await page.request.put('/api/v1/me/profile', {
    data: { species: ['dog'] },
    headers: { Origin: 'http://localhost:4321' },
  });
  expect(denied.status()).toBe(403);
  await page.goto('/tu-match/');
  await page.getByRole('button', { name: /Un perro/ }).click();
  for (let step = 0; step < 6; step++)
    await page.getByRole('button', { name: 'Seguimos' }).click();
  await page
    .getByRole('button', { name: 'Guardar mi perfil para otra visita' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Perfil guardado en tu cuenta' }),
  ).toBeVisible();
  await page.goto('/cuenta/');
  await page
    .locator('.person-tabs')
    .getByRole('button', { name: 'Mi hogar', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tu hogar y tu rutina', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Eliminar mi perfil de compatibilidad' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Eliminamos tu perfil' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(
    page.getByRole('heading', { name: 'Tu cuenta. Tu próxima historia.' }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/v1/auth/session')).json())
      .authenticated,
  ).toBe(false);
});

test('mobile catalog displays one card per row', async ({ page, isMobile }) => {
  await page.goto('/adopcion/');
  const cards = page.locator('.pet-card');
  await expect(cards).not.toHaveCount(0);
  if (isMobile) {
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first && second && second.y >= first.y + first.height).toBeTruthy();
  }
  await page
    .getByRole('button', { name: 'Otras especies', exact: true })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Lila');
  await page
    .getByRole('button', { name: 'Todas las patitas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('button', { name: /^Convivencia/ }).click();
  await page.getByRole('option', { name: 'Otros gatos', exact: true }).click();
  await page
    .getByRole('button', { name: /^Evaluación de convivencia/ })
    .click();
  await page
    .getByRole('option', {
      name: 'Compatible según observaciones',
      exact: true,
    })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Milo');
  await page.getByRole('button', { name: /^Convivencia/ }).click();
  const combined = page.waitForResponse((response) =>
    response.url().includes('compatibility_categories=cats%2Cyoung_children'),
  );
  await page
    .getByRole('option', { name: 'Niños pequeños', exact: true })
    .click();
  expect((await combined).ok()).toBe(true);
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('Probemos por otro camino.')).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Quitar filtro Convivencia: Niños pequeños',
      exact: true,
    })
    .click();
  await expect(cards).toHaveCount(1);
  if (isMobile) {
    await page.getByRole('button', { name: /^Filtros/ }).click();
    await cards.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'reports/previews/intelligence-catalog-mobile.png',
      fullPage: false,
    });
  }
});

test('authorized publication, WebP photos, dynamic pages, real applications and withdrawal', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  test.skip(
    !adminEmail || !adminPassword,
    'Requires an explicitly provisioned local test administrator.',
  );
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const orgName = `[PRUEBA TÉCNICA] Organización ${suffix}`;
  const petName = `[PRUEBA TÉCNICA] Pepita ${suffix}`;
  let petId = '';
  let orgId = '';
  let adopterId = '';
  await openPasswordAccess(page);
  await page.getByLabel('Correo electrónico').fill(adminEmail!);
  await page.getByLabel('Contraseña', { exact: true }).fill(adminPassword!);
  await page
    .locator('form')
    .getByRole('button', { name: 'Ingresar', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  try {
    await page.goto('/admin/');
    await page
      .getByRole('button', { name: 'Organizaciones', exact: true })
      .click();
    await page.getByLabel('Nombre', { exact: true }).fill(orgName);
    await page
      .getByLabel('Presentación', { exact: true })
      .fill(
        'Registro técnico sintético exclusivamente para verificar el entorno local. No representa una protectora real.',
      );
    await page.getByLabel('Localidad', { exact: true }).fill('Minas');
    const orgCreated = page.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/organizations') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Guardar organización' }).click();
    const orgResponse = await orgCreated;
    expect(orgResponse.ok()).toBe(true);
    orgId = (await orgResponse.json()).id;
    await page.goto('/publicar/');
    await page.getByLabel('Nombre de la mascota').fill(petName);
    await page
      .getByRole('button', { name: /^Organización responsable/ })
      .click();
    await page.getByRole('option', { name: orgName, exact: true }).click();
    await page
      .getByLabel('Edad o edad estimada', { exact: true })
      .fill('Aproximadamente 2 años');
    await page.getByLabel('Edad estimada en meses').fill('24');
    await page.getByLabel('Etapa de vida').selectOption('adult');
    await page.getByLabel('Tamaño', { exact: true }).selectOption('Pequeño');
    await page.getByLabel('Sexo', { exact: true }).selectOption('Hembra');
    await page.getByLabel('Energía observada (1 a 5)').fill('2');
    await page.getByLabel('Localidad', { exact: true }).fill('Minas');
    await page
      .getByLabel('Su historia y sus necesidades')
      .fill(
        'Ficha sintética para verificar creación, aprobación, renderizado dinámico y solicitud. No representa una mascota real.',
      );
    await page
      .getByLabel('Necesidades y cuidados importantes')
      .fill(
        'Escenario técnico de prueba. Revisión humana antes de cualquier contacto.',
      );
    await page
      .getByLabel('Una frase que describa su personalidad')
      .fill('Una historia ficticia para comprobar el sistema local.');
    await page
      .getByLabel('Rasgos observados, separados por comas')
      .fill('Tranquilo, Cariñoso');
    await page
      .getByLabel('Fotografías (hasta 6)')
      .setInputFiles(path.resolve('public/images/pets/milo-480.webp'));
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Revisar mi ficha' }).click();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/pets') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Guardar y enviar a revisión' })
      .click();
    const createdResponse = await created;
    expect(createdResponse.ok()).toBe(true);
    petId = (await createdResponse.json()).id;
    await expect(page.getByText('Ficha enviada a revisión')).toBeVisible();
    expect((await page.request.get(`/mascotas/${petId}/`)).status()).toBe(404);
    await page.goto('/admin/');
    await page
      .locator('.admin-pet-button')
      .filter({ hasText: petName })
      .click();
    await page.getByRole('button', { name: 'Aprobar publicación' }).click();
    await expect(
      page.getByRole('link', { name: 'Ver ficha pública' }),
    ).toBeVisible();
    const publicResponse = await page.request.get(`/mascotas/${petId}/`);
    expect(publicResponse.status()).toBe(200);
    expect(await publicResponse.text()).toContain(petName);
    const publicPet = await (
      await page.request.get(`/api/v1/pets/${petId}`)
    ).json();
    expect(publicPet.photos[0].variants.card.url).toContain('/api/v1/media/');
    expect(
      (await page.request.get(publicPet.photos[0].variants.card.url)).headers()[
        'content-type'
      ],
    ).toContain('image/webp');
    if (testInfo.project.name === 'desktop') {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: 'reports/previews/intelligence-admin-desktop.png',
        fullPage: true,
      });
    }
    const adopter = await browser.newContext({
      baseURL: 'http://localhost:4321',
    });
    try {
      const adopterPage = await adopter.newPage();
      const session = await (
        await adopterPage.request.get('/api/v1/auth/session')
      ).json();
      const registered = await adopterPage.request.post(
        '/api/v1/auth/register',
        {
          headers: {
            Origin: 'http://localhost:4321',
            'X-CSRF-Token': session.csrf_token,
          },
          data: {
            email: `application-${suffix}@example.test`,
            password: `E2E-${crypto.randomUUID()}!`,
            display_name: 'Adoptante de prueba técnica',
          },
        },
      );
      expect(registered.ok()).toBe(true);
      adopterId = (
        await (await adopterPage.request.get('/api/v1/auth/session')).json()
      ).user.id;
      await adopterPage.goto(`/solicitud/${petId}/`);
      expect(
        await adopterPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await adopterPage
        .getByLabel('Contanos un poquito de tu hogar')
        .fill(
          'Solicitud sintética exclusivamente para verificar el flujo técnico de la aplicación local.',
        );
      await adopterPage.getByRole('checkbox').check();
      await adopterPage
        .getByRole('button', {
          name: `Enviar solicitud para conocer a ${petName}`,
        })
        .click();
      await expect(
        adopterPage.getByText('Solicitud recibida', { exact: true }),
      ).toBeVisible();
      await adopterPage.goto('/login/');
      await expect(
        adopterPage.getByRole('link', { name: petName, exact: true }),
      ).toBeVisible();
      if (testInfo.project.name === 'desktop')
        await adopterPage.screenshot({
          path: 'reports/previews/intelligence-account-desktop.png',
          fullPage: true,
        });
    } finally {
      await adopter.close();
    }
    const withdrawn = await authorizedRequest(
      page,
      `/admin/pets/${petId}/status`,
      'PATCH',
      { status: 'withdrawn', note: 'Finalizó la prueba técnica local.' },
    );
    expect(withdrawn.ok()).toBe(true);
    const list = await (
      await page.request.get(
        `/api/v1/pets?query=${encodeURIComponent(petName)}`,
      )
    ).json();
    expect(list.total).toBe(0);
    await page.reload();
    await page
      .getByRole('button', { name: 'Solicitudes', exact: true })
      .click();
    await expect(page.locator('.management-panel')).toContainText(petName);
  } finally {
    testInfo.setTimeout(testInfo.timeout + 15000);
    if (petId) await authorizedRequest(page, `/admin/pets/${petId}`, 'DELETE');
    if (orgId)
      await authorizedRequest(page, `/admin/organizations/${orgId}`, 'PUT', {
        name: orgName,
        description:
          'Registro técnico de integración finalizado. Sin actividad real.',
        locality: 'Minas',
        department: 'Lavalleja',
        active: false,
      });
    if (adopterId)
      await authorizedRequest(page, `/admin/users/${adopterId}`, 'PATCH', {
        active: false,
      });
  }
});

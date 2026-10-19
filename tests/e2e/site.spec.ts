import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseTestUser } from './support/session';

async function pickFormOption(page: Page, field: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`^${field}`) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('catalog, client routing, tabs and persistent favorites', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/adopcion/');
  await expect(page.locator('.pet-card')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Gatos', exact: true }).click();
  await expect(page.locator('.pet-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await pickFormOption(page, 'Disponibilidad', 'Todos los estados publicados');
  await page
    .getByRole('searchbox', { name: 'Buscar por nombre o personalidad' })
    .fill('SIMON');
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Guardar a Simón en favoritos' })
    .click();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__routingSentinel = 'alive';
  });
  await page.getByRole('link', { name: /Conocer a Simón/ }).click();
  await expect(page).toHaveURL(/\/mascotas\/simon\/$/);
  await expect(
    page.getByRole('heading', { name: 'Simón', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__routingSentinel,
    ),
  ).toBe('alive');
  await page.getByRole('tab', { name: 'Así soy' }).click();
  await expect(page.getByText('Mi energía · 4/5')).toBeVisible();
  await page.getByRole('tab', { name: 'Así soy' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mis cuidados' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('.nav-fav').click();
  await expect(page).toHaveURL(/\/favoritos\/$/);
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Quitar a Simón de favoritos' })
    .click();
  await expect(page.getByText('Todavía hay mucho por querer.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('night theme and motion survive navigation and reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Pausar movimiento' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('link', { name: 'Conocé a tu próximo amigo' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('match quiz gives usable results and can be restarted', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await chooseTestUser(page, 'ana');
  await page.goto('/tu-match/');
  await expect(page.getByText('Pregunta 1 de 7')).toBeVisible();
  await page.getByRole('button', { name: /Un perro/ }).click();
  await page.getByRole('button', { name: /^Mayor/ }).click();
  await page.getByRole('button', { name: 'Seguimos' }).click();
  await page.getByRole('button', { name: /Una tarde sin apuro/ }).click();
  await page
    .getByLabel('Minutos diarios disponibles para paseos o juegos')
    .fill('45');
  await page.getByLabel('Horas aproximadas fuera del hogar').fill('4');
  await page.getByRole('button', { name: 'Seguimos' }).click();
  await page.getByRole('button', { name: /^Casa/ }).click();
  await page.getByRole('button', { name: /^Sí/ }).click();
  await page.getByRole('button', { name: 'Seguimos' }).click();
  await page.getByRole('button', { name: 'Seguimos' }).click();
  await page.getByRole('button', { name: /^Tengo experiencia/ }).click();
  await page
    .getByRole('button', { name: /^Puedo acompañar una adaptación/ })
    .click();
  await page.getByRole('button', { name: /^Puedo acompañarlos/ }).click();
  await page.getByRole('button', { name: 'Seguimos' }).click();
  await page.getByRole('button', { name: 'Tranquilidad', exact: true }).click();
  await page.getByRole('button', { name: 'Seguimos' }).click();
  const evaluated = page.waitForResponse(
    (response) =>
      response.url().includes('/matches/search') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Ver mis afinidades' }).click();
  const completedSearch = await evaluated;
  expect(completedSearch.ok()).toBe(true);
  await expect(page.locator('.quiz-result-card').first()).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator('.quiz-page')).toContainText('Coco');
  await expect(page.locator('.quiz-page')).toContainText('Índice orientativo');
  if (testInfo.project.name === 'desktop') {
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: 'reports/previews/intelligence-matching-desktop.png',
      fullPage: false,
    });
  }
  await page.getByRole('button', { name: 'Volver a empezar' }).click();
  await expect(page.getByText('Pregunta 1 de 7')).toBeVisible();
});

test('publishing requires a real authorized account before collecting pet data', async ({
  page,
}) => {
  const submitted: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') submitted.push(request.url());
  });
  await page.goto('/publicar/');
  await expect(
    page.getByRole('link', { name: 'Ingresar o crear una cuenta' }),
  ).toBeVisible();
  await expect(page.getByLabel('Nombre de la mascota')).toHaveCount(0);
  expect(submitted).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'prueba@example.com',
  );
});

test('content and metadata are present without JavaScript', async ({
  browser,
  isMobile,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: isMobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/adopcion/');
  await expect(page.locator('.pet-card')).not.toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://patitas.lavalleja.uy/adopcion/',
  );
  await page.getByRole('link', { name: /Conocer a Milo/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Milo', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Soy Milo y tengo una teoría/)).toBeVisible();
  await context.close();
});

test('hero, editorial stories, zoom and browser history remain usable', async ({
  page,
  isMobile,
}) => {
  let phase = 'hero';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${phase}: ${error.message}`));
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver siguiente mascota' }).click();
  await expect(page.locator('.hello-bubble')).toContainText('Luna');
  await page.locator('#historias').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Siguiente historia' }).click();
  await expect(page.locator('#story-title')).toContainText('Un rayo de sol.');
  await page.getByRole('button', { name: 'Pausar movimiento' }).click();
  phase = 'navigate-to-profile';
  await page.getByRole('link', { name: 'Conocer a Luna', exact: true }).click();
  await expect(page).toHaveURL(/\/mascotas\/luna\/$/);
  phase = 'zoom';
  await page.getByRole('button', { name: 'Ampliar fotografía' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/locked/);
  phase = 'back';
  await page.goBack();
  await expect(page).toHaveURL('http://localhost:4321/');
  if (isMobile) {
    phase = 'menu';
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Navegación móvil' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Abrir menú' }),
    ).toHaveAttribute('aria-expanded', 'false');
  }
  expect(errors).toEqual([]);
});

test('fictional adoption profiles are blocked and volunteer demos remain explicit', async ({
  page,
}) => {
  await page.goto('/solicitud/milo/');
  await expect(
    page.getByRole('heading', { name: 'Esta historia es de muestra.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Contanos un poquito de tu hogar')).toHaveCount(
    0,
  );
  await page.goto('/sumate/?tipo=volunteer');
  await expect(
    page.getByRole('button', { name: 'Voluntariado', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Tu nombre', { exact: true }).fill('Alex');
  await page
    .getByLabel('Correo de contacto', { exact: true })
    .fill('alex@example.com');
  await pickFormOption(page, 'Localidad', 'Minas');
  await page
    .getByLabel('¿Cómo te gustaría ayudar?')
    .fill('Me gustaría colaborar sacando fotos.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Probar el siguiente paso' }).click();
  await expect(
    page.getByText(/No se envió, guardó ni publicó ningún dato/),
  ).toBeVisible();
});

test('system preferences and unavailable storage have working fallbacks', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  await page.goto('/adopcion/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await page
    .getByRole('button', { name: 'Guardar a Milo en favoritos' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Quitar a Milo de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.nav-fav').click();
  await expect(page.locator('.pet-card')).toHaveCount(1);
  await expect(page.locator('.pet-card')).toContainText('Milo');
});

test('static SEO endpoints and unique canonical pages are correct', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain(
    'Sitemap: https://patitas.lavalleja.uy/sitemap-index.xml',
  );
  expect(await (await request.get('/llms.txt')).text()).toContain(
    'Las fichas marcadas como demostración son ficticias',
  );
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('https://patitas.lavalleja.uy/tu-match/');
  const petSitemap = await (await request.get('/sitemap-pets.xml')).text();
  expect(petSitemap).not.toContain('/mascotas/milo/');
  const fictional = await request.get('/mascotas/milo/');
  expect(await fictional.text()).toContain('noindex,follow');
  expect(sitemap).not.toContain('/solicitud/');
  expect(sitemap).not.toContain('/favoritos/');
});

test('light and neon layouts are accessible and fit the viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar movimiento' }).click();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/home-${testInfo.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
});

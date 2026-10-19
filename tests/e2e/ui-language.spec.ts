import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pets } from '../../src/data/pets';
import type { MatchResults } from '../../src/features/match/profile';
import { chooseTestUser } from './support/session';
import {
  expectProductLanguage,
  implementationDetails,
} from './support/presentation';

test('public pages and discovery text describe the service without its implementation', async ({
  page,
  request,
}) => {
  for (const path of [
    '/',
    '/adopcion/',
    '/sobre-patitas/',
    '/privacidad/',
    '/login/',
  ]) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expectProductLanguage(page);
  }
  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).not.toMatch(implementationDetails);
});

test('limited search results explain their scope without exposing diagnostic warnings', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  const result: MatchResults = {
    results: [
      {
        pet: pets[0],
        match: {
          eligibility: 'needs_review',
          home_score: 80,
          preference_score: 70,
          structured_score: 77,
          confidence: 0.8,
          completeness: 0.8,
          positive: ['Tu rutina ofrece tiempo de compañía.'],
          attention: ['Conversar sobre la adaptación.'],
          unknown: [],
          hard_rules: [],
          rules_version: 'internal-2026',
        },
      },
    ],
    meta: {
      degraded: true,
      warnings: [
        'Bekko OpenVINO no disponible; Horizon ONNX falló. LanceDB usa SQLite BM25.',
      ],
      components: {
        embedding: 'unavailable',
        reranker: 'disabled',
        vector: 'unavailable',
      },
    },
  };
  await page.route('**/api/v1/matches/search', (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto('/tu-match/');
  await page
    .getByRole('button', { name: 'Buscar con mi perfil guardado' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectProductLanguage(page.getByRole('dialog'));
  await expect(page.locator('.match-result')).toBeVisible();
  await expect(
    page.getByText('La orientación es parcial.', { exact: false }),
  ).toBeVisible();
  await page.locator('.match-result-details summary').click();
  await expect(page.locator('.match-result-details')).toContainText(
    'Tu rutina ofrece tiempo de compañía.',
  );
  await expectProductLanguage(page);
});

test('management shows service states and readable activity without internal diagnostics', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'sofia');
  await page.route('**/api/v1/system/ai', (route) =>
    route.fulfill({
      json: {
        models: {
          bekko: {
            enabled: true,
            ready: true,
            state: 'ready',
            backend: 'OpenVINO CPU',
          },
          horizon: {
            enabled: true,
            ready: false,
            state: 'error',
            backend: 'ONNX',
            error: 'Horizon ONNX weights missing in private model_cache',
          },
        },
        index: { backend: 'LanceDB SQLite' },
        cpu_only: true,
      },
    }),
  );
  await page.route('**/api/v1/system/index', (route) =>
    route.fulfill({
      json: {
        events: { pending: 2, processed: 5, private_backend_state: 1 },
        rules_versions: ['internal-2026'],
        source_of_truth: 'sqlite',
        jobs: [
          {
            id: 'maintenance-1',
            kind: 'index_rebuild',
            status: 'failed',
            error: 'LanceDB SQLAlchemy backend exception',
            updated_at: '2026-10-19T00:00:00Z',
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/system/index/rebuild', (route) =>
    route.fulfill({
      status: 202,
      json: {
        job_id: 'Bekko-private-job',
        status: 'queued',
      },
    }),
  );
  await page.route('**/api/v1/admin/audit?*', (route) =>
    route.fulfill({
      json: {
        pages: 1,
        items: [
          {
            id: 1,
            actor_id: 'admin',
            action: 'index.rebuild_requested',
            resource_id: 'maintenance-1',
            created_at: '2026-10-19T00:00:00Z',
            detail: { diagnostic: 'Bekko Horizon LanceDB OpenVINO ONNX' },
          },
          {
            id: 2,
            actor_id: 'admin',
            action: 'pet.availability_changed',
            resource_id: 'animal-1',
            created_at: '2026-10-19T00:00:00Z',
            detail: {
              status: 'reserved',
              note: 'Encuentro coordinado con la familia.',
            },
          },
          {
            id: 3,
            actor_id: null,
            action: 'OpenVINO.backend_exception',
            resource_id: 'maintenance-1',
            created_at: '2026-10-19T00:00:00Z',
            detail: { traceback: 'SQLAlchemy SQLite LanceDB' },
          },
        ],
      },
    }),
  );
  await page.goto('/admin/');
  const tabs = page.getByRole('group', { name: 'Secciones de gestión' });
  await tabs.getByRole('button', { name: 'Sistema', exact: true }).click();
  await expect(
    page.getByText('Comprensión de preferencias', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Evaluación de afinidades', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Esta función necesita atención.', { exact: false }),
  ).toBeVisible();
  await expectProductLanguage(page);
  await page
    .getByRole('button', { name: 'Actualizar fichas de búsqueda' })
    .click();
  await expect(
    page.locator('.management-panel').getByRole('status'),
  ).toContainText('Actualización de búsqueda solicitada');
  await expectProductLanguage(page);
  expect(
    (await new AxeBuilder({ page }).include('.management-panel').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `reports/previews/product-language-system-${testInfo.project.name}.png`,
  });
  await tabs.getByRole('button', { name: 'Auditoría', exact: true }).click();
  await expect(
    page.getByRole('cell', {
      name: 'Actualización de búsqueda solicitada',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: /Disponibilidad actualizada/ }),
  ).toContainText('Encuentro en proceso');
  await expect(
    page.getByRole('cell', { name: /Disponibilidad actualizada/ }),
  ).toContainText('Encuentro coordinado con la familia.');
  await expect(
    page.getByRole('cell', {
      name: 'Actividad de gestión registrada',
      exact: true,
    }),
  ).toBeVisible();
  await expectProductLanguage(page);
});

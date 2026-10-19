import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PersonalAssessment } from '../../src/features/auth/profile';
import { chooseTestUser } from './support/session';
import { expectProductLanguage } from './support/presentation';

const petId = 'demo-animal-01-07';
const petPath = `/mascotas/${petId}/`;
const endpoint = `**/api/v1/me/pets/${petId}/compatibility`;
// An immediate, structured-only response verifies presentation timing without
// claiming this fixture performs inference. Real inference is covered separately.
const report: PersonalAssessment = {
  pet_id: petId,
  pet_version: 1,
  created_at: '2026-10-19T00:00:00Z',
  profile_updated_at: '2026-10-19T00:00:00Z',
  decision: 'incompatible',
  label: 'Incompatibilidades observadas',
  summary: 'Escenario técnico para comprobar la presentación del informe.',
  notice: 'Orientación de prueba, sin decisión de adopción.',
  conversation_points: [],
  availability: {
    publication_status: 'published',
    adoption_status: 'available',
  },
  meta: {
    degraded: true,
    warnings: [
      'Bekko OpenVINO no disponible. Horizon ONNX desactivado; LanceDB usa SQLite BM25.',
    ],
    components: {
      structured: 'ready',
      embedding: 'not_used',
      reranker: 'not_used',
      vector: 'not_used',
    },
  },
  match: {
    eligibility: 'blocked',
    home_score: 40,
    preference_score: 80,
    structured_score: 52,
    confidence: 1,
    completeness: 1,
    positive: [],
    attention: [],
    unknown: [],
    hard_rules: [],
    rules_version: 'test',
  },
};

test('a fast compatibility report keeps the animation before revealing both directions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseTestUser(page, 'ana');
  await page.route(endpoint, (route) => route.fulfill({ json: report }));
  await page.goto(petPath);
  const start = Date.now();
  await page
    .getByRole('button', { name: 'Analizar compatibilidad', exact: true })
    .click();
  const dialog = page.locator('.match-processing-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Tu mundo y el de Nube.');
  await expectProductLanguage(dialog);
  await expect(dialog.locator('[data-stage="embedding"]')).toHaveAttribute(
    'data-state',
    'not_used',
  );
  await expect(dialog.locator('[data-stage="reranker"]')).toHaveAttribute(
    'data-state',
    'not_used',
  );
  await expect(page.getByLabel('Informe de compatibilidad')).toHaveCount(0);
  await expect(dialog).toHaveClass(/is-complete/);
  await expect(dialog).toContainText('Ya tenemos tu análisis.');
  const result = page.getByLabel('Informe de compatibilidad');
  await expect(result).toBeVisible();
  expect(Date.now() - start).toBeGreaterThanOrEqual(2900);
  await expect(result).toContainText('Hogar → Animal');
  await expect(result).toContainText('Animal → Persona');
  await expect(result).toContainText('Orientación inicial');
  await expect(page.locator('.pet-compatibility-result')).toBeFocused();
  await result
    .getByRole('button', { name: 'Ver explicación y puntos a conversar' })
    .click();
  await expect(result).toContainText('La orientación es parcial');
  await expectProductLanguage(result);
  await expect(page.locator('body')).not.toHaveClass(/locked/);
  // Cancellation also works after the response arrived, during its visual hold.
  await page
    .getByRole('button', { name: 'Actualizar análisis', exact: true })
    .click();
  await expect(dialog.locator('[data-stage="ranking"]')).toHaveAttribute(
    'data-state',
    'complete',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3200);
  await expect(page.getByLabel('Informe de compatibilidad')).toHaveCount(0);
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Analizar compatibilidad', exact: true }),
  ).toBeEnabled();
});

test('the animal processing modal supports neon, small screens, reduced motion and cancellation', async ({
  page,
}, testInfo) => {
  await chooseTestUser(page, 'ana');
  const release: (() => void)[] = [];
  await page.route(endpoint, async (route) => {
    await new Promise<void>((resolve) => release.push(resolve));
    await route.fulfill({ json: report }).catch(() => {});
  });
  try {
    await page.goto(petPath);
    const button = page.getByRole('button', {
      name: 'Analizar compatibilidad',
      exact: true,
    });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Tu mundo y el de Nube.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toBeFocused();
    expect(
      await dialog
        .locator('.processing-orbit-core')
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('processing-breathe');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await dialog
        .locator('.processing-orbit-core')
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    expect(
      (
        await new AxeBuilder({ page })
          .include('.match-processing-dialog')
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `reports/previews/pet-processing-${testInfo.project.name}.png`,
    });
    await page.keyboard.press('Escape');
    release.splice(0).forEach((resolve) => resolve());
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    await expect(button).toBeEnabled();
    await expect(page.locator('body')).not.toHaveClass(/locked/);
    await page.getByRole('button', { name: 'Activar modo nocturno' }).click();
    if (testInfo.project.name === 'mobile')
      await page.setViewportSize({ width: 320, height: 740 });
    await button.click();
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate(
        (node) =>
          node.scrollWidth <= node.clientWidth &&
          node.getBoundingClientRect().width <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.match-processing-dialog')
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `reports/previews/pet-processing-neon-${testInfo.project.name}.png`,
    });
    await dialog
      .getByRole('button', { name: 'Cancelar análisis', exact: true })
      .click();
    release.splice(0).forEach((resolve) => resolve());
    await expect(dialog).not.toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByLabel('Informe de compatibilidad')).toHaveCount(0);
  } finally {
    release.splice(0).forEach((resolve) => resolve());
  }
});

test('a failed animal analysis offers a retry without leaving the profile', async ({
  page,
}) => {
  await chooseTestUser(page, 'ana');
  let attempts = 0;
  await page.route(endpoint, (route) =>
    ++attempts === 1
      ? route.fulfill({
          status: 503,
          json: { detail: 'Bekko OpenVINO no disponible. Horizon ONNX falló.' },
        })
      : route.fulfill({ json: report }),
  );
  await page.goto(petPath);
  await page
    .getByRole('button', { name: 'Analizar compatibilidad', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Nos falta un pasito.' });
  await expect(dialog.getByRole('alert')).toContainText(
    'Volvé a intentar en unos minutos',
  );
  await expect(page.getByLabel('Informe de compatibilidad')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByLabel('Informe de compatibilidad')).toBeVisible();
  await expect(page).toHaveURL(petPath);
  expect(attempts).toBe(2);
  await expect(page.locator('body')).not.toHaveClass(/locked/);
});

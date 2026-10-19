import { expect, test, type Page } from '@playwright/test';

async function resultsStartInView(page: Page, number: number) {
  const results = page.getByRole('region', {
    name: `Animales del catálogo, página ${number}`,
    exact: true,
  });
  await expect(results).toBeFocused();
  await expect
    .poll(async () => {
      const grid = await results.boundingBox();
      const header = await page.locator('.header').boundingBox();
      return grid!.y - (header!.y + header!.height);
    })
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(async () => {
      const grid = await results.boundingBox();
      const header = await page.locator('.header').boundingBox();
      return grid!.y - (header!.y + header!.height);
    })
    .toBeLessThanOrEqual(80);
  await expect(results.locator('.pet-open').first()).toBeInViewport();
}

for (const [path, reducedMotion] of [
  ['/', 'no-preference'],
  ['/adopcion/', 'reduce'],
] as const) {
  test(`pagination keeps the new animals in view on ${path} (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const original = await (
      await page.request.get('/api/v1/pets?page_size=1')
    ).json();
    expect(original.items.length).toBe(1);
    const animals = Array.from({ length: 26 }, (_, index) => ({
      ...original.items[0],
      id: `pagination-fixture-${index + 1}`,
      name: `Patita de prueba ${index + 1}`,
    }));
    let releaseSecondPage!: () => void;
    const secondPageReady = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    await page.route('**/api/v1/pets?**', async (route) => {
      const number = Number(
        new URL(route.request().url()).searchParams.get('page') ?? 1,
      );
      if (number === 2) await secondPageReady;
      await route.fulfill({
        json: {
          items: animals.slice((number - 1) * 12, number * 12),
          total: 26,
          page: number,
          page_size: 12,
          pages: 3,
        },
      });
    });
    await page.goto(path);
    await expect(page.locator('.result-count')).toContainText('26');
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const pagination = page.getByRole('navigation', {
      name: 'Páginas del catálogo',
    });
    const next = pagination.getByRole('button', {
      name: 'Siguiente',
      exact: true,
    });
    await next.click();
    await expect(page.locator('.catalog-content')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    // Keep the current page in place while its replacement is still loading.
    const previousResults = page.getByRole('region', {
      name: 'Animales del catálogo, página 1',
      exact: true,
    });
    await expect(previousResults).not.toBeFocused();
    expect((await previousResults.boundingBox())!.y).toBeLessThan(0);
    releaseSecondPage();
    await expect(pagination).toContainText('Página 2 de 3');
    await resultsStartInView(page, 2);
    await expect(page.locator('.pet-card').first()).toHaveAttribute(
      'data-card',
      'pagination-fixture-13',
    );
    await next.click();
    await expect(pagination).toContainText('Página 3 de 3');
    await expect(page.locator('.pet-card')).toHaveCount(2);
    await expect(next).toBeDisabled();
    await resultsStartInView(page, 3);
    await pagination
      .getByRole('button', { name: 'Anterior', exact: true })
      .click();
    await expect(pagination).toContainText('Página 2 de 3');
    await expect(page.locator('.pet-card')).toHaveCount(12);
    await resultsStartInView(page, 2);
    await page.keyboard.press('Tab');
    await expect(page.locator('.pet-open').first()).toBeFocused();
  });
}

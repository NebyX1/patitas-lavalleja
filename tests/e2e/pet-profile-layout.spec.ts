import { expect, test } from '@playwright/test';

for (const [slug, hasPhoto] of [
  ['luna', true],
  ['demo-animal-04-11', false],
] as const) {
  test(`pet media stays proportional across short and long tabs: ${slug}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto(`/mascotas/${slug}/`);
    expect(response?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    const photo = page.locator('.profile-main-photo');
    const visual = page.locator('.profile-visual');
    const information = page.locator('.profile-info');
    const widths =
      testInfo.project.name === 'mobile' ? [320, 390] : [768, 1440, 1920];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('tab', { name: 'Mis cuidados' }).click();
      const shortPhoto = (await photo.boundingBox())!;
      const shortVisual = (await visual.boundingBox())!;
      const shortInformation = (await information.boundingBox())!;
      await page.getByRole('tab', { name: 'Así soy' }).click();
      const longPhoto = (await photo.boundingBox())!;
      const longVisual = (await visual.boundingBox())!;
      const longInformation = (await information.boundingBox())!;
      expect(Math.abs(longPhoto.height - longPhoto.width)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(shortPhoto.height - longPhoto.height),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(shortVisual.height - longVisual.height),
      ).toBeLessThanOrEqual(1);
      expect(longInformation.height).toBeGreaterThan(
        shortInformation.height + 100,
      );
      const image = (await photo.locator(':scope > img').boundingBox())!;
      expect(Math.abs(image.height - longPhoto.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(image.width - longPhoto.width)).toBeLessThanOrEqual(1);
      if (hasPhoto) {
        const zoom = (await page
          .getByRole('button', { name: 'Ampliar fotografía' })
          .boundingBox())!;
        expect(zoom.x).toBeGreaterThanOrEqual(longPhoto.x);
        expect(zoom.y).toBeGreaterThanOrEqual(longPhoto.y);
        expect(zoom.x + zoom.width).toBeLessThanOrEqual(
          longPhoto.x + longPhoto.width,
        );
        expect(zoom.y + zoom.height).toBeLessThanOrEqual(
          longPhoto.y + longPhoto.height,
        );
      } else {
        await expect(
          page.getByRole('button', { name: 'Ampliar fotografía' }),
        ).toHaveCount(0);
        await expect(page.locator('.profile-photo-label small')).toHaveText(
          'Fotografía pendiente',
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    if (hasPhoto) {
      await page.getByRole('button', { name: 'Ampliar fotografía' }).click();
      const lightbox = page.getByRole('dialog', {
        name: 'Fotografía ampliada',
      });
      await expect(lightbox).toBeVisible();
      await expect(lightbox.locator('img')).not.toHaveCSS(
        'position',
        'absolute',
      );
      await lightbox.getByRole('button', { name: 'Cerrar fotografía' }).click();
      await expect(lightbox).not.toBeVisible();
    }
    await page.setViewportSize({
      width: testInfo.project.name === 'mobile' ? 390 : 1440,
      height: 1000,
    });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: `reports/previews/profile-media-${slug}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
}

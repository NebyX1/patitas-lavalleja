import { expect, test, type Page } from '@playwright/test';

export async function chooseTestUser(page: Page, name: string) {
  const available = await (
    await page.request.get('/api/v1/auth/demo-users')
  ).json();
  test.skip(
    !available.enabled,
    'Requires the explicit local testing accounts.',
  );
  const session = await (await page.request.get('/api/v1/auth/session')).json();
  const response = await page.request.post('/api/v1/auth/demo-login', {
    data: { user_id: `demo-user-${name}` },
    headers: {
      Origin: 'http://localhost:4321',
      'X-CSRF-Token': session.csrf_token,
    },
  });
  expect(response.status()).toBe(200);
}

import { expect, test } from '@playwright/test';

// Las fuentes se sirven desde la propia web: ninguna petición a Google Fonts y
// DM Sans / DM Serif Display cargadas. No necesita sesión ni base de datos.
const e2eTest = process.env.SPIRIT_E2E === '1' ? test : test.skip;

e2eTest('DM Sans y DM Serif Display cargan desde /assets/fonts sin Google', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url());
  });
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('700 16px "DM Sans"'),
      document.fonts.load('400 32px "DM Serif Display"')
    ]);
    return {
      sans: document.fonts.check('700 16px "DM Sans"'),
      serif: document.fonts.check('400 32px "DM Serif Display"'),
      loaded: [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/"/g, ''))
    };
  });
  expect(fonts.sans).toBe(true);
  expect(fonts.serif).toBe(true);
  expect(fonts.loaded).toEqual(expect.arrayContaining(['DM Sans', 'DM Serif Display']));
  expect(external).toEqual([]);
});

import { expect, test } from '@playwright/test';

// /privacidad y /aviso-legal (borrador): acceso directo, pie del login,
// enlace de la casilla de consentimiento (diálogo, sin perder lo escrito) y
// filas del perfil. Solo contra el entorno local.
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const e2eTest = e2eEnabled ? test : test.skip;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
});

e2eTest('/privacidad directa: borrador, marcadores, catalán y aviso legal', async ({ page }) => {
  await page.goto('/privacidad');
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Borrador pendiente de revisión legal');
  await expect(page.locator('.legal-placeholder', { hasText: '[RAZÓN SOCIAL]' }).first()).toBeVisible();
  await expect(page.getByText(/Fráncfort/)).toBeVisible();

  await page.getByRole('button', { name: 'Llegir en català' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacitat' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Esborrany pendent de revisió legal');

  await page.getByRole('link', { name: 'Avís legal' }).click();
  await expect(page).toHaveURL(/\/aviso-legal$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso legal' })).toBeVisible();
  await expect(page.getByText(/LSSI-CE/)).toBeVisible();

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible();
});

e2eTest('el pie del login abre la política y «atrás» vuelve al login', async ({ page }) => {
  await page.goto('/login');
  const footer = page.getByRole('navigation', { name: 'Información legal' });
  await footer.getByRole('link', { name: 'Política de privacidad' }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toHaveCount(0);
});

e2eTest('la casilla de consentimiento abre la política en un diálogo sin perder lo escrito', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).first().click();
  await page.getByLabel('Nombre', { exact: true }).fill('Laura');
  // Con el diálogo abierto la app queda oculta a la accesibilidad (inert): la
  // casilla se localiza por su nombre de campo.
  const consent = page.locator('input[name="privacyConsent"]');
  await page.locator('label.check').getByRole('link', { name: 'política de privacidad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Política de privacidad' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('note')).toContainText('Borrador pendiente de revisión legal');
  await expect(consent).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Laura');
  await expect(page).toHaveURL(/\/login$/);
});

e2eTest('el perfil enlaza la política y el aviso legal', async ({ page }) => {
  test.skip(!process.env.SPIRIT_E2E_CUSTOMER_EMAIL, 'Necesita la cuenta de cliente de E2E.');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Información legal' })).toBeVisible();
  await page.locator('[data-nav="profile"]').first().click();
  await page.getByRole('link', { name: 'Aviso legal' }).first().click();
  await expect(page).toHaveURL(/\/aviso-legal$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Aviso legal' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('link', { name: 'Política de privacidad' }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

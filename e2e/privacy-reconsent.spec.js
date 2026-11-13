import { expect, test } from '@playwright/test';
import pg from 'pg';

// Reconsentimiento: una cuenta cuya última aceptación es anterior a la versión
// actual (aquí: ninguna) ve la política al iniciar sesión y debe aceptarla para
// continuar. Solo contra la base local desechable.
const e2eEnabled = process.env.SPIRIT_E2E === '1' && Boolean(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function db(query, params = []) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows;
  } finally {
    await client.end();
  }
}

const forgetConsent = () => db(`delete from public.privacy_consents where user_id = (select id from auth.users where lower(email) = lower($1))`, [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
const consents = () => db(`select policy_version, source from public.privacy_consents where user_id = (select id from auth.users where lower(email) = lower($1)) order by accepted_at`, [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);

async function signIn(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
}

test.afterAll(async () => {
  if (!e2eEnabled) return;
  // Deja la cuenta con la versión actual aceptada para el resto de E2E.
  await db(`insert into public.privacy_consents (user_id, policy_version, source)
    select id, '2026-08-05', 'customer_signup' from auth.users where lower(email) = lower($1)
    on conflict (user_id, policy_version) do nothing`, [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
});

e2eTest('sin aceptación vigente: la política bloquea hasta aceptarla y queda registrada', async ({ page }) => {
  await forgetConsent();
  await signIn(page);
  const heading = page.getByRole('heading', { level: 1, name: 'Hemos actualizado la política de privacidad' });
  await expect(heading).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Política de privacidad' })).toContainText('Responsable del tratamiento');

  await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
  await expect(page.getByText('Marca la casilla para aceptar la política.')).toBeVisible();
  await expect(heading).toBeVisible();

  await page.getByText('He leído y acepto la política de privacidad.').click();
  await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  expect(await consents()).toEqual([{ policy_version: '2026-08-05', source: 'login_reconsent' }]);

  // Ya aceptada: al volver a abrir la app no se pide de nuevo.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await expect(heading).toHaveCount(0);
});

e2eTest('«Cerrar sesión» sale sin aceptar', async ({ page }) => {
  await forgetConsent();
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Hemos actualizado la política de privacidad' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible();
  expect(await consents()).toEqual([]);
});

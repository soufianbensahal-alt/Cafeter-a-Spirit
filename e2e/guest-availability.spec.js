import { expect, test } from '@playwright/test';
import pg from 'pg';

// «Pedir sin cuenta» sólo se ofrece cuando el local lo permite y Supabase Auth
// admite inicios anónimos. Mientras no conste (apagado, error de red, Auth sin
// anónimos) la tarjeta muestra el texto alternativo y «Ver la carta». Si el
// alta falla, el aviso sale en la propia tarjeta, no en el formulario de login.
// Solo contra la base local desechable.
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });
// Sin service worker: si controla la página, sus peticiones no pasan por
// page.route y no se pueden simular los fallos de red o de Auth.
test.use({ serviceWorkers: 'block' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

async function setGuestOrdering(enabled) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only, guest_ordering_enabled)
      select id, true, true, $2 from public.businesses where lower(btrim(name)) = lower(btrim($1))
      on conflict (business_id) do update set ordering_enabled = true, guest_ordering_enabled = excluded.guest_ordering_enabled`, [BUSINESS_NAME, enabled]);
  } finally {
    await db.end();
  }
}

const card = (page) => page.locator('section.guest-entry');
const unavailableText = 'Para pedir desde la mesa, crea tu cuenta o pide en la barra.';

async function openLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await expect(card(page).getByRole('heading', { name: '¿Solo quieres pedir?' })).toBeVisible();
}

test.afterAll(async () => {
  if (e2eEnabled) await setGuestOrdering(false);
});

e2eTest('apagado: sin botón, con el texto alternativo y «Ver la carta»', async ({ page }) => {
  await setGuestOrdering(false);
  await openLogin(page);
  await expect(card(page).getByText(unavailableText)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Ver la carta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
});

e2eTest('encendido (local y Auth): el botón aparece en el login y en la carta', async ({ page }) => {
  await setGuestOrdering(true);
  await openLogin(page);
  await expect(card(page).getByRole('button', { name: 'Pedir sin cuenta' })).toBeVisible();
  await expect(card(page).getByText(unavailableText)).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Ver la carta' }).click();
  await expect(page.locator('.guest-menu-banner').getByRole('button', { name: 'Pedir sin cuenta' })).toBeVisible();
});

e2eTest('error de red al consultar el estado: no se ofrece', async ({ page }) => {
  await setGuestOrdering(true);
  await page.route('**/rest/v1/rpc/get_guest_ordering_status', (route) => route.abort('internetdisconnected'));
  await openLogin(page);
  await expect(card(page).getByText(unavailableText)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
});

e2eTest('interruptor encendido pero Auth sin anónimos: no se ofrece', async ({ page }) => {
  await setGuestOrdering(true);
  await page.route('**/auth/v1/settings', async (route) => {
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({ response, json: { ...settings, external: { ...settings.external, anonymous_users: false } } });
  });
  await openLogin(page);
  await expect(card(page).getByText(unavailableText)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
});

e2eTest('si el alta falla, el aviso sale en la tarjeta y no en el formulario de login', async ({ page }) => {
  await setGuestOrdering(true);
  // Auth rechaza el alta anónima (como en producción con los anónimos desactivados).
  await page.route('**/auth/v1/signup', (route) => route.fulfill({
    status: 422,
    json: { code: 422, error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' }
  }));
  await openLogin(page);
  await card(page).getByRole('button', { name: 'Pedir sin cuenta' }).click();
  const alert = card(page).getByRole('alert');
  await expect(alert).toHaveText('Ahora mismo no se puede pedir sin cuenta. Puedes pedir en la barra.');
  // El formulario de login no muestra ese error.
  await expect(page.locator('form[data-form="customer-auth"] .form-error')).toHaveText('');
  // Y deja de ofrecerse el botón.
  await expect(page.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
  await expect(card(page).getByText(unavailableText)).toBeVisible();
  await expect(page.locator('#app-announcer')).toHaveText('Ahora mismo no se puede pedir sin cuenta. Puedes pedir en la barra.');
});

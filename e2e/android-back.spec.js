import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Botón/gesto atrás (Android, y el gesto de iPhone): con un diálogo abierto lo
// cierra, entre pantallas vuelve a la anterior y, con la app instalada, en la
// raíz pide una segunda pulsación antes de salir. En una pestaña normal, atrás
// desde la raíz sale de la página como siempre. page.goBack() es lo que hace el botón atrás de
// Chrome. Solo contra la base local desechable.
const panelVars = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const panelEnabled = e2eEnabled && panelVars.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
const panelTest = panelEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });
test.use({ serviceWorkers: 'block' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const EXIT_HINT = 'Pulsa atrás otra vez para salir';

// Botón atrás del sistema. Las entradas propias son del mismo documento.
async function pressBack(page) {
  await page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {});
}

// PWA instalada: display-mode standalone (Playwright no lo emula).
async function asInstalledApp(page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query)
      ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
      : original(query));
  });
}

async function openLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('section.guest-entry')).toBeVisible();
}

const toast = (page) => page.locator('#toast');

e2eTest('entre pantallas: atrás desde la carta vuelve al login sin salir de la PWA', async ({ page }) => {
  await asInstalledApp(page);
  await openLogin(page);
  await page.locator('section.guest-entry').getByRole('button', { name: 'Ver la carta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await pressBack(page);
  await expect(page.locator('section.guest-entry')).toBeVisible();
  expect(page.url()).toContain('127.0.0.1:4173');
  // La flecha de la app hace lo mismo y no deja entradas colgando.
  await page.locator('section.guest-entry').getByRole('button', { name: 'Ver la carta' }).click();
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await pressBack(page);
  await expect(toast(page)).toHaveText(EXIT_HINT);
  await expect(page.locator('section.guest-entry')).toBeVisible();
});

e2eTest('pestaña normal: atrás desde la raíz sale como siempre, sin aviso', async ({ page }) => {
  await page.goto('about:blank');
  await openLogin(page);
  expect(await page.evaluate(() => history.state?.spiritDepth)).toBe(0);
  await pressBack(page);
  await expect.poll(() => page.url()).toBe('about:blank');
});

e2eTest('pestaña normal: diálogos y pantallas siguen volviendo con atrás', async ({ page }) => {
  await page.goto('about:blank');
  await openLogin(page);
  await page.locator('section.guest-entry').getByRole('button', { name: 'Ver la carta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await pressBack(page);
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await expect(toast(page)).not.toHaveClass(/toast--show/);
});

e2eTest('app instalada, raíz: la primera pulsación avisa; la segunda, enseguida, sale', async ({ page }) => {
  await page.goto('about:blank');
  await asInstalledApp(page);
  await openLogin(page);
  await pressBack(page);
  await expect(toast(page)).toHaveText(EXIT_HINT);
  await expect(toast(page)).toHaveClass(/toast--show/);
  expect(page.url()).toContain('/login');
  await pressBack(page);
  await expect.poll(() => page.url()).toBe('about:blank');
});

e2eTest('diálogo: atrás lo cierra y conserva lo escrito; cerrarlo con la × no deja una entrada de más', async ({ page }) => {
  await asInstalledApp(page);
  await openLogin(page);
  await page.locator('.auth-switch').getByRole('button', { name: 'Crear mi cuenta' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Laura');
  await page.locator('form[data-auth-mode="signup"]').locator('a[data-legal-sheet="privacy"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await pressBack(page);
  await expect(dialog).toBeHidden();
  await expect(page.locator('form[data-auth-mode="signup"]')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Laura');
  await expect(toast(page)).not.toHaveClass(/toast--show/);

  // Abrir y cerrar con la ×: la siguiente pulsación ya es la de la raíz.
  await page.locator('form[data-auth-mode="signup"]').locator('a[data-legal-sheet="privacy"]').click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
  await pressBack(page);
  await expect(toast(page)).toHaveText(EXIT_HINT);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Laura');
});

e2eTest('página legal: abierta desde el login o por enlace directo, atrás vuelve al login', async ({ page }) => {
  await openLogin(page);
  await page.locator('footer.legal-footer a[data-legal-link="privacy"]').click();
  await expect(page).toHaveURL(/\/privacidad$/);
  await pressBack(page);
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await expect(page).not.toHaveURL(/\/privacidad$/);

  await page.goto('/privacidad');
  await expect(page.locator('[data-legal-page="privacy"]')).toBeVisible();
  await pressBack(page);
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await expect(page).not.toHaveURL(/\/privacidad$/);
});

// ---------------------------------------------------------------------------
// Panel: ticket, rechazo, historial y pestañas.
// ---------------------------------------------------------------------------
async function db(run) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Un pedido pendiente de hoy, con su número reservado como create_order.
async function preparePendingOrder() {
  return db(async (client) => {
    const { rows: [customer] } = await client.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await client.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    await client.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    const { rows: [{ last }] } = await client.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(
        private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)
      ) + 1
      returning last_number as last`, [business.id]);
    const { rows: [order] } = await client.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, created_at)
      values ($1, $2, $3, ${today}, 'Barra', 'pending', 250, now() - interval '1 minute') returning id`, [business.id, customer.id, Number(last)]);
    await client.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
      values ($1, $2, 'cafes-latte', 1, 1, 250, 'Latte', 250)`, [order.id, business.id]);
    return Number(last);
  });
}

async function employeeLogin(page) {
  await page.goto('/cafeteria');
  const otpInput = page.getByLabel('Código de 6 dígitos');
  const home = page.getByRole('tablist', { name: 'Secciones del modo cafetería' });
  const email = page.getByLabel('Correo electrónico');
  await expect(otpInput.or(home).or(email)).toBeVisible();
  if (await email.isVisible()) {
    await email.fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
    await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
    await page.getByRole('button', { name: 'Acceder' }).click();
    await expect(otpInput.or(home)).toBeVisible();
  }
  if (await otpInput.isVisible()) {
    const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET), digits: 6, period: 30 }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
}

let panel;
let orderNumber;

panelTest('panel: ticket y rechazo se cierran con atrás; el pedido sigue pendiente', async ({ browser }, testInfo) => {
  orderNumber = await preparePendingOrder();
  const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  panel = await context.newPage();
  // El panel de la barra va instalado en la tablet.
  await asInstalledApp(panel);
  await employeeLogin(panel);
  await panel.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(panel.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
  const card = panel.getByRole('article', { name: `Pedido nº ${orderNumber}`, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });

  await card.getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${orderNumber},`) }).click();
  await expect(panel.getByRole('dialog')).toBeVisible();
  await pressBack(panel);
  await expect(panel.getByRole('dialog')).toBeHidden();
  await expect(panel.getByRole('tab', { name: /^Pedidos/ })).toHaveAttribute('aria-selected', 'true');

  await card.getByRole('button', { name: 'Rechazar' }).click();
  await expect(panel.getByRole('dialog')).toBeVisible();
  await pressBack(panel);
  await expect(panel.getByRole('dialog')).toBeHidden();
  await expect(card.getByRole('button', { name: 'Aceptar' })).toBeVisible();

  // Mientras se envía el rechazo, atrás no cierra el diálogo.
  await panel.route('**/rest/v1/rpc/update_order_status', async (route) => {
    await new Promise((resolve) => { setTimeout(resolve, 1500); });
    await route.abort('internetdisconnected');
  });
  await card.getByRole('button', { name: 'Rechazar' }).click();
  const dialog = panel.getByRole('dialog');
  await dialog.locator('#reject-reason').fill('Prueba de envío');
  await dialog.getByRole('button', { name: 'Rechazar pedido' }).click();
  await expect(dialog.locator('[data-orders-form="reject"][data-submitting]')).toHaveCount(1);
  await pressBack(panel);
  await panel.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-orders-form="reject"][data-submitting]')).toHaveCount(0, { timeout: 5000 });
  await panel.unroute('**/rest/v1/rpc/update_order_status');
  if (await dialog.isVisible()) await panel.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card.getByRole('button', { name: 'Aceptar' })).toBeVisible();
});

panelTest('panel: un día pasado vuelve a «Hoy» y otra pestaña vuelve a Pedidos', async () => {
  await panel.getByRole('button', { name: 'Día anterior' }).click();
  await expect(panel.locator('[data-orders-history]')).toBeVisible();
  await pressBack(panel);
  await expect(panel.locator('[data-orders-history]')).toHaveCount(0);
  await expect(panel.getByRole('article', { name: `Pedido nº ${orderNumber}`, exact: true })).toBeVisible();

  await panel.getByRole('tab', { name: 'Fidelización' }).click();
  await expect(panel.getByRole('tab', { name: 'Fidelización' })).toHaveAttribute('aria-selected', 'true');
  await pressBack(panel);
  await expect(panel.getByRole('tab', { name: /^Pedidos/ })).toHaveAttribute('aria-selected', 'true');
});

panelTest('panel: en Pedidos, atrás avisa antes de salir', async () => {
  await pressBack(panel);
  await expect(panel.locator('#toast')).toHaveText(EXIT_HINT);
  await expect(panel.locator('#toast')).toBeVisible();
  await expect(panel.getByRole('tablist', { name: 'Secciones del modo cafetería' })).toBeVisible();
  await panel.context().close();
});

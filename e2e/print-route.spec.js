import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// «Imprimir comanda» según el dispositivo: en la PWA instalada de iOS no se
// muestra (la comanda sale del PC de la barra) y el ticket se ve igual; en el
// resto de dispositivos se imprime con window.print() como hasta ahora.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de impresión solo puede preparar datos en una base local desechable.');
  }
}

// Un pedido pendiente con número reservado en el contador, como create_order.
async function preparePendingOrder() {
  assertDisposableDatabase(DB_URL);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!customer || !business) throw new Error('Faltan el cliente o el negocio Spirit Montcada en la base local.');
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    const { rows: [{ last }] } = await db.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(
        private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)
      ) + 1
      returning last_number as last`, [business.id]);
    const { rows: [order] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, created_at)
      values ($1, $2, $3, ${today}, '4', 'pending', 500, now() - interval '1 minute') returning id`, [business.id, customer.id, Number(last)]);
    await db.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
      values ($1, $2, 'cafes-latte', 1, 2, 250, 'Latte', 500)`, [order.id, business.id]);
    return Number(last);
  } finally {
    await db.end();
  }
}

async function employeeLogin(page) {
  await page.goto('/cafeteria');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
  await page.getByRole('button', { name: 'Acceder' }).click();
  const otpInput = page.getByLabel('Código de 6 dígitos');
  const home = page.getByRole('tablist', { name: 'Secciones del modo cafetería' });
  await expect(otpInput.or(home)).toBeVisible();
  if (await otpInput.isVisible()) {
    const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET), digits: 6, period: 30 }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
}

async function openPanel(browser, testInfo, { standalone }) {
  const number = await preparePendingOrder();
  const context = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await page.addInitScript((installed) => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
    // iPhone con la app instalada en la pantalla de inicio.
    if (installed) Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
  }, standalone);
  await employeeLogin(page);
  const card = page.getByRole('article', { name: `Pedido nº ${number}`, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  return { context, page, card, number };
}

e2eTest('iPhone con la app instalada: sin «Imprimir comanda» y el ticket se ve igual', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'webkit', 'La PWA instalada de iOS se simula en WebKit.');
  const { context, page, card, number } = await openPanel(browser, testInfo, { standalone: true });
  expect(await page.evaluate(() => navigator.standalone)).toBe(true);
  await expect(card.getByRole('button', { name: /Imprimir comanda/ })).toHaveCount(0);
  // Las acciones de estado siguen ahí.
  await expect(card.getByRole('button', { name: 'Aceptar' })).toBeVisible();

  await card.getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${number},`) }).click();
  const dialog = page.getByRole('dialog', { name: `Pedido nº ${number} · Mesa 4` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await expect(dialog.getByRole('list', { name: 'Productos' })).toContainText(/2 ×\s*Latte/);
  await expect(dialog.locator('[data-ticket-total]')).toHaveText(/^5,00\s€$/);
  await expect(dialog.getByRole('button', { name: /Imprimir/ })).toHaveCount(0);
  await expect(dialog.getByRole('button')).toHaveCount(1);
  expect(await page.evaluate(() => window.__printCalls)).toBe(0);
  await context.close();
});

e2eTest('Safari no instalado en iPhone: «Imprimir comanda» sigue disponible', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'webkit', 'Comprobación de iPhone sin instalar en WebKit.');
  const { context, card, number } = await openPanel(browser, testInfo, { standalone: false });
  await expect(card.getByRole('button', { name: `Imprimir comanda del pedido nº ${number}` })).toBeVisible();
  await context.close();
});

e2eTest('resto de dispositivos: «Imprimir comanda» usa window.print() como ahora', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'La impresión estándar se comprueba en Chromium.');
  const { context, page, card, number } = await openPanel(browser, testInfo, { standalone: false });
  await card.getByRole('button', { name: `Imprimir comanda del pedido nº ${number}` }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  await expect(page.locator('#print-root .kitchen-ticket__number')).toHaveText(`Nº ${number}`);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  await card.getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${number},`) }).click();
  const dialog = page.getByRole('dialog', { name: `Pedido nº ${number} · Mesa 4` });
  await dialog.getByRole('button', { name: 'Imprimir comanda' }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(2);
  await context.close();
});

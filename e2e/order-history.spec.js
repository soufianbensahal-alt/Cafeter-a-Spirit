import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Historial de pedidos del panel: selector de día (Europe/Madrid), vista de
// solo consulta con resumen, límite de 30 días para employee, sin límite para
// manager, y vuelta a «Hoy» en directo con la franja de pedidos nuevos.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const MARK = 'e2e-historial';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E del historial solo puede preparar datos en una base local desechable.');
  }
}

async function withDatabase(callback) {
  assertDisposableDatabase(DB_URL);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await callback(db);
  } finally {
    await db.end();
  }
}

const today = "(now() at time zone 'Europe/Madrid')::date";

// Inserta un pedido de hace `daysAgo` días reservando el número en el contador
// de ese día, como create_order.
async function insertOrder(db, ids, { daysAgo, hour, status, total, table = 'Barra', reason = null }) {
  const day = `(${today} - ${Number(daysAgo)})`;
  const { rows: [{ last }] } = await db.query(`insert into private.order_counters (business_id, service_date, last_number)
    values ($1, ${day}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${day}), 0) + 1)
    on conflict (business_id, service_date) do update set last_number = greatest(
      private.order_counters.last_number,
      coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${day}), 0)
    ) + 1
    returning last_number as last`, [ids.businessId]);
  const at = `(${day}::timestamp + interval '${Number(hour)} hours') at time zone 'Europe/Madrid'`;
  const stamps = {
    served: `, accepted_at = ${at} + interval '2 minutes', preparing_at = ${at} + interval '4 minutes', served_at = ${at} + interval '10 minutes'`,
    rejected: `, rejected_at = ${at} + interval '1 minute'`,
    cancelled: `, cancelled_at = ${at} + interval '1 minute'`,
    pending: ''
  }[status];
  const { rows: [order] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, rejection_reason, created_at)
    values ($1, $2, $3, ${day}, $4, $5, $6, $7, $8, ${at}) returning id`, [ids.businessId, ids.customerId, Number(last), table, status, total, MARK, reason]);
  if (stamps) await db.query(`update public.orders set updated_at = updated_at ${stamps} where id = $1`, [order.id]);
  await db.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
    values ($1, $2, 'cafes-latte', 1, $3, 250, 'Latte', $4)`, [order.id, ids.businessId, total / 250, total]);
  return Number(last);
}

async function ids(db) {
  const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
  const { rows: [employee] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_EMPLOYEE_EMAIL]);
  const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
  if (!customer || !employee || !business) throw new Error('Faltan el cliente, el empleado o el negocio Spirit Montcada en la base local.');
  return { customerId: customer.id, employeeId: employee.id, businessId: business.id };
}

const setRole = (role) => withDatabase(async (db) => {
  const { employeeId, businessId } = await ids(db);
  await db.query('update public.business_members set role = $3 where business_id = $1 and user_id = $2', [businessId, employeeId, role]);
});

let numbers;

async function prepare() {
  return withDatabase(async (db) => {
    const found = await ids(db);
    // Datos propios de este E2E: se rehacen en cada ejecución.
    await db.query(`delete from public.orders where business_id = $1 and note = $2 and service_date < ${today}`, [found.businessId, MARK]);
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [found.businessId]);
    await db.query(`delete from public.orders where business_id = $1 and service_date in (${today} - 1, ${today} - 10, ${today} - 30, ${today} - 40)`, [found.businessId]);
    await db.query('update public.business_members set role = $3 where business_id = $1 and user_id = $2', [found.businessId, found.employeeId, 'employee']);
    return {
      yesterday: {
        served1: await insertOrder(db, found, { daysAgo: 1, hour: 9, status: 'served', total: 500, table: '4' }),
        rejected: await insertOrder(db, found, { daysAgo: 1, hour: 10, status: 'rejected', total: 250, reason: 'Cocina cerrada' }),
        cancelled: await insertOrder(db, found, { daysAgo: 1, hour: 11, status: 'cancelled', total: 750 }),
        served2: await insertOrder(db, found, { daysAgo: 1, hour: 12, status: 'served', total: 250 })
      },
      tenDays: await insertOrder(db, found, { daysAgo: 10, hour: 9, status: 'served', total: 250 }),
      thirtyDays: await insertOrder(db, found, { daysAgo: 30, hour: 9, status: 'served', total: 500 }),
      fortyDays: await insertOrder(db, found, { daysAgo: 40, hour: 9, status: 'served', total: 750 })
    };
  });
}

const madridDate = (daysAgo) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - daysAgo));
  return date.toISOString().slice(0, 10);
};

async function signIn(page) {
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
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
}

let context;
let page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  numbers = await prepare();
  context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true });
  page = await context.newPage();
  await page.goto('/cafeteria');
  await signIn(page);
});

test.afterAll(async () => {
  if (!e2eEnabled) return;
  await setRole('employee');
  await context?.close();
});

const dateBar = () => page.getByRole('group', { name: 'Día de los pedidos' });
const history = () => page.locator('[data-orders-history]');
const card = (number) => history().getByRole('article', { name: `Pedido nº ${number}`, exact: true });

e2eTest('por defecto «Hoy» en directo; «Día anterior» abre ayer en solo consulta con su resumen', async () => {
  const bar = dateBar();
  await expect(bar.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByLabel('Fecha')).toHaveValue(madridDate(0));
  await expect(bar.getByRole('button', { name: 'Día siguiente' })).toBeDisabled();
  await expect(page.locator('.orders-board')).toBeVisible();

  await bar.getByRole('button', { name: 'Día anterior' }).click();
  await expect(bar.getByLabel('Fecha')).toHaveValue(madridDate(1));
  await expect(bar.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.orders-board')).toHaveCount(0);
  await expect(history().getByRole('heading', { level: 2 })).toHaveText(/^Pedidos del \S+, \d{1,2} de \S+$/);

  // Resumen: 2 servidos (5,00 + 2,50), 1 cancelado y 1 rechazado.
  await expect(history().locator('[data-summary-served]')).toHaveText('2');
  await expect(history().locator('[data-summary-amount]')).toHaveText(/^7,50\s€$/);
  await expect(history().locator('[data-summary-cancelled]')).toHaveText('1');
  await expect(history().locator('[data-summary-rejected]')).toHaveText('1');

  // Todos los estados, por hora.
  const y = numbers.yesterday;
  await expect(history().getByRole('article')).toHaveCount(4);
  const order = await history().getByRole('article').evaluateAll((articles) => articles.map((article) => article.getAttribute('aria-label')));
  expect(order).toEqual([y.served1, y.rejected, y.cancelled, y.served2].map((n) => `Pedido nº ${n}`));
  await expect(card(y.rejected)).toContainText('Motivo: Cocina cerrada');

  // Solo consulta: ninguna acción de estado ni comanda en pedidos cerrados.
  for (const name of ['Aceptar', 'Rechazar', 'En preparación', 'Servido']) {
    await expect(history().getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(history().getByRole('button', { name: /Imprimir comanda/ })).toHaveCount(0);
});

e2eTest('cada tarjeta del historial abre el ticket existente', async () => {
  const number = numbers.yesterday.served1;
  await card(number).getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${number},`) }).click();
  const dialog = page.getByRole('dialog', { name: `Pedido nº ${number} · Mesa 4` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await expect(dialog.locator('.ticket__status')).toContainText('Servido');
  await expect(dialog.locator('.ticket__meta time')).toHaveCount(4);
  await expect(dialog.locator('[data-ticket-total]')).toHaveText(/^5,00\s€$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

e2eTest('calendario: hace 10 días; el employee no pasa de 30 días', async () => {
  const bar = dateBar();
  await bar.getByLabel('Fecha').fill(madridDate(10));
  await expect(history().getByRole('article')).toHaveCount(1);
  await expect(card(numbers.tenDays)).toBeVisible();
  await expect(history().locator('[data-summary-amount]')).toHaveText(/^2,50\s€$/);

  // El calendario no deja bajar del límite: se queda en el día 30.
  await expect(bar.getByLabel('Fecha')).toHaveAttribute('min', madridDate(30));
  await bar.getByLabel('Fecha').fill(madridDate(40));
  await expect(bar.getByLabel('Fecha')).toHaveValue(madridDate(30));
  // Los números se repiten entre días: se comprueba el día mostrado.
  await expect(history()).toHaveAttribute('data-orders-history', madridDate(30));
  await expect(history().getByRole('article')).toHaveCount(1);
  await expect(card(numbers.thirtyDays)).toBeVisible();
  await expect(history().locator('[data-summary-amount]')).toHaveText(/^5,00\s€$/);
  await expect(bar.getByRole('button', { name: 'Día anterior' })).toBeDisabled();

  // «Día siguiente» avanza un día.
  await bar.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(bar.getByLabel('Fecha')).toHaveValue(madridDate(29));
  await expect(history().getByText('No hubo pedidos ese día.')).toBeVisible();
});

e2eTest('un pedido nuevo mientras se mira el historial: franja «Volver a Hoy» y el tablero en directo', async () => {
  const bar = dateBar();
  await bar.getByRole('button', { name: 'Día anterior' }).click();
  await expect(page.getByText('1 pedido nuevo sin atender')).toHaveCount(0);
  const number = await withDatabase(async (db) => insertOrder(db, await ids(db), { daysAgo: 0, hour: new Date().getUTCHours() + 1, status: 'pending', total: 250, table: '7' }));
  const alert = page.locator('[data-history-alert]');
  await expect(alert).toContainText('1 pedido nuevo sin atender', { timeout: 10000 });
  // También por el live-announcer, de forma destacada.
  const announcer = page.locator('#app-announcer');
  await expect(announcer).toHaveText(`Nuevo pedido nº ${number} · Mesa 7. 1 pedido nuevo sin atender: vuelve a Hoy para atenderlos.`);
  await expect(announcer).toHaveAttribute('aria-live', 'assertive');
  // El historial sigue en pantalla, sin acciones.
  await expect(history()).toBeVisible();
  await alert.getByRole('button', { name: 'Volver a Hoy' }).click();
  await expect(bar.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
  await expect(announcer).toHaveText('Pedidos de hoy, en directo.');
  const fresh = page.locator('.orders-column--new').getByRole('article', { name: `Pedido nº ${number}`, exact: true });
  await expect(fresh).toBeVisible();
  await expect(fresh.getByRole('button', { name: 'Aceptar' })).toBeVisible();
  await expect(page.locator('[data-history-alert]')).toHaveCount(0);
});

e2eTest('manager: sin límite de días (hace 40 días)', async () => {
  await setRole('manager');
  await page.reload();
  await signIn(page);
  const bar = dateBar();
  await expect(bar.getByLabel('Fecha')).not.toHaveAttribute('min', /.+/);
  await bar.getByLabel('Fecha').fill(madridDate(40));
  await expect(history()).toHaveAttribute('data-orders-history', madridDate(40));
  await expect(card(numbers.fortyDays)).toBeVisible();
  await expect(history().locator('[data-summary-amount]')).toHaveText(/^7,50\s€$/);
  await bar.getByRole('button', { name: 'Hoy' }).click();
  await expect(page.locator('.orders-board')).toBeVisible();
});

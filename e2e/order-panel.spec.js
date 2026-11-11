import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Panel de pedidos del equipo con dos contextos de navegador independientes:
// el cliente pide desde la carta y el empleado (tablet) recibe el aviso por
// Realtime, cambia estados y el cliente ve cada cambio sin recargar.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_CUSTOMER_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ORDER_CODE = '4826';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const BASE_TITLE = 'SPIRIT · Modo cafetería';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E del panel solo puede preparar datos en una base local desechable.');
  }
}

async function withDatabase(callback) {
  assertDisposableDatabase(DB_URL);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function preparePilot() {
  return withDatabase(async (db) => {
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [employee] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_EMPLOYEE_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!customer || !employee || !business) throw new Error('Faltan el cliente, el empleado o el negocio Spirit Montcada en la base local.');
    const { rowCount } = await db.query('select 1 from public.business_members where business_id = $1 and user_id = $2 and active', [business.id, employee.id]);
    if (!rowCount) throw new Error('El empleado E2E no es miembro activo de Spirit Montcada.');
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only)
      values ($1, true, true)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await db.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, customer.id]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at)
      values ($1, $2, now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business.id, ORDER_CODE]);
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business.id, 'cafes-latte']);
    await db.query('delete from private.order_code_attempts where user_id = $1', [customer.id]);
    // Cierra cualquier pedido abierto del negocio para empezar con el panel vacío.
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    return { customerId: customer.id, businessId: business.id };
  });
}

async function customerLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
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
    const token = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET),
      digits: 6,
      period: 30
    }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
}

// Pide un Latte desde la carta y devuelve el número de pedido.
async function placeOrder(page, { table = '', note = '' } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await page.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
  if (note) await page.getByLabel('Nota para el local (opcional)').fill(note);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar pedido' });
  await dialog.getByLabel('Código del local').fill(ORDER_CODE);
  if (table) await dialog.getByLabel('Tu mesa').fill(table);
  else await dialog.getByLabel('Recoger en barra').check();
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();
  const heading = page.getByRole('heading', { level: 1, name: /^Pedido nº \d+$/ });
  await expect(heading).toBeVisible();
  return Number((await heading.textContent()).match(/\d+/)[0]);
}

const customerChip = (page) => page.locator('[data-order-status] .order-status__chip');
const ticket = (page, number) => page.getByRole('article', { name: `Pedido nº ${number}`, exact: true });

let customerContext;
let employeeContext;
let customer;
let employee;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  await preparePilot();
  const { baseURL } = testInfo.project.use;
  customerContext = await browser.newContext({ ...testInfo.project.use, baseURL });
  // La tablet fija del local, en horizontal.
  employeeContext = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true });
  customer = await customerContext.newPage();
  employee = await employeeContext.newPage();
  await customerLogin(customer);
  await employeeLogin(employee);
  await employee.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(employee.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
});

test.afterAll(async () => {
  await customerContext?.close();
  await employeeContext?.close();
});

e2eTest('el empleado activa los avisos al empezar el turno y el panel está en directo', async () => {
  const alerts = employee.locator('[data-alerts-indicator]');
  await expect(alerts).toHaveText('Avisos desactivados');
  const activate = employee.getByRole('button', { name: 'Activar avisos' });
  await expect(activate).toBeVisible();
  await activate.click();
  // El indicador refleja el AudioContext real: tras el gesto, el audio está en marcha.
  await expect(alerts).toHaveText(/^Avisos activos/);
  await expect(activate).toBeHidden();
  await expect(employee.locator('[data-screen-indicator]')).not.toHaveText('Pantalla sin bloquear');
  // Canal Realtime suscrito con la sesión AAL2 del empleado.
  await expect(employee.locator('[data-connection-indicator]')).toHaveText('En directo');
  await expect(employee).toHaveTitle(BASE_TITLE);
});

e2eTest('el cliente pide, el empleado recibe el aviso por Realtime y el cliente ve cada estado', async () => {
  const number = await placeOrder(customer, { table: 'Terraza 2', note: 'Con leche de avena' });

  // Llega por Realtime (con el canal suscrito no hay polling).
  const card = ticket(employee, number);
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(employee.locator('[data-connection-indicator]')).toHaveText('En directo');
  await expect(employee.locator('.orders-column--new').getByRole('article', { name: `Pedido nº ${number}`, exact: true })).toBeVisible();
  await expect(card).toHaveClass(/order-ticket--fresh/);
  await expect(card.locator('[data-order-status]')).toHaveText(/Nuevo · Sin atender/);
  await expect(card).toContainText('Mesa Terraza 2');
  await expect(card).toContainText('Latte');
  await expect(card).toContainText('Con leche de avena');
  await expect(card).toContainText('2,20');
  await expect(card).not.toContainText('@');
  await expect(employee).toHaveTitle(`(1) ${BASE_TITLE}`);
  await expect(employee.locator('[data-orders-tab-count]')).toHaveText('1');

  await card.getByRole('button', { name: 'Aceptar' }).click();
  await expect(customerChip(customer)).toHaveText('Aceptado', { timeout: 10000 });
  await expect(employee).toHaveTitle(BASE_TITLE);
  await expect(employee.locator('.orders-column--progress').getByRole('article', { name: `Pedido nº ${number}`, exact: true })).toBeVisible();

  await ticket(employee, number).getByRole('button', { name: 'En preparación' }).click();
  await expect(customerChip(customer)).toHaveText('En preparación', { timeout: 10000 });

  await ticket(employee, number).getByRole('button', { name: 'Servido' }).click();
  await expect(customerChip(customer)).toHaveText('Servido', { timeout: 10000 });
  await expect(employee.locator('.orders-column--served').getByRole('article', { name: `Pedido nº ${number}`, exact: true })).toBeVisible();
});

e2eTest('tras renovar la sesión del empleado, el canal sigue con AAL2 y recibe pedidos en tiempo real', async () => {
  // Un turno dura horas: supabase-js renueva el token solo. Se fuerza aquí.
  const refreshed = await employee.evaluate(() => window.__spiritE2E.refreshSession());
  expect(refreshed.aal).toBe('aal2');
  // Realtime pasa a usar el token renovado (TOKEN_REFRESHED → setAuth).
  await expect.poll(() => employee.evaluate(() => window.__spiritE2E.realtimeTokenIsCurrent())).toBe(true);
  await expect(employee.locator('[data-connection-indicator]')).toHaveText('En directo');

  const number = await placeOrder(customer, { table: '9' });
  // Con el canal suscrito no hay polling ni otra consulta: solo Realtime lo trae.
  const card = ticket(employee, number);
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(employee.locator('[data-connection-indicator]')).toHaveText('En directo');
  await expect(card.locator('[data-order-status]')).toHaveText(/Nuevo · Sin atender/);

  // Los cambios del empleado tras la renovación también llegan al cliente.
  await card.getByRole('button', { name: 'Aceptar' }).click();
  await expect(customerChip(customer)).toHaveText('Aceptado', { timeout: 10000 });
  await ticket(employee, number).getByRole('button', { name: 'En preparación' }).click();
  await ticket(employee, number).getByRole('button', { name: 'Servido' }).click();
  await expect(customerChip(customer)).toHaveText('Servido', { timeout: 10000 });
});

e2eTest('una cancelación del cliente se ve al instante en el panel', async () => {
  const number = await placeOrder(customer);
  const card = ticket(employee, number);
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toContainText('Barra');

  await customer.getByRole('button', { name: 'Cancelar pedido' }).click();
  await customer.getByRole('dialog', { name: '¿Cancelar el pedido?' }).getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(customerChip(customer)).toHaveText('Cancelado');

  await expect(employee.getByText(`El cliente ha cancelado el pedido nº ${number}.`)).toBeVisible({ timeout: 10000 });
  const closed = employee.locator('.orders-closed').getByRole('article', { name: `Pedido nº ${number}`, exact: true });
  await expect(closed).toContainText('Cancelado por el cliente');
  // Sin acciones de estado ni comanda: el único botón es la cabecera que abre el ticket.
  await expect(closed.getByRole('button')).toHaveCount(1);
  await expect(closed.getByRole('button')).toHaveAccessibleName(new RegExp(`^Ver ticket del pedido nº ${number},`));
  await expect(employee).toHaveTitle(BASE_TITLE);
});

e2eTest('rechazar pide motivo con el foco en el campo y el cliente lo ve', async () => {
  const number = await placeOrder(customer, { table: '7' });
  const card = ticket(employee, number);
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toContainText('Mesa 7');

  await card.getByRole('button', { name: 'Rechazar' }).click();
  const dialog = employee.getByRole('dialog', { name: '¿Rechazar el pedido?' });
  await expect(dialog).toBeVisible();
  const reason = dialog.getByLabel('Motivo (obligatorio)');
  await expect(reason).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Rechazar pedido' })).not.toBeFocused();

  // Enter sin motivo no rechaza.
  await employee.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('Indica un motivo breve para el cliente.');
  await expect(customerChip(customer)).toHaveText('Recibido');

  await dialog.getByRole('button', { name: 'Producto agotado' }).click();
  await expect(reason).toHaveValue('Producto agotado');
  await dialog.getByRole('button', { name: 'Rechazar pedido' }).click();
  await expect(dialog).toBeHidden();

  await expect(customerChip(customer)).toHaveText('Rechazado', { timeout: 10000 });
  await expect(customer.getByText('Motivo: Producto agotado')).toBeVisible();
  const closed = employee.locator('.orders-closed').getByRole('article', { name: `Pedido nº ${number}`, exact: true });
  await expect(closed).toContainText('Motivo: Producto agotado');
});

e2eTest('panel de control: código del día en grande y confirmación segura al regenerar', async () => {
  await employee.getByRole('tab', { name: 'Panel' }).click();
  await expect(employee.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
  await expect(employee.locator('[data-order-code]')).toHaveText(ORDER_CODE);
  await expect(employee.locator('[data-ordering-state]')).toHaveText('Abiertos');
  await expect(employee.getByRole('switch', { name: 'Latte disponible', exact: true })).toBeChecked();

  // Agotar y reponer un producto (se deja como estaba).
  const matcha = employee.getByRole('switch', { name: 'Matcha Latte disponible', exact: true });
  // El input está oculto bajo el interruptor visual: se toca la etiqueta, como en la tablet.
  await matcha.locator('xpath=..').click();
  await expect(matcha).not.toBeChecked();
  const soldOut = employee.locator('.control-soldout');
  await expect(soldOut).toContainText('Matcha Latte');
  await soldOut.getByRole('button', { name: 'Reponer' }).click();
  await expect(matcha).toBeChecked();
  await expect(soldOut).toHaveCount(0);

  await employee.getByRole('button', { name: 'Regenerar código' }).click();
  const dialog = employee.getByRole('dialog', { name: '¿Regenerar el código del día?' });
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(employee.locator('[data-order-code]')).toHaveText(ORDER_CODE);
  // Los avisos siguen activos en cualquier pestaña.
  await expect(employee.locator('[data-alerts-indicator]')).toHaveText(/^Avisos activos/);
});

import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Agotados en tiempo real con dos contextos de navegador independientes: el
// empleado (tablet) agota y repone el Latte desde el Panel y el cliente lo ve
// en la carta, el carrito y la confirmación sin recargar la página.
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
const PRODUCT_ID = 'cafes-latte';
const LIVE = { timeout: 10000 };

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de agotados solo puede preparar datos en una base local desechable.');
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
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business.id, PRODUCT_ID]);
    return { businessId: business.id };
  });
}

async function restoreProduct(businessId) {
  if (!businessId) return;
  await withDatabase((db) => db.query('update public.products set is_available = true where business_id = $1 and id = $2', [businessId, PRODUCT_ID]));
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

let customerContext;
let employeeContext;
let customer;
let employee;
let businessId;

// El interruptor del Panel: el input está oculto bajo el control visual, así
// que se toca la etiqueta, como en la tablet.
async function setLatteAvailable(available) {
  const latteSwitch = employee.getByRole('switch', { name: 'Latte disponible', exact: true });
  await expect(latteSwitch).toBeEnabled();
  if ((await latteSwitch.isChecked()) !== available) await latteSwitch.locator('xpath=..').click();
  await expect(latteSwitch).toBeChecked({ checked: available });
}

// Marca la página del cliente: si se recargase, la marca desaparecería.
const markNoReload = (page) => page.evaluate(() => { window.__spiritNoReload = true; });
const expectNoReload = async (page) => expect(await page.evaluate(() => window.__spiritNoReload === true)).toBe(true);

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  ({ businessId } = await preparePilot());
  const { baseURL } = testInfo.project.use;
  customerContext = await browser.newContext({ ...testInfo.project.use, baseURL });
  employeeContext = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true });
  customer = await customerContext.newPage();
  employee = await employeeContext.newPage();
  await customerLogin(customer);
  await employeeLogin(employee);
  await employee.getByRole('tab', { name: 'Panel' }).click();
  await expect(employee.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
  await expect(employee.getByRole('switch', { name: 'Latte disponible', exact: true })).toBeChecked();
});

test.afterAll(async () => {
  await restoreProduct(businessId);
  await customerContext?.close();
  await employeeContext?.close();
});

e2eTest('la carta abierta muestra el agotado y la reposición sin recargar', async () => {
  await customer.getByRole('button', { name: 'Carta: Ver menú' }).click();
  const add = customer.getByRole('button', { name: 'Añadir Latte al carrito', exact: true });
  await expect(add).toBeEnabled();
  await markNoReload(customer);

  await setLatteAvailable(false);
  const soldOut = customer.getByRole('button', { name: 'Latte está agotado', exact: true });
  await expect(soldOut).toBeVisible(LIVE);
  await expect(soldOut).toBeDisabled();
  await expect(add).toHaveCount(0);

  await setLatteAvailable(true);
  await expect(add).toBeEnabled(LIVE);
  await expect(soldOut).toHaveCount(0);
  await expectNoReload(customer);
});

e2eTest('el carrito marca la línea agotada, bloquea «Continuar» y se desbloquea al reponer', async () => {
  await customer.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await customer.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
  await expect(customer.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
  const proceed = customer.getByRole('button', { name: 'Continuar' });
  await expect(proceed).toBeEnabled();
  await markNoReload(customer);

  await setLatteAvailable(false);
  await expect(customer.getByText('Agotado: elimínalo para continuar')).toBeVisible(LIVE);
  await expect(customer.locator('.cart-line--unavailable')).toHaveCount(1);
  await expect(proceed).toBeDisabled();
  await expect(customer.locator('#app-announcer')).toHaveText('Latte se ha agotado. Quítalo del carrito para continuar.');

  await setLatteAvailable(true);
  await expect(proceed).toBeEnabled(LIVE);
  await expect(customer.locator('.cart-line--unavailable')).toHaveCount(0);
  await expect(customer.locator('#app-announcer')).toHaveText('Latte vuelve a estar disponible.');
  await expectNoReload(customer);
});

e2eTest('con la confirmación abierta, avisa dentro, bloquea el envío y conserva código y mesa', async () => {
  await customer.getByRole('button', { name: 'Continuar' }).click();
  const dialog = customer.getByRole('dialog', { name: 'Confirmar pedido' });
  await dialog.getByLabel('Código del local').fill(ORDER_CODE);
  await dialog.getByLabel('Tu mesa').fill('Terraza 2');
  const submit = dialog.getByRole('button', { name: 'Enviar pedido' });
  await expect(submit).toBeEnabled();
  await markNoReload(customer);

  // Agotado: el diálogo sigue abierto, el aviso recibe el foco y no se puede enviar.
  await setLatteAvailable(false);
  const notice = dialog.locator('[data-checkout-soldout]');
  await expect(notice).toContainText('Latte se acaba de agotar.', LIVE);
  await expect(notice).toBeFocused();
  await expect(dialog).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(dialog.getByLabel('Código del local')).toHaveValue(ORDER_CODE);

  // Repuesto antes de salir: se reactiva el envío.
  await setLatteAvailable(true);
  await expect(notice).toHaveCount(0, LIVE);
  await expect(submit).toBeEnabled();
  await expect(submit).toBeFocused();

  // Se agota otra vez y el cliente vuelve al carrito desde el aviso.
  await setLatteAvailable(false);
  await expect(notice).toBeFocused(LIVE);
  await notice.getByRole('button', { name: 'Volver al carrito' }).click();
  await expect(dialog).toBeHidden();
  await expect(customer.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeFocused();
  await expect(customer.getByRole('button', { name: 'Continuar' })).toBeDisabled();

  // Al reponer y volver a la confirmación, el código y la mesa siguen escritos.
  await setLatteAvailable(true);
  await expect(customer.getByRole('button', { name: 'Continuar' })).toBeEnabled(LIVE);
  await customer.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByLabel('Código del local')).toHaveValue(ORDER_CODE);
  await expect(dialog.getByLabel('Tu mesa')).toHaveValue('Terraza 2');
  await expect(dialog.getByRole('button', { name: 'Enviar pedido' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
  await expectNoReload(customer);
});

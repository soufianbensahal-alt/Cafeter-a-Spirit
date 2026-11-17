import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Inicia sesión una sola vez (cliente y empleado) y guarda las sesiones para
// los perfiles de recorrido táctil de Android: así no se supera el límite de
// inicios de sesión de Auth (10 cada 5 minutos). Prepara también los datos:
// pedidos abiertos para el cliente del piloto y un pedido activo (mis
// pedidos, seguimiento y panel). Solo contra la base local desechable.
const required = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_CUSTOMER_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const enabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
export const AUTH_DIR = 'playwright/.auth';
export const CUSTOMER_STATE = `${AUTH_DIR}/customer.json`;
export const EMPLOYEE_STATE = `${AUTH_DIR}/employee.json`;

async function prepareData() {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only) values ($1, true, true)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await db.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, customer.id]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at) values ($1, '4826', now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business.id]);
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now() where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    const { rows: [{ last }] } = await db.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)) + 1
      returning last_number as last`, [business.id]);
    const { rows: [order] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at)
      values ($1, $2, $3, ${today}, 'Terraza 2', 'pending', 1300, 'Sin lactosa, por favor', now() - interval '1 minute') returning id`, [business.id, customer.id, Number(last)]);
    await db.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
      ($1, $2, 'cafes-latte', 1, 2, 250, 'Latte', 500), ($1, $2, 'tostadas-aguacate', 2, 1, 800, 'Tostada de aguacate', 800)`, [order.id, business.id]);
  } finally {
    await db.end();
  }
}

setup('sesiones de cliente y empleado y datos de ejemplo', async ({ browser }) => {
  setup.skip(!enabled, 'Solo con SPIRIT_E2E y las cuentas de prueba locales.');
  await mkdir(AUTH_DIR, { recursive: true });
  await prepareData();

  const customerContext = await browser.newContext({ serviceWorkers: 'block' });
  const customer = await customerContext.newPage();
  await customer.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await customer.goto('/login');
  await customer.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await customer.getByLabel('Contraseña', { exact: true }).fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await customer.locator('form[data-form="customer-auth"] [type="submit"]').click();
  await expect(customer.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await customerContext.storageState({ path: CUSTOMER_STATE });
  await customerContext.close();

  const employeeContext = await browser.newContext({ serviceWorkers: 'block' });
  const employee = await employeeContext.newPage();
  await employee.goto('/cafeteria');
  await employee.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
  await employee.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
  await employee.getByRole('button', { name: 'Acceder' }).click();
  const otp = employee.getByLabel('Código de 6 dígitos');
  const home = employee.getByRole('tablist', { name: 'Secciones del modo cafetería' });
  await expect(otp.or(home)).toBeVisible();
  if (await otp.isVisible()) {
    await otp.fill(new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET), digits: 6, period: 30 }).generate());
    await employee.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
  await employeeContext.storageState({ path: EMPLOYEE_STATE });
  await employeeContext.close();
});

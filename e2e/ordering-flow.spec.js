import { expect, test } from '@playwright/test';
import pg from 'pg';

// Flujo completo carta → carrito → código → pedido → seguimiento en tiempo real.
// Prepara el piloto directamente en la base local desechable mediante
// SPIRIT_E2E_DB_URL (por defecto la de `supabase start`). Nunca contra producción.
const required = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_CUSTOMER_PASSWORD'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ORDER_CODE = '4826';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de pedidos solo puede preparar datos en una base local desechable.');
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

async function prepareOrderingPilot() {
  return withDatabase(async (db) => {
    const { rows: [user] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!user || !business) throw new Error('Faltan el cliente E2E o el negocio Spirit Montcada en la base local.');
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only)
      values ($1, true, true)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await db.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, user.id]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at)
      values ($1, $2, now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business.id, ORDER_CODE]);
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business.id, 'cafes-latte']);
    await db.query('delete from private.order_code_attempts where user_id = $1', [user.id]);
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where customer_id = $1 and status in ('pending', 'accepted', 'preparing')`, [user.id]);
    return { userId: user.id, businessId: business.id };
  });
}

async function customerLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expectHome(page);
}

// El live-announcer repite el título de cada pantalla: se busca el <h1> por rol
// para no coincidir también con la región oculta de anuncios.
const expectHome = (page) => expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();

let pilot;
test.beforeAll(async () => {
  if (e2eEnabled) pilot = await prepareOrderingPilot();
});

e2eTest('carta → carrito → código → pedido con seguimiento en tiempo real', async ({ page }) => {
  await customerLogin(page);
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();

  // Carta con pedidos abiertos: «Añadir» y barra de carrito.
  const addLatte = page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true });
  await expect(addLatte).toBeVisible();
  await addLatte.click();
  await expect(page.getByText('1 en el carrito')).toBeVisible();
  const cartBar = page.getByRole('button', { name: /^Ver carrito: 1 producto, 2,20/ });
  await expect(cartBar).toBeVisible();
  await cartBar.click();

  // Carrito: +/−, nota y total orientativo.
  await expect(page.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeFocused();
  await page.getByRole('button', { name: 'Añadir una unidad de Latte' }).click();
  await expect(page.getByRole('group', { name: 'Cantidad de Latte: 2' })).toBeVisible();
  await page.getByLabel('Nota para el local (opcional)').fill('Con leche de avena, por favor');
  await expect(page.getByText(/Total orientativo/)).toBeVisible();
  await expect(page.locator('[data-cart-total]')).toHaveText(/4,40/);

  // La nota y el carrito sobreviven a una recarga (sessionStorage).
  await page.reload();
  await expectHome(page);
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await page.getByRole('button', { name: /^Ver carrito: 2 productos/ }).click();
  await expect(page.getByLabel('Nota para el local (opcional)')).toHaveValue('Con leche de avena, por favor');

  // Confirmación: código del local, mesa y aviso de pago.
  await page.getByRole('button', { name: 'Continuar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar pedido' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('El código está en la barra.')).toBeVisible();
  await expect(dialog.getByText('Pagarás en el local.')).toBeVisible();
  const code = dialog.getByLabel('Código del local');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toBeFocused();

  await code.fill('0000');
  await dialog.getByLabel('Tu mesa').fill('Terraza 2');
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(dialog.getByText('Código incorrecto o caducado. Consulta el código en la barra.')).toBeVisible();
  await expect(code).toHaveAttribute('aria-invalid', 'true');

  await code.fill(ORDER_CODE);
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();

  // Seguimiento.
  const heading = page.getByRole('heading', { level: 1, name: /^Pedido nº \d+$/ });
  await expect(heading).toBeVisible();
  // La barra de progreso siempre lista los cuatro estados: se comprueba solo el indicador.
  await expect(page.locator('[data-order-status] .order-status__chip')).toHaveText('Recibido');
  await expect(page.getByText('Mesa Terraza 2')).toBeVisible();
  await expect(page.getByText('Pagarás en el local')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible();

  // El equipo acepta el pedido: el cliente lo ve sin recargar (Realtime o polling).
  const orderNumber = Number((await heading.textContent()).match(/\d+/)[0]);
  await withDatabase((db) => db.query(
    `update public.orders set status = 'accepted', accepted_at = now()
     where customer_id = $1 and order_number = $2 and service_date = (now() at time zone 'Europe/Madrid')::date`,
    [pilot.userId, orderNumber]
  ));
  await expect(page.locator('[data-order-status] .order-status__chip')).toHaveText('Aceptado', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeHidden();

  // «Mis pedidos» muestra el pedido activo.
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Mis pedidos' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Nº ${orderNumber}`) })).toBeVisible();

  await withDatabase((db) => db.query(
    `update public.orders set status = 'served', served_at = now() where customer_id = $1 and status in ('pending', 'accepted', 'preparing')`,
    [pilot.userId]
  ));
});

e2eTest('el cliente puede cancelar un pedido pendiente y recoger en barra', async ({ page }) => {
  await customerLogin(page);
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await page.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar pedido' });
  await dialog.getByLabel('Código del local').fill(ORDER_CODE);
  await dialog.getByLabel('Recoger en barra').check();
  await expect(dialog.getByLabel('Tu mesa')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();

  await expect(page.getByRole('heading', { level: 1, name: /^Pedido nº \d+$/ })).toBeVisible();
  await expect(page.locator('.order-detail__place')).toContainText('Recoger en barra');
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Cancelar el pedido?' });
  await confirm.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.locator('[data-order-status] .order-status__chip')).toHaveText('Cancelado');
});

e2eTest('los pedidos cerrados dejan la carta informativa', async ({ page }) => {
  await withDatabase((db) => db.query('update public.business_ordering_settings set ordering_enabled = false where business_id = $1', [pilot.businessId]));
  try {
    await customerLogin(page);
    await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
    await expect(page.getByText('Latte', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Añadir .* al carrito$/ })).toHaveCount(0);
  } finally {
    await withDatabase((db) => db.query('update public.business_ordering_settings set ordering_enabled = true where business_id = $1', [pilot.businessId]));
  }
});

import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Pedir sin cuenta: invitado con sesión anónima de Supabase. El manager activa
// «Pedidos sin cuenta» en el Panel, el invitado pide con su nombre y el panel lo
// ve como «Nombre · Invitado» en directo. Al crear su cuenta (correo en
// Mailpit) conserva el pedido y no recibe sellos retroactivos.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = ['SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const MAILBOX_URL = process.env.SPIRIT_E2E_MAILBOX_URL || 'http://127.0.0.1:54324';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const ORDER_CODE = '4826';
const GUEST_NAME = 'Laura';
const PASSWORD = 'Spirit-Guest-2026!';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de invitados solo puede preparar datos en una base local desechable.');
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

const businessId = (db) => db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]).then(({ rows }) => rows[0].id);
const employeeId = (db) => db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_EMPLOYEE_EMAIL]).then(({ rows }) => rows[0].id);

async function prepare() {
  await withDatabase(async (db) => {
    const business = await businessId(db);
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only, guest_ordering_enabled)
      values ($1, true, true, false)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true, guest_ordering_enabled = false`, [business]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at)
      values ($1, $2, now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business, ORDER_CODE]);
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business, 'cafes-latte']);
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business]);
    // El interruptor sólo lo gestiona owner o manager.
    await db.query('update public.business_members set role = $3 where business_id = $1 and user_id = $2', [business, await employeeId(db), 'manager']);
  });
}

async function restore() {
  await withDatabase(async (db) => {
    const business = await businessId(db);
    await db.query('update public.business_members set role = $3 where business_id = $1 and user_id = $2', [business, await employeeId(db), 'employee']);
    await db.query('update public.business_ordering_settings set guest_ordering_enabled = false where business_id = $1', [business]);
  });
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
}

// Mailpit: el enlace más reciente para el destinatario que cumpla el patrón.
async function latestEmailLink(request, recipient, matcher) {
  let found = '';
  await expect.poll(async () => {
    const response = await request.get(`${MAILBOX_URL}/api/v1/search?query=${encodeURIComponent(`to:"${recipient}"`)}&limit=10`);
    if (!response.ok()) return '';
    const { messages = [] } = await response.json();
    for (const message of messages) {
      const detail = await request.get(`${MAILBOX_URL}/api/v1/message/${encodeURIComponent(message.ID)}`);
      if (!detail.ok()) continue;
      const { HTML = '', Text = '' } = await detail.json();
      const link = (`${HTML}\n${Text}`.match(/https?:\/\/[^"'<>\s]+/g) || []).map((value) => value.replace(/&amp;/g, '&')).find(matcher);
      if (link) {
        found = link;
        return link;
      }
    }
    return '';
  }, { timeout: 15_000, message: `Enlace de conversión para ${recipient}` }).not.toBe('');
  const url = new URL(found);
  return `${url.pathname}${url.search}`;
}

let employeeContext;
let guestContext;
let employee;
let guest;
let orderNumber;
const guestEmail = `invitado-${Date.now()}@spirit.test`;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  await prepare();
  const { baseURL } = testInfo.project.use;
  employeeContext = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true });
  guestContext = await browser.newContext({ ...testInfo.project.use, baseURL });
  employee = await employeeContext.newPage();
  guest = await guestContext.newPage();
  await guest.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
});

test.afterAll(async () => {
  if (!e2eEnabled) return;
  await restore();
  await employeeContext?.close();
  await guestContext?.close();
});

e2eTest('con «Pedidos sin cuenta» apagado no se ofrece; la carta se puede ver sin sesión', async () => {
  await guest.goto('/login');
  await expect(guest.getByRole('heading', { name: '¿Solo quieres pedir?' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
  await guest.getByRole('button', { name: 'Ver la carta' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await expect(guest.getByRole('button', { name: /Añadir Latte al carrito/ })).toHaveCount(0);
  await expect(guest.getByRole('button', { name: 'Pedir sin cuenta' })).toHaveCount(0);
  await guest.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(guest.getByRole('button', { name: 'Iniciar sesión' }).first()).toBeVisible();
});

e2eTest('el manager activa «Pedidos sin cuenta» en el Panel', async () => {
  await employeeLogin(employee);
  await employee.getByRole('tab', { name: 'Panel' }).click();
  await expect(employee.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
  const toggle = employee.getByRole('switch', { name: 'Pedidos sin cuenta', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  await toggle.locator('xpath=..').click();
  await expect(toggle).toBeChecked();
  const enabled = await withDatabase(async (db) => (await db.query('select guest_ordering_enabled from public.business_ordering_settings where business_id = $1', [await businessId(db)])).rows[0].guest_ordering_enabled);
  expect(enabled).toBe(true);
});

e2eTest('el invitado pide con su nombre y el panel lo recibe como «Nombre · Invitado»', async () => {
  await guest.goto('/login');
  await guest.getByRole('button', { name: 'Pedir sin cuenta' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  // Navegación reducida: salir del modo invitado en lugar de volver al inicio.
  await expect(guest.getByRole('button', { name: 'Salir del modo invitado' })).toBeVisible();
  await expect(guest.getByText('Crea tu cuenta y consigue un café gratis con tus sellos').first()).toBeVisible();

  await guest.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await guest.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
  await expect(guest.getByRole('complementary').getByRole('button', { name: 'Crear cuenta' })).toBeVisible();

  await guest.getByRole('button', { name: 'Continuar' }).click();
  const dialog = guest.getByRole('dialog', { name: 'Confirmar pedido' });
  const name = dialog.getByLabel('Nombre para el pedido');
  await expect(name).toBeFocused();
  await dialog.getByLabel('Código del local').fill(ORDER_CODE);
  await dialog.getByLabel('Recoger en barra').check();
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(dialog.getByText('Escribe un nombre de 2 a 30 caracteres.')).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();

  await name.fill(GUEST_NAME);
  await dialog.getByRole('button', { name: 'Enviar pedido' }).click();
  const heading = guest.getByRole('heading', { level: 1, name: /^Pedido nº \d+$/ });
  await expect(heading).toBeVisible();
  orderNumber = Number((await heading.textContent()).match(/\d+/)[0]);
  await expect(guest.getByText('Crea tu cuenta y consigue un café gratis con tus sellos')).toBeVisible();

  // El panel lo recibe en directo con el nombre del invitado.
  await employee.getByRole('tab', { name: /^Pedidos/ }).click();
  const card = employee.locator('.orders-column--new').getByRole('article', { name: `Pedido nº ${orderNumber}`, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toContainText(`${GUEST_NAME} · Invitado`);
  await card.getByRole('button', { name: 'Aceptar' }).click();
  await expect(guest.locator('[data-order-status] .order-status__chip')).toHaveText('Aceptado', { timeout: 10000 });

  // Sin perfil ni tarjeta para el invitado.
  const row = await withDatabase(async (db) => (await db.query(`select o.guest_name, u.is_anonymous,
      (select count(*)::int from public.profiles p where p.id = u.id) as profiles,
      (select count(*)::int from public.customer_cards c where c.customer_id = u.id) as cards
    from public.orders o join auth.users u on u.id = o.customer_id
    where o.business_id = $1 and o.order_number = $2 and o.service_date = (now() at time zone 'Europe/Madrid')::date`, [await businessId(db), orderNumber])).rows[0]);
  expect(row).toEqual({ guest_name: GUEST_NAME, is_anonymous: true, profiles: 0, cards: 0 });
});

e2eTest('vigilancia: el manager ve en el Panel los invitados de hoy y cuántos pidieron', async () => {
  await employee.getByRole('tab', { name: 'Panel' }).click();
  const card = employee.locator('[data-guest-signups]');
  await expect(card.getByRole('heading', { name: 'Invitados (últimos 14 días)' })).toBeVisible();
  const table = card.getByRole('table', { name: 'Invitados nuevos por día' });
  await expect(table.getByRole('row')).toHaveCount(15);
  // Hoy: al menos este invitado, que pidió.
  const today = table.getByRole('row').nth(1);
  expect(Number(await today.getByRole('cell').nth(0).textContent())).toBeGreaterThanOrEqual(1);
  expect(Number(await today.getByRole('cell').nth(1).textContent())).toBeGreaterThanOrEqual(1);
  await employee.getByRole('tab', { name: /^Pedidos/ }).click();
});

e2eTest('el invitado crea su cuenta: confirma el correo, elige contraseña y conserva el pedido', async ({ request }) => {
  // Incluye la espera del correo en Mailpit.
  test.setTimeout(60_000);
  await guest.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Tu cuenta Spirit' })).toBeVisible();
  await guest.getByLabel('Nombre').fill('Laura');
  await guest.getByLabel('Apellidos').fill('Prueba');
  await guest.getByLabel('Correo electrónico').fill(guestEmail);
  await guest.getByText(/Acepto la política de privacidad/).click();
  await guest.getByRole('button', { name: 'Enviar enlace de confirmación' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Revisa tu correo' })).toBeVisible();
  await expect(guest.getByText(guestEmail)).toBeVisible();

  const link = await latestEmailLink(request, guestEmail, (value) => value.includes('type=email_change'));
  await guest.goto(link);
  await expect(guest.getByRole('heading', { level: 1, name: 'Elige tu contraseña' })).toBeVisible();
  await guest.getByLabel('Nueva contraseña').fill(PASSWORD);
  await guest.getByLabel('Confirmar contraseña').fill(PASSWORD);
  await guest.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: /Laura/ })).toBeVisible({ timeout: 10000 });

  // Misma cuenta: ya no es anónima, conserva el pedido, tiene perfil y
  // consentimiento, y ningún sello por haber pedido como invitado.
  const account = await withDatabase(async (db) => (await db.query(`select u.is_anonymous, u.email,
      (select o.order_number from public.orders o where o.customer_id = u.id and o.business_id = $2 order by o.created_at desc limit 1) as last_order,
      (select display_name from public.profiles p where p.id = u.id) as display_name,
      (select count(*)::int from public.privacy_consents pc where pc.user_id = u.id) as consents,
      (select coalesce(sum(current_stamps), 0)::int from public.customer_cards c where c.customer_id = u.id) as stamps
    from auth.users u where lower(u.email) = lower($1)`, [guestEmail, await businessId(db)])).rows[0]);
  expect(account).toEqual({ is_anonymous: false, email: guestEmail, last_order: orderNumber, display_name: 'Laura Prueba', consents: 1, stamps: 0 });

  // Y sigue viendo su pedido en curso.
  await guest.getByRole('button', { name: /Tienes 1 pedido en curso/ }).click();
  await expect(guest.getByRole('button', { name: new RegExp(`Nº ${orderNumber}`) })).toBeVisible();
});

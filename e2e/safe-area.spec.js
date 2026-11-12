import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Franja de la barra de estado del iPhone (PWA con status-bar-style
// black-translucent): iOS difumina lo que queda debajo. Ningún control ni
// diálogo puede quedar en reposo dentro de env(safe-area-inset-top).
//
// Playwright no simula el notch: se reescribe env(safe-area-inset-top) a 59 px
// (iPhone 14 Pro y posteriores) en el CSS servido. Pantalla de PWA a pantalla
// completa: 393 × 852. Solo contra la base local desechable.
const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_CUSTOMER_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;

const SAFE_TOP = 59;
const STANDALONE = { width: 393, height: 852 };
const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const ORDER_CODE = '4826';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de la franja superior solo puede preparar datos en una base local desechable.');
  }
}

// Piloto abierto y un pedido pendiente (para el ticket y el rechazo).
async function prepare() {
  assertDisposableDatabase(DB_URL);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!customer || !business) throw new Error('Faltan el cliente o el negocio Spirit Montcada en la base local.');
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only)
      values ($1, true, true) on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await db.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, customer.id]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at)
      values ($1, $2, now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business.id, ORDER_CODE]);
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business.id, 'cafes-latte']);
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    // Número reservado en el contador, como create_order.
    const { rows: [{ last }] } = await db.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(
        private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)
      ) + 1
      returning last_number as last`, [business.id]);
    const { rows: [order] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at)
      values ($1, $2, $3, ${today}, 'Terraza 2', 'pending', 1300, 'Sin lactosa, por favor', now() - interval '1 minute') returning id`, [business.id, customer.id, Number(last)]);
    await db.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
      ($1, $2, 'cafes-latte', 1, 2, 250, 'Latte', 500), ($1, $2, 'tostadas-aguacate', 2, 1, 800, 'Tostada de aguacate', 800)`, [order.id, business.id]);
    return { orderNumber: Number(last) };
  } finally {
    await db.end();
  }
}

// Reescribe env(safe-area-inset-top) en todas las hojas de estilo servidas. El
// service worker se bloquea en el contexto: si no, sirve el CSS de su caché y
// page.route no lo ve.
async function simulateNotch(page) {
  await page.route(/\.css(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/env\(\s*safe-area-inset-top\s*(?:,[^)]*)?\)/g, `${SAFE_TOP}px`);
    await route.fulfill({ response, body });
  });
}

// Controles visibles, no tapados, que quedan dentro de la franja en reposo, y
// diálogos cuyo borde superior entra en ella.
async function bandOffenders(page) {
  return page.evaluate((band) => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const describe = (element) => {
      const label = element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || element.id || '';
      return `${element.tagName.toLowerCase()} «${label.replace(/\s+/g, ' ').trim().slice(0, 48)}»`;
    };
    const controls = [...document.querySelectorAll(selector)].filter((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= band) return false;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
      // Sólo lo que de verdad está a la vista en esa franja (no lo tapado por un diálogo).
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + 1, 0), band - 1);
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === element || element.contains(hit));
    }).map((element) => `${describe(element)} (top ${Math.round(element.getBoundingClientRect().top)} px)`);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
      .filter((dialog) => dialog.getBoundingClientRect().height && dialog.getBoundingClientRect().top < band)
      .map((dialog) => `diálogo «${(dialog.getAttribute('aria-label') || document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}» (top ${Math.round(dialog.getBoundingClientRect().top)} px)`);
    return [...dialogs, ...controls];
  }, SAFE_TOP);
}

const report = new Map();
async function check(page, screen) {
  // Reposo: sin animaciones de entrada en curso y con el scroll arriba.
  await page.waitForTimeout(450);
  const offenders = await bandOffenders(page);
  report.set(screen, offenders);
  expect.soft(offenders, `${screen}: nada en la franja de ${SAFE_TOP} px`).toEqual([]);
}

// Caso en riesgo: un diálogo con más contenido que la pantalla (errores,
// textos largos) debe seguir empezando por debajo de la franja.
async function checkTallDialog(page, screen) {
  await page.getByRole('dialog').evaluate((dialog) => {
    const filler = document.createElement('div');
    filler.setAttribute('data-e2e-filler', '');
    filler.style.height = '2000px';
    (dialog.querySelector('[data-checkout-body], form') || dialog).append(filler);
  });
  await check(page, `${screen} (más alto que la pantalla)`);
  await page.locator('[data-e2e-filler]').evaluate((filler) => filler.remove());
}

async function simulateKeyboard(page, visibleHeight) {
  await page.evaluate((height) => {
    const viewport = window.visualViewport;
    Object.defineProperty(viewport, 'height', { configurable: true, get: () => height });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, get: () => 0 });
    viewport.dispatchEvent(new Event('resize'));
  }, visibleHeight);
}

let orderNumber;

test.beforeAll(async () => {
  if (!e2eEnabled) return;
  ({ orderNumber } = await prepare());
});

test.afterAll(() => {
  if (!report.size) return;
  const lines = [...report].map(([screen, offenders]) => `${offenders.length ? '✘' : '✓'} ${screen}${offenders.length ? `\n    ${offenders.join('\n    ')}` : ''}`);
  console.log(`\nFranja superior (${SAFE_TOP} px):\n${lines.join('\n')}`);
});

e2eTest('cliente: pantallas y diálogos fuera de la franja de la barra de estado', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'webkit', 'La franja de la barra de estado es de iOS: se comprueba en WebKit.');
  const context = await browser.newContext({ ...testInfo.project.use, viewport: STANDALONE, baseURL: testInfo.project.use.baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await simulateNotch(page);

  // Intro y onboarding (sin haber entrado nunca).
  await page.goto('/');
  await check(page, 'Cliente · intro');
  await page.getByRole('button', { name: 'Omitir' }).click().catch(() => {});
  await page.waitForTimeout(600);
  await check(page, 'Cliente · onboarding');

  // Acceso.
  await page.evaluate(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await check(page, 'Cliente · iniciar sesión');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).first().click();
  await check(page, 'Cliente · crear cuenta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await check(page, 'Cliente · inicio');

  const stamp = page.locator('[data-action="request-stamp"]').first();
  if (await stamp.count()) {
    await stamp.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(page, 'Cliente · solicitud de sello');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  }

  for (const [nav, name] of [['rewards', 'premios'], ['history', 'historial'], ['profile', 'perfil']]) {
    await page.locator(`[data-nav="${nav}"]`).first().click();
    await check(page, `Cliente · ${name}`);
  }

  // Diálogos del perfil.
  for (const [action, name] of [['open-personal', 'datos personales'], ['open-appearance', 'apariencia'], ['open-language', 'idioma'], ['open-delete-account', 'eliminar cuenta']]) {
    const trigger = page.locator(`[data-action="${action}"]`).first();
    if (!(await trigger.count())) continue;
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(page, `Cliente · diálogo ${name}`);
    if (action === 'open-personal') {
      await checkTallDialog(page, 'Cliente · diálogo datos personales');
      // Cambiar contraseña se abre desde datos personales.
      await page.getByRole('dialog').locator('[data-action="open-password"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await check(page, 'Cliente · diálogo cambiar contraseña');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    // Algunos diálogos se abren desde otro (p. ej. contraseña desde datos personales).
    await page.locator('[data-nav="profile"]').first().click();
  }

  // Carta, carrito, confirmación (con y sin teclado) y pedidos.
  await page.locator('[data-nav="home"]').first().click();
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await check(page, 'Cliente · carta');
  await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await page.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
  await check(page, 'Cliente · carrito');
  await page.getByRole('button', { name: 'Continuar' }).click();
  const checkout = page.getByRole('dialog', { name: 'Confirmar pedido' });
  await expect(checkout).toBeVisible();
  await check(page, 'Cliente · confirmación del pedido');
  await checkTallDialog(page, 'Cliente · confirmación del pedido');
  await checkout.getByLabel('Tu mesa').focus();
  await simulateKeyboard(page, 470);
  await check(page, 'Cliente · confirmación con teclado');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Volver a la carta' }).click();
  await page.getByRole('button', { name: 'Mis pedidos' }).click();
  await check(page, 'Cliente · mis pedidos');

  await context.close();
});

e2eTest('/cafeteria: panel, ticket y diálogos fuera de la franja de la barra de estado', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'webkit', 'La franja de la barra de estado es de iOS: se comprueba en WebKit.');
  // El panel también se usa en un iPhone: misma pantalla de PWA.
  const context = await browser.newContext({ ...testInfo.project.use, viewport: STANDALONE, baseURL: testInfo.project.use.baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await simulateNotch(page);
  await page.addInitScript(() => { window.print = () => {}; });

  await page.goto('/cafeteria');
  await check(page, 'Cafetería · acceso');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
  await page.getByRole('button', { name: 'Acceder' }).click();
  const otpInput = page.getByLabel('Código de 6 dígitos');
  const home = page.getByRole('tablist', { name: 'Secciones del modo cafetería' });
  await expect(otpInput.or(home)).toBeVisible();
  if (await otpInput.isVisible()) {
    await check(page, 'Cafetería · verificación MFA');
    const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET), digits: 6, period: 30 }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
  await check(page, 'Cafetería · inicio');

  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  const card = page.getByRole('article', { name: `Pedido nº ${orderNumber}`, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  await check(page, 'Cafetería · pedidos');
  await card.getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${orderNumber},`) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check(page, 'Cafetería · ticket del pedido');
  await checkTallDialog(page, 'Cafetería · ticket del pedido');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check(page, 'Cafetería · diálogo rechazar');
  await checkTallDialog(page, 'Cafetería · diálogo rechazar');
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Panel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
  await check(page, 'Cafetería · panel de control');
  await page.getByRole('button', { name: 'Regenerar código' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check(page, 'Cafetería · diálogo regenerar código');
  await page.keyboard.press('Escape');

  const loyalty = page.getByRole('tab', { name: /Fidelización/ });
  if (await loyalty.count()) {
    await loyalty.click();
    await check(page, 'Cafetería · fidelización');
  }

  await context.close();
});

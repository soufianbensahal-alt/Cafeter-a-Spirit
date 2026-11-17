import { expect, test } from '@playwright/test';
import pg from 'pg';

// Bloqueo del scroll con diálogos (Android y iPhone): se abre y se cierra
// cada diálogo por todas las vías (×, Escape, fondo, atrás, selección, cierre
// de sesión, y con la red de seguridad cuando desaparece sin cerrarse) y la
// página debe volver a desplazarse siempre. También la pantalla de
// bienvenida (splash-active) y la barra de progreso del seguimiento en claro
// y oscuro. Solo contra la base local desechable.
const required = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_CUSTOMER_PASSWORD'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });
test.use({ serviceWorkers: 'block' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

async function db(run) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

// Un pedido activo del cliente en el estado dado.
async function prepareOrder(status) {
  return db(async (client) => {
    const { rows: [business] } = await client.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    const { rows: [customer] } = await client.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    await client.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only) values ($1, true, true)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await client.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, customer.id]);
    await client.query(`update public.orders set status = 'cancelled', cancelled_at = now() where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    const { rows: [{ last }] } = await client.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)) + 1
      returning last_number as last`, [business.id]);
    const stamps = status === 'preparing' ? ', accepted_at = now(), preparing_at = now()' : '';
    const { rows: [order] } = await client.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, created_at)
      values ($1, $2, $3, ${today}, 'Barra', $4, 250, now() - interval '2 minutes') returning id`, [business.id, customer.id, Number(last), status]);
    if (stamps) await client.query(`update public.orders set updated_at = now() ${stamps} where id = $1`, [order.id]);
    await client.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
      values ($1, $2, 'cafes-latte', 1, 1, 250, 'Latte', 250)`, [order.id, business.id]);
    return { id: order.id, number: Number(last) };
  });
}

const pressBack = (page) => page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {});

// La página puede desplazarse de verdad: sin clases de bloqueo y moviéndose.
async function expectScrollFree(page, label) {
  await expect.poll(() => page.evaluate(() => [
    document.documentElement.classList.contains('modal-open'),
    document.documentElement.classList.contains('splash-active'),
    document.querySelector('#app')?.inert === true
  ]), { message: label }).toEqual([false, false, false]);
  const moved = await page.evaluate(async () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 240, behavior: 'auto' });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const y = window.scrollY;
    window.scrollTo({ top: 0, behavior: 'auto' });
    return y;
  });
  expect(moved, `${label}: la página se desplaza`).toBeGreaterThan(0);
}

// Cierra el diálogo abierto por la vía indicada.
async function closeBy(page, dialog, how) {
  if (how === '×') await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
  if (how === 'Escape') await page.keyboard.press('Escape');
  if (how === 'fondo') await page.locator('[data-sheet-backdrop]').click({ position: { x: 4, y: 4 } });
  if (how === 'atrás') await pressBack(page);
  await expect(dialog).toBeHidden();
}

let page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.locator('form[data-form="customer-auth"] [type="submit"]').click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
});

test.afterAll(async () => {
  await page?.context().close();
});

e2eTest('perfil, «Datos personales»: ×, Escape, fondo y atrás liberan el scroll', async () => {
  await page.getByRole('button', { name: 'Perfil' }).first().click();
  for (const how of ['×', 'Escape', 'fondo', 'atrás']) {
    await page.getByRole('button', { name: 'Datos personales' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/modal-open/);
    await closeBy(page, dialog, how);
    await expectScrollFree(page, `Datos personales · ${how}`);
  }
});

e2eTest('apariencia: elegir una opción cierra y libera el scroll', async () => {
  await page.getByRole('button', { name: /Apariencia/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sistema' }).click();
  await expect(dialog).toBeHidden();
  await expectScrollFree(page, 'Apariencia · selección');
});

e2eTest('confirmación del pedido: ×, Escape, fondo y atrás liberan el scroll', async () => {
  await page.getByRole('button', { name: 'Inicio' }).first().click();
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  if (!(await page.locator('.cart-bar').count())) await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await page.locator('.cart-bar').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
  for (const how of ['×', 'Escape', 'fondo', 'atrás']) {
    await page.getByRole('button', { name: 'Continuar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirmar pedido' });
    await expect(dialog).toBeVisible();
    await closeBy(page, dialog, how);
    await expect(page.locator('html')).not.toHaveClass(/modal-open/);
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  }
  // En la carta (página larga) se comprueba que de verdad se desplaza.
  await page.getByRole('button', { name: 'Volver a la carta' }).click();
  await expectScrollFree(page, 'carta tras la confirmación');
});

e2eTest('red de seguridad: un diálogo que desaparece sin cerrarse no deja la página bloqueada', async () => {
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await page.getByRole('button', { name: 'Perfil' }).first().click();
  // Repintado / cambio de pantalla.
  await page.getByRole('button', { name: 'Datos personales' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => document.querySelector('[data-sheet-backdrop]').remove());
  await expect(page.locator('html')).toHaveClass(/modal-open/);
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state })));
  await page.evaluate(() => document.querySelector('[data-nav="home"]')?.click());
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await expectScrollFree(page, 'diálogo quitado + cambio de pantalla');
  // Error inesperado.
  await page.getByRole('button', { name: 'Perfil' }).first().click();
  await page.getByRole('button', { name: 'Datos personales' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('[data-sheet-backdrop]').remove();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Fallo simulado' }));
  });
  await expectScrollFree(page, 'diálogo quitado + error');
});

e2eTest('seguimiento: la barra de progreso muestra los tramos hechos y el actual, en claro y oscuro', async () => {
  const contrast = (locator, against) => locator.evaluate((element, otherSelector) => {
    const parse = (value) => { const m = value.match(/rgba?\(([^)]+)\)/); const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const solid = (node) => {
      const layers = [];
      for (let n = node; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); }
      return layers.reverse().reduce((acc, layer) => over(layer, acc), { r: 255, g: 255, b: 255, a: 1 });
    };
    const lum = ({ r, g, b }) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = solid(element);
    const b = solid(document.querySelector(otherSelector));
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }, against);
  const order = await prepareOrder('preparing');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    // theme-color sigue al tema (barras del sistema).
    await expect(page.locator('#theme-color')).toHaveAttribute('content', scheme === 'dark' ? '#171612' : '#eecf62');
    await page.getByRole('button', { name: /pedido en curso/ }).click();
    await page.locator(`[data-open-order="${order.id}"]`).click();
    const steps = page.locator('.order-progress__step');
    await expect(steps).toHaveCount(4);
    await expect(page.locator('.order-progress__step--done')).toHaveCount(2);
    await expect(page.locator('.order-progress__step--current')).toHaveCount(1);
    const done = page.locator('.order-progress__step--done .order-progress__dot').first();
    const current = page.locator('.order-progress__step--current .order-progress__dot');
    // Hechos y actual se distinguen del pendiente y del fondo (≥ 3:1, WCAG 1.4.11).
    expect(await contrast(done, '.order-progress__step:last-child .order-progress__dot'), `hecho vs pendiente (${scheme})`).toBeGreaterThanOrEqual(3);
    expect(await contrast(current, '.order-progress__step:last-child .order-progress__dot'), `actual vs pendiente (${scheme})`).toBeGreaterThanOrEqual(3);
    expect(await contrast(done, '.order-progress'), `hecho vs fondo (${scheme})`).toBeGreaterThanOrEqual(3);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: null });
});

e2eTest('cerrar sesión desde otra pestaña con un diálogo abierto: se cierra y libera el scroll', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Perfil' }).first().click();
  await page.getByRole('button', { name: 'Datos personales' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
  await other.getByRole('button', { name: 'Perfil' }).first().click();
  await other.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await expectScrollFree(page, 'sesión cerrada en otra pestaña');
  await other.close();
});

e2eTest('pantalla de bienvenida: al terminar no deja la página bloqueada', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  const fresh = await context.newPage();
  await fresh.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await fresh.goto('/');
  await expect(fresh.locator('section.guest-entry')).toBeVisible({ timeout: 15000 });
  await expectScrollFree(fresh, 'tras la bienvenida');
  await context.close();
});

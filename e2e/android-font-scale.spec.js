import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Letra del sistema ampliada (Android, 130–200 %) en un móvil de 360 px:
//   · «zoom»: Chrome aplica el tamaño del sistema como zoom de página; el ancho
//     útil baja a 360/escala (277, 240 y 180 px).
//   · «texto»: Samsung Internet y los WebView escalan solo las letras; se
//     simula multiplicando el tamaño calculado de cada elemento.
// En login con la promo, carta, carrito, confirmación y panel nada debe
// recortarse ni salirse por la derecha. Solo contra la base local desechable.
const required = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_CUSTOMER_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const CASES = [['zoom', 1.3], ['zoom', 1.5], ['zoom', 2], ['texto', 1.3], ['texto', 1.5], ['texto', 2]];

async function db(run) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

// Pedidos abiertos para el cliente del piloto y un pedido pendiente para el panel.
async function prepare() {
  await db(async (client) => {
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
    const { rows: [order] } = await client.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at)
      values ($1, $2, $3, ${today}, 'Terraza 2', 'pending', 1300, 'Sin lactosa, por favor', now() - interval '1 minute') returning id`, [business.id, customer.id, Number(last)]);
    await client.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
      ($1, $2, 'cafes-latte', 1, 2, 250, 'Latte', 500), ($1, $2, 'tostadas-aguacate', 2, 1, 800, 'Tostada de aguacate', 800)`, [order.id, business.id]);
  });
}

// Escalado solo del texto (como Samsung Internet o un WebView): una hoja de
// estilos multiplica cada font-size declarado en el CSS de la app (y el tamaño
// raíz, del que dependen rem y los heredados). Idempotente y estable aunque
// la app repinte. scale = 1 la quita.
async function setTextScale(page, scale) {
  await page.evaluate((value) => {
    document.querySelector('style[data-text-scale]')?.remove();
    if (value === 1) return;
    const out = [`html { font-size: ${16 * value}px !important; }`];
    const scaled = (size) => {
      const match = /^(-?[\d.]+)px$/.exec(size.trim());
      if (match) return `${Number(match[1]) * value}px`;
      if (/^(clamp|calc|min|max)\(/.test(size.trim())) return `calc(${size} * ${value})`;
      return null; // em, %, rem: ya escalan con el padre o la raíz.
    };
    const walk = (rules, wrap) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.media) { walk(rule.cssRules, (css) => wrap(`@media ${rule.media.mediaText} { ${css} }`)); continue; }
        if (rule.cssRules && rule.conditionText) { walk(rule.cssRules, (css) => wrap(`@supports ${rule.conditionText} { ${css} }`)); continue; }
        if (!rule.selectorText || !rule.style) continue;
        const size = rule.style.getPropertyValue('font-size');
        const next = size && scaled(size);
        if (next) out.push(wrap(`${rule.selectorText} { font-size: ${next} !important; }`));
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      walk(rules, (css) => css);
    }
    const style = document.createElement('style');
    style.dataset.textScale = '1';
    style.textContent = out.join('\n');
    document.head.append(style);
  }, scale);
}

async function setCase(page, [mode, scale]) {
  await page.setViewportSize(mode === 'zoom' ? { width: Math.round(360 / scale), height: Math.round(740 / scale) } : { width: 360, height: 740 });
  await setTextScale(page, mode === 'texto' ? scale : 1);
  await page.waitForTimeout(150);
}

// Texto recortado (contenedor que corta) o elementos que se salen por la
// derecha. Las tiras con desplazamiento horizontal propio no cuentan.
async function problems(page, scope = 'body') {
  return page.evaluate((selector) => {
    const found = [];
    const root = document.querySelector(selector) || document.body;
    for (const element of root.querySelectorAll('*:not(svg *):not(.sr-only):not(script):not(style)')) {
      const rect = element.getBoundingClientRect();
      // Sin caja o visualmente oculto a propósito (1×1 px, con nombre accesible en su botón).
      if (rect.width <= 1 || rect.height <= 1) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || element.closest('.sr-only, [aria-hidden="true"] .sr-only')) continue;
      // Tiras con desplazamiento horizontal propio (categorías de la carta).
      if (element.closest('.menu-categories, .menu-category-tabs, [data-menu-categories]')) continue;
      const parent = element.parentElement;
      const name = `${parent ? `${parent.tagName.toLowerCase()}.${String(parent.className).split(' ')[0]} > ` : ''}${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} «${(element.textContent || '').trim().slice(0, 24)}»`;
      const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      const clipsX = /hidden|clip/.test(style.overflowX) || style.textOverflow === 'ellipsis';
      const clipsY = /hidden|clip/.test(style.overflowY);
      if (ownText && clipsX && element.scrollWidth > element.clientWidth + 1) found.push(`${name} recorta texto`);
      if (ownText && clipsY && element.scrollHeight > element.clientHeight + 1) found.push(`${name} recorta texto (alto)`);
      if (style.position !== 'fixed' && rect.right > window.innerWidth + 1) found.push(`${name} se sale ${Math.round(rect.right - window.innerWidth)} px`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`la página se desplaza en horizontal (${document.documentElement.scrollWidth} px)`);
    return [...new Set(found)];
  }, scope);
}

async function expectClean(page, label, testCase, scope) {
  await expect.poll(() => problems(page, scope), { message: `${label} · ${testCase.join(' ')}`, timeout: 3000 }).toEqual([]);
  if (process.env.SPIRIT_FONT_SHOTS && testCase[1] === 2) await page.screenshot({ path: `${process.env.SPIRIT_FONT_SHOTS}/${label}-${testCase[0]}.png`, fullPage: true });
}

let customer;
let panel;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  await prepare();
  const options = { ...testInfo.project.use, serviceWorkers: 'block', reducedMotion: 'reduce' };
  customer = await (await browser.newContext(options)).newPage();
  panel = await (await browser.newContext(options)).newPage();
});

test.afterAll(async () => {
  await customer?.context().close();
  await panel?.context().close();
});

e2eTest('login con la promo: nada recortado ni fuera de pantalla', async () => {
  await customer.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await customer.goto('/login');
  await expect(customer.locator('section.signup-promo h2')).toBeVisible();
  for (const testCase of CASES) {
    await setCase(customer, testCase);
    await expectClean(customer, 'login', testCase);
    await expect(customer.locator('section.signup-promo').getByRole('button', { name: 'Crear mi cuenta' })).toBeVisible();
  }
  await setCase(customer, ['texto', 1]);
});

e2eTest('carta, carrito y confirmación: nada recortado ni fuera de pantalla', async () => {
  await customer.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await customer.getByLabel('Contraseña', { exact: true }).fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await customer.locator('form[data-form="customer-auth"] [type="submit"]').click();
  await expect(customer.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  for (const testCase of CASES) {
    await setCase(customer, testCase);
    await expectClean(customer, 'inicio', testCase);
    await customer.getByRole('button', { name: 'Carta: Ver menú' }).click();
    await expect(customer.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
    if (!(await customer.getByRole('button', { name: /^Ver carrito/ }).count())) {
      await customer.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
    }
    await expectClean(customer, 'carta', testCase);
    await customer.getByRole('button', { name: /^Ver carrito/ }).click();
    await expect(customer.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
    await expectClean(customer, 'carrito', testCase);
    await customer.getByRole('button', { name: 'Continuar' }).click();
    const dialog = customer.getByRole('dialog', { name: 'Confirmar pedido' });
    await expect(dialog).toBeVisible();
    await expectClean(customer, 'confirmación', testCase, '[role="dialog"]');
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeInViewport();
    await expect(dialog.locator('[data-checkout-submit]')).toBeInViewport({ ratio: 0.99 });
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await customer.getByRole('button', { name: 'Volver a la carta' }).click();
    await customer.getByRole('button', { name: 'Volver al inicio' }).click();
    await expect(customer.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  }
});

async function employeeLogin(page) {
  await page.goto('/cafeteria');
  const otp = page.getByLabel('Código de 6 dígitos');
  const home = page.getByRole('tablist', { name: 'Secciones del modo cafetería' });
  const email = page.getByLabel('Correo electrónico');
  await expect(otp.or(home).or(email)).toBeVisible();
  if (await email.isVisible()) {
    await email.fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
    await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
    await page.getByRole('button', { name: 'Acceder' }).click();
    await expect(otp.or(home)).toBeVisible();
  }
  if (await otp.isVisible()) {
    await otp.fill(new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET), digits: 6, period: 30 }).generate());
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(home).toBeVisible();
}

e2eTest('panel: pedidos, ticket, día pasado y control sin recortes', async () => {
  await employeeLogin(panel);
  for (const testCase of CASES) {
    await setCase(panel, testCase);
    await panel.getByRole('tab', { name: /^Pedidos/ }).click();
    await expect(panel.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
    await expect(panel.locator('article.order-ticket').first()).toBeVisible();
    await expectClean(panel, 'pedidos', testCase);
    await panel.getByRole('button', { name: /^Ver ticket del pedido/ }).first().click();
    await expect(panel.getByRole('dialog')).toBeVisible();
    await expectClean(panel, 'ticket', testCase, '[role="dialog"]');
    await panel.keyboard.press('Escape');
    await panel.getByRole('button', { name: 'Día anterior' }).click();
    await expect(panel.locator('[data-orders-history]')).toBeVisible();
    await expectClean(panel, 'día pasado', testCase);
    await panel.getByRole('button', { name: 'Hoy', exact: true }).click();
    await panel.getByRole('tab', { name: 'Panel' }).click();
    await expect(panel.locator('.control-card').first()).toBeVisible();
    await expectClean(panel, 'control', testCase);
  }
});

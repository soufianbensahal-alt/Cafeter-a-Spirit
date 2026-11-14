import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Selector de día del panel (/cafeteria → Pedidos), contraste de la franja del
// empleado y tarjeta «Invitados (últimos 14 días)».
// En chromium-mobile (Android, Pixel 7) el ancho de 360 px es el Android de
// 360 px; webkit-mobile es el iPhone. Solo contra la base local desechable.
const required = ['SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const WIDTHS = [320, 360, 375, 393, 768, 1280];

async function db(query, params = []) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows;
  } finally {
    await client.end();
  }
}

const setRole = (role) => db(`update public.business_members set role = $3
  where business_id = (select id from public.businesses where lower(btrim(name)) = lower(btrim($1)))
    and user_id = (select id from auth.users where lower(email) = lower($2))`, [BUSINESS_NAME, process.env.SPIRIT_E2E_EMPLOYEE_EMAIL, role]);
const setGuestOrdering = (enabled) => db(`update public.business_ordering_settings set guest_ordering_enabled = $2
  where business_id = (select id from public.businesses where lower(btrim(name)) = lower(btrim($1)))`, [BUSINESS_NAME, enabled]);

const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shortDate = (iso) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));

async function signIn(page) {
  await page.goto('/cafeteria');
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
}

let context;
let page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  await setRole('manager');
  await setGuestOrdering(false);
  // Sin service worker para poder simular la RPC de vigilancia.
  context = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL, serviceWorkers: 'block' });
  page = await context.newPage();
  await signIn(page);
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
});

test.afterAll(async () => {
  if (!e2eEnabled) return;
  await setRole('employee');
  await setGuestOrdering(false);
  await context?.close();
});

const bar = () => page.getByRole('group', { name: 'Día de los pedidos' });
const prev = () => bar().getByRole('button', { name: 'Día anterior' });
const next = () => bar().getByRole('button', { name: 'Día siguiente' });
const todayButton = () => page.getByRole('button', { name: 'Hoy', exact: true });

async function expectNoOverlap(width) {
  const [p, f, n, i] = await Promise.all([prev().boundingBox(), page.locator('.orders-datebar__field').boundingBox(), next().boundingBox(), page.locator('#orders-date').boundingBox()]);
  const label = `${width} px`;
  expect(p.width, `${label}: «‹» de 44 px`).toBeCloseTo(44, 0);
  expect(n.width, `${label}: «›» de 44 px`).toBeCloseTo(44, 0);
  expect(p.x + p.width, `${label}: «‹» antes de la fecha`).toBeLessThanOrEqual(f.x + 0.5);
  expect(f.x + f.width, `${label}: la fecha antes de «›»`).toBeLessThanOrEqual(n.x + 0.5);
  expect(n.x + n.width, `${label}: «›» dentro de la pantalla`).toBeLessThanOrEqual(width + 0.5);
  expect(p.x, `${label}: «‹» dentro de la pantalla`).toBeGreaterThanOrEqual(-0.5);
  // El input transparente cubre la caja de la fecha salvo su borde de 1 px.
  expect(i.x, `${label}: input dentro (izq.)`).toBeGreaterThanOrEqual(f.x - 0.5);
  expect(i.x + i.width, `${label}: input dentro (der.)`).toBeLessThanOrEqual(f.x + f.width + 0.5);
  expect(f.width - i.width, `${label}: input cubre el ancho`).toBeLessThanOrEqual(2.5);
  expect(f.height - i.height, `${label}: input cubre el alto`).toBeLessThanOrEqual(2.5);
  const overflow = await page.locator('.orders-datebar__display').evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow, `${label}: la fecha cabe`).toBeLessThanOrEqual(1);
}

e2eTest('«‹», fecha y «›» no se solapan en 320, 360, 375, 393 px, tablet y escritorio (hoy y otro día)', async () => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 820 });
    // El panel se repinta con Realtime: se mide de nuevo hasta que esté estable.
    await expect(async () => expectNoOverlap(width)).toPass();
  }
  await prev().click();
  await expect(todayButton()).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 820 });
    // El panel se repinta con Realtime: se mide de nuevo hasta que esté estable.
    await expect(async () => expectNoOverlap(width)).toPass();
  }
  await todayButton().click();
  await page.setViewportSize({ width: 393, height: 852 });
});

e2eTest('la fecha se ve como «vie, 13 nov 2026» y el input es el único control', async () => {
  const today = madridToday();
  await expect(page.locator('[data-history-display]')).toHaveText(shortDate(today));
  await expect(page.locator('[data-history-display]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-history-display]')).toHaveCSS('pointer-events', 'none');
  const input = bar().getByLabel('Fecha');
  await expect(input).toHaveValue(today);
  await expect(input).toHaveAttribute('aria-describedby', 'orders-date-description');
  await expect(page.locator('#orders-date-description')).toHaveText(/^\S+, \d{1,2} de \S+ de \d{4}$/);
  // Un toque en el centro de la fecha llega al input (no a la etiqueta).
  const hit = await page.locator('.orders-datebar__field').evaluate((field) => {
    const box = field.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.id;
  });
  expect(hit).toBe('orders-date');
});

e2eTest('con Tab hay una sola parada entre «‹» y «›»', async ({ browserName }) => {
  // Safari sólo lleva el Tab a todos los controles con Option+Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await prev().focus();
  await page.keyboard.press(tab);
  await expect(bar().getByLabel('Fecha')).toBeFocused();
  await page.keyboard.press(tab);
  await expect(next()).toBeFocused();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
  await expect(bar().getByLabel('Fecha')).toBeFocused();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
  await expect(prev()).toBeFocused();
});

e2eTest('«Hoy» sólo fuera de hoy, junto al título; al volver el foco va al título', async () => {
  await expect(todayButton()).toHaveCount(0);
  await prev().click();
  await expect(bar().getByLabel('Fecha')).not.toHaveValue(madridToday());
  const [title, button] = await Promise.all([page.getByRole('heading', { level: 1, name: 'Pedidos' }).boundingBox(), todayButton().boundingBox()]);
  expect(button.x).toBeGreaterThan(title.x + title.width - 1);
  expect(Math.abs((button.y + button.height / 2) - (title.y + title.height / 2))).toBeLessThan(title.height);
  await todayButton().focus();
  await page.keyboard.press('Enter');
  await expect(todayButton()).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeFocused();
});

e2eTest('en el límite la flecha sigue visible, con aria-disabled y sin efecto', async () => {
  const today = madridToday();
  await expect(next()).toHaveAttribute('aria-disabled', 'true');
  await expect(next()).toBeVisible();
  expect((await next().boundingBox()).width).toBeCloseTo(44, 0);
  expect(Number(await next().evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(1);
  // Playwright no pulsa botones con aria-disabled: se fuerza el toque.
  await next().click({ force: true });
  await expect(bar().getByLabel('Fecha')).toHaveValue(today);
  await expect(prev()).toHaveAttribute('aria-disabled', 'false');
});

// Contraste real: color del texto frente al fondo compuesto de sus ancestros.
async function contrastOf(locator) {
  return locator.evaluate((element) => {
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b, a = 1] = match[1].split(',').map((part) => Number(part.trim()));
      return { r, g, b, a };
    };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) layers.push(color);
    }
    let background = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) background = over(layer, background);
    const text = over(parse(getComputedStyle(element).color), background);
    const lum = ({ r, g, b }) => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const [l1, l2] = [lum(text), lum(background)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  });
}

e2eTest('franja del empleado: rol y «Vista cliente» o «Activa» por encima de 4.5:1, en claro y oscuro', async () => {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    const role = page.locator('.employee-strip > div > span').first();
    const status = page.locator('.employee-strip .employee-status');
    expect(await contrastOf(role), `rol (${scheme})`).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(status), `estado (${scheme})`).toBeGreaterThanOrEqual(4.5);
  }
  await page.emulateMedia({ colorScheme: 'light' });
});

const rows = (today, first) => [first, ...Array.from({ length: 13 }, (_, index) => ({ day: `${today}-${index}`, guests: 0, guests_with_orders: 0 }))].map((row, index) => ({ ...row, day: index === 0 ? today : '2026-01-01' }));
async function mockSignups(data) {
  await page.unroute('**/rest/v1/rpc/get_guest_signups_by_day');
  await page.route('**/rest/v1/rpc/get_guest_signups_by_day', (route) => route.fulfill({ json: data }));
}
async function openPanel() {
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  await page.getByRole('tab', { name: 'Panel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
}

e2eTest('tarjeta de invitados: oculta sin interruptor ni invitados; visible al activarlo; días a revisar resaltados', async () => {
  const today = madridToday();
  const guestCard = page.locator('[data-guest-signups]');
  await mockSignups(rows(today, { guests: 0, guests_with_orders: 0 }));
  await openPanel();
  await expect(page.getByRole('switch', { name: 'Pedidos sin cuenta', exact: true })).not.toBeChecked();
  await expect(guestCard).toHaveCount(0);

  // Al activar «Pedidos sin cuenta» aparece, con la tabla plegada.
  await page.getByRole('switch', { name: 'Pedidos sin cuenta', exact: true }).locator('xpath=..').click();
  await expect(guestCard).toBeVisible();
  await expect(guestCard.locator('details')).not.toHaveAttribute('open', '');
  await expect(guestCard.getByText('Ver por día')).toBeVisible();
  await expect(guestCard.locator('[data-guest-signups-alert]')).toHaveCount(0);

  // Un día con 25 invitados y 2 con pedido (8 %): a revisar.
  await mockSignups(rows(today, { guests: 25, guests_with_orders: 2 }));
  await openPanel();
  await expect(guestCard.locator('[data-guest-signups-alert]')).toHaveText('Hay 1 día a revisar: muchos invitados y pocos pedidos.');
  await expect(guestCard.locator('details')).toHaveAttribute('open', '');
  const flagged = guestCard.locator('[data-guest-day-alert]');
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText('Revisar');

  // Con el interruptor apagado pero invitados recientes, sigue visible.
  await page.getByRole('switch', { name: 'Pedidos sin cuenta', exact: true }).locator('xpath=..').click();
  await expect(page.getByRole('switch', { name: 'Pedidos sin cuenta', exact: true })).not.toBeChecked();
  await expect(guestCard).toBeVisible();
  await page.unroute('**/rest/v1/rpc/get_guest_signups_by_day');
});

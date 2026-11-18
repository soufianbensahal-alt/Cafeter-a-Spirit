import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Android, fase 2: «Instalar en este dispositivo» del Panel, selector de día
// con el selector nativo y avisos del panel (vibración, Wake Lock con ahorro de
// batería y sonido). La hoja del cliente está en install-sheet.spec.js. Solo
// contra la base local desechable.
const panelVars = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_EMPLOYEE_EMAIL', 'SPIRIT_E2E_EMPLOYEE_PASSWORD', 'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'];
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const panelEnabled = e2eEnabled && panelVars.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
const panelTest = panelEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });
test.use({ serviceWorkers: 'block' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

// beforeinstallprompt simulado: Playwright no lo dispara. __fireInstall() lo
// lanza como Chrome; prompt() cuenta las llamadas.
async function fakeInstallPrompt(page, { outcome = 'accepted', installed = false } = {}) {
  await page.addInitScript(([choice, standalone]) => {
    localStorage.setItem('spirit-onboarded', '1');
    window.__installCalls = 0;
    window.__fireInstall = () => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.__installCalls += 1; };
      event.userChoice = Promise.resolve({ outcome: choice });
      window.dispatchEvent(event);
    };
    if (standalone) {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query)
        ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
        : original(query));
    }
  }, [outcome, installed]);
}

// ---------------------------------------------------------------------------
// Panel en la tablet: aviso de instalación, selector de día y avisos.
// ---------------------------------------------------------------------------
async function db(run) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function insertPendingOrder() {
  return db(async (client) => {
    const { rows: [business] } = await client.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    const { rows: [customer] } = await client.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    const { rows: [{ last }] } = await client.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 1)
      on conflict (business_id, service_date) do update set last_number = greatest(private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)) + 1
      returning last_number as last`, [business.id]);
    const { rows: [order] } = await client.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, created_at)
      values ($1, $2, $3, ${today}, 'Barra', 'pending', 250, now()) returning id`, [business.id, customer.id, Number(last)]);
    await client.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
      values ($1, $2, 'cafes-latte', 1, 1, 250, 'Latte', 250)`, [order.id, business.id]);
    return Number(last);
  });
}

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

let panel;

panelTest('panel: «Instalar en este dispositivo» con pasos o diálogo nativo', async ({ browser }, testInfo) => {
  panel = await (await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' })).newPage();
  await fakeInstallPrompt(panel);
  // Dispositivo simulado: vibración, Wake Lock (rechazado al principio, como
  // con el ahorro de batería) y osciladores de audio contados.
  await panel.addInitScript(() => {
    window.__vibrations = [];
    navigator.vibrate = (pattern) => { window.__vibrations.push(pattern); return true; };
    window.__wakeLockFails = true;
    window.__wakeLockRequests = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wakeLockRequests += 1;
          if (window.__wakeLockFails) throw new DOMException('Ahorro de batería', 'NotAllowedError');
          return Object.assign(new EventTarget(), { released: false, release() { this.released = true; } });
        }
      }
    });
    window.__oscillators = 0;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const original = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function createOscillator(...args) { window.__oscillators += 1; return original.apply(this, args); };
    window.__showPickerCalls = 0;
    HTMLInputElement.prototype.showPicker = function showPicker() { window.__showPickerCalls += 1; };
  });
  await employeeLogin(panel);
  // Sin el evento del navegador: la hoja con los pasos de la plataforma.
  const install = panel.getByRole('button', { name: 'Instalar en este dispositivo' });
  await expect(install).toBeVisible();
  expect((await install.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await install.click();
  const sheet = panel.getByRole('dialog', { name: 'Instala el panel en este dispositivo' });
  await expect(sheet).toBeVisible();
  // iPhone/iPad: pasos con Compartir; Android sin el evento: el menú ⋮.
  const ios = testInfo.project.use.defaultBrowserType === 'webkit';
  await expect(ios
    ? sheet.getByText('Elige «Añadir a pantalla de inicio»')
    : sheet.getByText('Abre el menú ⋮ y elige «Instalar app» o «Añadir a pantalla de inicio».')).toBeVisible();
  await panel.goBack({ waitUntil: 'commit' });
  await expect(sheet).toHaveCount(0);
  await expect(panel.getByRole('tablist', { name: 'Secciones del modo cafetería' })).toBeVisible();
  // iOS no tiene diálogo nativo de instalación.
  if (ios) return;
  // Con el evento: el mismo botón abre el diálogo nativo.
  await panel.evaluate(() => window.__fireInstall());
  await panel.getByRole('button', { name: 'Instalar en este dispositivo' }).click();
  await expect.poll(() => panel.evaluate(() => window.__installCalls)).toBe(1);
});

panelTest('selector de día: al tocarlo no abre un segundo selector; «Borrar» vuelve a Hoy', async () => {
  await panel.getByRole('tab', { name: /^Pedidos/ }).click();
  const input = panel.locator('[data-history-date]');
  const today = await input.getAttribute('max');
  await expect(input).toHaveValue(today);
  // Toque (Android/iPhone): el selector lo abre el sistema, no showPicker().
  await input.tap();
  expect(await panel.evaluate(() => window.__showPickerCalls)).toBe(0);
  // Día anterior y luego «Borrar» en el selector nativo (valor vacío).
  await panel.getByRole('button', { name: 'Día anterior' }).click();
  await expect(panel.locator('[data-orders-history]')).toBeVisible();
  // Con pedidos pendientes el panel repinta a menudo: si el campo se sustituye
  // justo al vaciarlo, se repite sobre el nuevo.
  await expect(async () => {
    await input.evaluate((element) => { element.value = ''; element.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect(panel.locator('[data-orders-history]')).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 6000 });
  await expect(input).toHaveValue(today);
  // En Hoy, «Borrar» deja la fecha de hoy.
  await input.evaluate((element) => { element.value = ''; element.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(input).toHaveValue(today);
  await expect(input).toHaveAttribute('max', today);
});

// PENDIENTE (README, «Mejoras pendientes»): con el selector de fecha nativo
// abierto, un pedido que llega repinta el panel y sustituye el campo; la fecha
// que se estaba eligiendo se pierde. Debe aparecer el pedido y conservarse el
// campo.
test.fixme('con el selector de fecha abierto, un pedido nuevo aparece sin sustituir el campo de fecha', async () => {
  const input = panel.locator('[data-history-date]');
  await input.focus();
  await input.evaluate((element) => { element.__selectorOpen = true; });
  const arriving = await insertPendingOrder();
  await expect(panel.getByRole('article', { name: `Pedido nº ${arriving}`, exact: true })).toBeVisible({ timeout: 10000 });
  expect(await panel.evaluate(() => document.querySelector('[data-history-date]').__selectorOpen === true)).toBe(true);
  await expect(input).toBeFocused();
});

panelTest('avisos: ahorro de batería explicado y reintentado; pedido nuevo vibra y suena', async () => {
  await panel.getByRole('button', { name: 'Activar avisos' }).click();
  const screenChip = panel.locator('[data-screen-indicator]');
  await expect(screenChip).toHaveText('La pantalla puede apagarse: desactiva el ahorro de batería');
  // Se quita el ahorro de batería: el siguiente toque lo reintenta.
  await panel.evaluate(() => { window.__wakeLockFails = false; });
  await panel.locator('[data-orders-title]').tap();
  await expect(screenChip).toHaveText('Pantalla siempre encendida');
  // Pedido nuevo en directo: vibra con el patrón y suena.
  const before = await panel.evaluate(() => window.__oscillators);
  const number = await insertPendingOrder();
  await expect(panel.getByRole('article', { name: `Pedido nº ${number}`, exact: true })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => panel.evaluate(() => window.__vibrations)).toContainEqual([220, 120, 220]);
  expect(await panel.evaluate(() => window.__oscillators)).toBeGreaterThan(before);
  await panel.context().close();
});

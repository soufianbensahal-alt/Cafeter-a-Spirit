import { expect, test } from '@playwright/test';
import pg from 'pg';
import * as OTPAuth from 'otpauth';

// Ticket digital del pedido y comanda imprimible en el panel del equipo.
// Prepara en la base local un pedido pendiente (Nuevos) y otro servido
// (Servidos) con líneas y precios congelados en order_items.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const NOTE = 'Sin lactosa, por favor';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E del ticket solo puede preparar datos en una base local desechable.');
  }
}

// Inserta los pedidos como postgres (el flujo de creación ya lo cubren
// ordering-flow y order-panel) y devuelve sus números.
async function prepareOrders() {
  assertDisposableDatabase(DB_URL);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!customer || !business) throw new Error('Faltan el cliente o el negocio Spirit Montcada en la base local.');
    await db.query(`update public.orders set status = 'cancelled', cancelled_at = now()
      where business_id = $1 and status in ('pending', 'accepted', 'preparing')`, [business.id]);
    const today = "(now() at time zone 'Europe/Madrid')::date";
    // Los números se reservan en private.order_counters, como create_order: si
    // no, el siguiente pedido real chocaría con unique (negocio, día, número).
    const { rows: [{ last }] } = await db.query(`insert into private.order_counters (business_id, service_date, last_number)
      values ($1, ${today}, coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0) + 2)
      on conflict (business_id, service_date) do update set last_number = greatest(
        private.order_counters.last_number,
        coalesce((select max(order_number) from public.orders where business_id = $1 and service_date = ${today}), 0)
      ) + 2
      returning last_number as last`, [business.id]);
    const servedNumber = Number(last);
    const pendingNumber = servedNumber - 1;
    const { rows: [pending] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at)
      values ($1, $2, $3, ${today}, 'Terraza 2', 'pending', 1300, $4, now() - interval '2 minutes') returning id`, [business.id, customer.id, pendingNumber, NOTE]);
    const { rows: [served] } = await db.query(`insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, created_at, accepted_at, preparing_at, served_at)
      values ($1, $2, $3, ${today}, 'Barra', 'served', 250, now() - interval '20 minutes', now() - interval '18 minutes', now() - interval '16 minutes', now() - interval '10 minutes') returning id`, [business.id, customer.id, servedNumber]);
    await db.query(`insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
      ($1, $3, 'cafes-latte', 1, 2, 250, 'Latte', 500),
      ($1, $3, 'tostadas-aguacate', 2, 1, 800, 'Tostada de aguacate', 800),
      ($2, $3, 'cafes-latte', 1, 1, 250, 'Latte', 250)`, [pending.id, served.id, business.id]);
    return { pendingNumber, servedNumber };
  } finally {
    await db.end();
  }
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

let context;
let page;
let numbers;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  numbers = await prepareOrders();
  const { baseURL } = testInfo.project.use;
  context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true });
  page = await context.newPage();
  // window.print abre un diálogo del sistema: se registra la llamada.
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });
  await employeeLogin(page);
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible();
});

test.afterAll(async () => {
  await context?.close();
});

const card = (number) => page.getByRole('article', { name: `Pedido nº ${number}`, exact: true });
const openButton = (number) => card(number).getByRole('button', { name: new RegExp(`^Ver ticket del pedido nº ${number},`) });
const ticketDialog = (name) => page.getByRole('dialog', { name });

e2eTest('desde Nuevos, la cabecera abre el ticket con foco en Cerrar y precios congelados', async () => {
  const { pendingNumber } = numbers;
  const pendingCard = page.locator('.orders-column--new').getByRole('article', { name: `Pedido nº ${pendingNumber}`, exact: true });
  await expect(pendingCard).toBeVisible({ timeout: 10000 });
  // No hay botón «Ver ticket» aparte: sólo la cabecera y la comanda.
  await expect(pendingCard.getByRole('button', { name: 'Ver ticket', exact: true })).toHaveCount(0);
  const printTool = pendingCard.getByRole('button', { name: `Imprimir comanda del pedido nº ${pendingNumber}` });
  const toolBox = await printTool.boundingBox();
  expect(toolBox.width).toBeGreaterThanOrEqual(44);
  expect(toolBox.height).toBeGreaterThanOrEqual(44);

  await openButton(pendingNumber).click();
  const dialog = ticketDialog(`Pedido nº ${pendingNumber} · Mesa Terraza 2`);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await expect(dialog.getByRole('img')).toHaveCount(0); // logo decorativo
  await expect(dialog).toContainText('Cafetería Spirit · Montcada');
  await expect(dialog.locator('.ticket__number')).toHaveText(`Nº ${pendingNumber}`);
  await expect(dialog.locator('.ticket__place')).toHaveText('Mesa Terraza 2');
  await expect(dialog.locator('.ticket__status')).toContainText('Sin atender');
  const lines = dialog.getByRole('list', { name: 'Productos' }).getByRole('listitem');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText(/2 ×\s*Latte\s*2,50\s€ c\/u\s*5,00\s€/);
  await expect(lines.nth(1)).toContainText(/1 ×\s*Tostada de aguacate\s*8,00\s€ c\/u\s*8,00\s€/);
  await expect(dialog.getByRole('region', { name: 'Nota del cliente' })).toContainText(NOTE);
  await expect(dialog.locator('[data-ticket-total]')).toHaveText(/^13,00\s€$/);
  await expect(dialog).toContainText('Pago en el local');
  await expect(dialog).toContainText('Uso interno · No válido como factura');
  await expect(dialog.locator('.ticket')).toHaveCSS('font-variant-numeric', 'tabular-nums');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openButton(pendingNumber)).toBeFocused();
});

e2eTest('desde Servidos, la tarjeta compacta abre el ticket con las horas de cada estado', async () => {
  const { servedNumber } = numbers;
  const servedCard = page.locator('.orders-column--served').getByRole('article', { name: `Pedido nº ${servedNumber}`, exact: true });
  await expect(servedCard).toHaveClass(/order-ticket--compact/);
  // Las tarjetas de Servidos no llevan comanda.
  await expect(servedCard.getByRole('button', { name: /Imprimir comanda/ })).toHaveCount(0);
  await openButton(servedNumber).click();
  const dialog = ticketDialog(`Pedido nº ${servedNumber} · Barra`);
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await expect(dialog.locator('.ticket__place')).toHaveText('Barra');
  await expect(dialog.locator('.ticket__status')).toContainText('Servido');
  const meta = dialog.locator('.ticket__meta');
  for (const label of ['Cliente', 'Pedido', 'Aceptado', 'En preparación', 'Servido']) {
    await expect(meta.locator('dt', { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  }
  await expect(meta.locator('time')).toHaveCount(4);
  await expect(dialog.locator('[data-ticket-total]')).toHaveText(/^2,50\s€$/);
  await expect(dialog.getByRole('region', { name: 'Nota del cliente' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
});

e2eTest('el ticket tiene variante oscura', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await openButton(numbers.pendingNumber).click();
  const ticket = page.getByRole('dialog').locator('.ticket');
  await expect(ticket).toHaveCSS('background-color', 'rgb(42, 39, 32)');
  await expect(ticket).toHaveCSS('color', 'rgb(247, 240, 222)');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
});

e2eTest('«Imprimir comanda» desde la tarjeta: sólo la comanda, en negro y en formato de cocina', async ({ browserName }) => {
  const { pendingNumber } = numbers;
  await card(pendingNumber).getByRole('button', { name: `Imprimir comanda del pedido nº ${pendingNumber}` }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  await expect(page.locator('html')).toHaveClass(/is-printing-ticket/);
  const kitchen = page.locator('#print-root .kitchen-ticket');
  await expect(kitchen).toHaveCount(1);
  // En pantalla la comanda no se ve.
  await expect(kitchen).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(kitchen).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(kitchen.locator('.kitchen-ticket__number')).toHaveText(`Nº ${pendingNumber}`);
  await expect(kitchen.locator('.kitchen-ticket__place')).toHaveText('Mesa Terraza 2');
  await expect(kitchen.locator('.kitchen-ticket__time')).toHaveText(/^Pedido a las \d{2}:\d{2}$/);
  await expect(kitchen.locator('.kitchen-ticket__lines li').first()).toHaveText(/2 ×\s*Latte/);
  await expect(kitchen.locator('.kitchen-ticket__note')).toHaveText(`NOTA: ${NOTE}`);
  const styles = await kitchen.evaluate((element) => {
    const size = (selector) => parseFloat(getComputedStyle(element.querySelector(selector)).fontSize);
    const colors = [...element.querySelectorAll('*')].map((child) => getComputedStyle(child).color);
    return {
      number: size('.kitchen-ticket__number'),
      product: size('.kitchen-ticket__lines li'),
      prices: size('.kitchen-ticket__prices'),
      width: element.getBoundingClientRect().width,
      colors: [...new Set(colors)],
      noteBorder: getComputedStyle(element.querySelector('.kitchen-ticket__note')).borderTopStyle
    };
  });
  expect(styles.number).toBeGreaterThanOrEqual(38); // 30 pt
  expect(styles.product).toBeGreaterThanOrEqual(21); // 16 pt
  expect(styles.prices).toBeLessThan(12); // precios pequeños al final
  expect(styles.width).toBeLessThanOrEqual(273); // 72 mm
  expect(styles.colors).toEqual(['rgb(0, 0, 0)']);
  expect(styles.noteBorder).toBe('solid');
  // Precios después de productos y nota.
  const order = await kitchen.evaluate((element) => ['.kitchen-ticket__lines', '.kitchen-ticket__note', '.kitchen-ticket__prices']
    .map((selector) => element.querySelector(selector).getBoundingClientRect().top));
  expect(order[0]).toBeLessThan(order[1]);
  expect(order[1]).toBeLessThan(order[2]);

  // Al terminar la impresión (afterprint) se limpia la comanda.
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('html')).not.toHaveClass(/is-printing-ticket/);
  await expect(kitchen).toHaveCount(0);

  if (browserName === 'chromium') {
    // Impresora de tickets (80 mm) y A4: la comanda cabe en una página. Chromium
    // dispara afterprint tras cada PDF, como una impresión real, así que se
    // vuelve a pulsar «Imprimir comanda» antes de cada uno.
    const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    // page.pdf usa el medio emulado: se vuelve a «print».
    const tool = card(pendingNumber).getByRole('button', { name: `Imprimir comanda del pedido nº ${pendingNumber}` });
    for (const format of [{ width: '80mm', height: '200mm' }, { format: 'A4' }]) {
      await page.emulateMedia({ media: 'screen' });
      await tool.click();
      await expect(kitchen).toHaveCount(1);
      await page.emulateMedia({ media: 'print' });
      expect(pages(await page.pdf(format)), JSON.stringify(format)).toBe(1);
      await expect(kitchen).toHaveCount(0);
    }
    await page.emulateMedia({ media: 'screen' });
  }
});

e2eTest('«Imprimir comanda» también desde el ticket abierto', async () => {
  const { pendingNumber } = numbers;
  await openButton(pendingNumber).click();
  const dialog = ticketDialog(`Pedido nº ${pendingNumber} · Mesa Terraza 2`);
  const before = await page.evaluate(() => window.__printCalls);
  await dialog.getByRole('button', { name: 'Imprimir comanda' }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(before + 1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-root .kitchen-ticket__number')).toHaveText(`Nº ${pendingNumber}`);
  await expect(dialog).toBeHidden(); // el diálogo no sale en la comanda
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
});

import { expect, test } from '@playwright/test';
import pg from 'pg';

// Confirmación del pedido en el móvil: pie fijo con «Enviar pedido» siempre
// visible, campo enfocado visible con el teclado (simulado con
// visualViewport, porque Playwright no abre el teclado real de iOS) y casilla
// «Recoger en barra» con el estilo de la marca en claro y oscuro.
// Solo contra la base local desechable (SPIRIT_E2E_DB_URL). Nunca producción.
const required = ['SPIRIT_E2E_CUSTOMER_EMAIL', 'SPIRIT_E2E_CUSTOMER_PASSWORD'];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ORDER_CODE = '4826';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const MUSTARD = 'rgb(238, 207, 98)';

function assertDisposableDatabase(url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || url.includes('supabase.co')) {
    throw new Error('El E2E de la confirmación solo puede preparar datos en una base local desechable.');
  }
}

async function preparePilot() {
  assertDisposableDatabase(DB_URL);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const { rows: [customer] } = await db.query('select id from auth.users where lower(email) = lower($1)', [process.env.SPIRIT_E2E_CUSTOMER_EMAIL]);
    const { rows: [business] } = await db.query('select id from public.businesses where lower(btrim(name)) = lower(btrim($1))', [BUSINESS_NAME]);
    if (!customer || !business) throw new Error('Faltan el cliente o el negocio Spirit Montcada en la base local.');
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only)
      values ($1, true, true)
      on conflict (business_id) do update set ordering_enabled = true, pilot_only = true`, [business.id]);
    await db.query('insert into public.ordering_pilot_members (business_id, user_id) values ($1, $2) on conflict do nothing', [business.id, customer.id]);
    await db.query(`insert into private.business_order_codes (business_id, code, expires_at)
      values ($1, $2, now() + interval '1 hour')
      on conflict (business_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = clock_timestamp()`, [business.id, ORDER_CODE]);
    await db.query('update public.products set is_available = true where business_id = $1 and id = $2', [business.id, 'cafes-latte']);
  } finally {
    await db.end();
  }
}

async function customerLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
}

// Simula el teclado de iOS: el viewport visible encoge y Safari lo desplaza.
async function simulateKeyboard(page, visibleHeight, offsetTop = 0) {
  await page.evaluate(([height, top]) => {
    const viewport = window.visualViewport;
    Object.defineProperty(viewport, 'height', { configurable: true, get: () => height });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, get: () => top });
    viewport.dispatchEvent(new Event('resize'));
  }, [visibleHeight, offsetTop]);
}

async function closeKeyboard(page) {
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    delete viewport.height;
    delete viewport.offsetTop;
    viewport.dispatchEvent(new Event('resize'));
  });
}

const box = (locator) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: rect.height };
});

// El objetivo queda entero dentro de [top, bottom] (con medio píxel de margen).
const expectWithin = (inner, outer, label) => {
  expect(inner.top, `${label}: arriba`).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom, `${label}: abajo`).toBeLessThanOrEqual(outer.bottom + 0.5);
};

let context;
let page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!e2eEnabled) return;
  await preparePilot();
  const { baseURL } = testInfo.project.use;
  context = await browser.newContext({ ...testInfo.project.use, baseURL });
  page = await context.newPage();
  await customerLogin(page);
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await page.getByRole('button', { name: /^Ver carrito: 1 producto/ }).click();
});

test.afterAll(async () => {
  await context?.close();
});

const dialog = () => page.getByRole('dialog', { name: 'Confirmar pedido' });
const submit = () => dialog().getByRole('button', { name: 'Enviar pedido' });

async function openCheckout() {
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog()).toBeVisible();
}

async function closeCheckout() {
  await dialog().getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog()).toBeHidden();
}

e2eTest('«Enviar pedido» se ve sin hacer scroll y el pie se queda fijo al desplazar el cuerpo', async () => {
  for (const size of [null, { width: 375, height: 667 }, { width: 320, height: 568 }]) {
    if (size) await page.setViewportSize(size);
    await openCheckout();
    await expect(submit()).toBeInViewport({ ratio: 0.99 });
    await expect(dialog().locator('[data-checkout-total]')).toBeInViewport({ ratio: 0.99 });
    const body = dialog().locator('[data-checkout-body]');
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(submit()).toBeInViewport({ ratio: 0.99 });
    await body.evaluate((element) => { element.scrollTop = 0; });
    await expect(submit()).toBeInViewport({ ratio: 0.99 });
    await closeCheckout();
  }
});

e2eTest('con el teclado abierto el campo enfocado queda entre la cabecera y el pie', async () => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openCheckout();
  const code = dialog().getByLabel('Código del local');
  const table = dialog().getByLabel('Tu mesa');
  const body = dialog().locator('[data-checkout-body]');
  const summary = dialog().locator('[data-checkout-summary]');

  // Teclado de iPhone: quedan ~330 px visibles.
  await code.focus();
  await simulateKeyboard(page, 330);
  await expect(dialog()).toHaveClass(/modal--keyboard/);
  await expect(dialog()).toHaveClass(/modal--compact/);
  // Con tan poco sitio se prioriza el campo: el total se oculta, el envío no.
  await expect(summary).toBeHidden();
  await expect(submit()).toBeVisible();
  // toPass: la animación de entrada del diálogo (0,3 s) puede seguir en curso.
  await expect(async () => expect((await box(dialog())).bottom).toBeLessThanOrEqual(330 + 0.5)).toPass();
  await expect(async () => expectWithin(await box(code), await box(body), 'código')).toPass();
  await expect(async () => expectWithin(await box(submit()), { top: 0, bottom: 330 }, 'envío')).toPass();

  // La mesa está más abajo: al enfocarla se desplaza el cuerpo, no se tapa.
  await table.focus();
  await expect(async () => expectWithin(await box(table), await box(body), 'mesa')).toPass();
  await table.fill('Terraza 2');

  // Safari desplaza el viewport visible al enfocar: el diálogo lo sigue.
  await simulateKeyboard(page, 330, 120);
  await expect(async () => {
    const shifted = await box(dialog());
    expect(shifted.bottom).toBeLessThanOrEqual(120 + 330 + 0.5);
    expect(shifted.top).toBeGreaterThanOrEqual(120 - 0.5);
  }).toPass();
  await expect(async () => expectWithin(await box(table), await box(body), 'mesa desplazada')).toPass();

  // Al cerrar el teclado vuelve el total.
  await closeKeyboard(page);
  await expect(dialog()).not.toHaveClass(/modal--keyboard/);
  await expect(summary).toBeVisible();
  await expect(submit()).toBeInViewport({ ratio: 0.99 });
  await closeCheckout();
});

e2eTest('«Recoger en barra»: 44 px, mostaza al marcar, foco visible, claro y oscuro', async ({ browserName }) => {
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await openCheckout();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    const label = dialog().locator('.checkout-pickup');
    const checkbox = dialog().getByLabel('Recoger en barra');
    expect((await box(label)).height).toBeGreaterThanOrEqual(44);
    const unchecked = await checkbox.evaluate((element) => {
      const style = getComputedStyle(element);
      return { appearance: style.appearance || style.webkitAppearance, width: element.getBoundingClientRect().width, border: style.borderTopWidth, background: style.backgroundColor };
    });
    expect(unchecked.appearance).toBe('none');
    expect(unchecked.width).toBe(24);
    expect(unchecked.border).toBe('2px');
    expect(unchecked.background).not.toBe('rgb(0, 0, 0)');

    // Foco desde teclado (Tab desde la mesa; Option+Tab en Safari/WebKit).
    await dialog().getByLabel('Tu mesa').focus();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(checkbox).toBeFocused();
    const focus = await checkbox.evaluate((element) => {
      const style = getComputedStyle(element);
      return { visible: element.matches(':focus-visible'), outline: style.outlineStyle, width: style.outlineWidth };
    });
    expect(focus).toEqual({ visible: true, outline: 'solid', width: '3px' });

    // Tocar la etiqueta marca la casilla.
    await label.getByText('Recoger en barra').click();
    await expect(checkbox).toBeChecked();
    await expect(dialog().getByLabel('Tu mesa')).toBeDisabled();
    // toHaveCSS reintenta: el fondo tiene una transición de 0,15 s.
    await expect(checkbox).toHaveCSS('background-color', MUSTARD);
    await expect(checkbox).toHaveCSS('background-image', /svg/);

    await label.getByText('Recoger en barra').click();
    await expect(checkbox).not.toBeChecked();
    await closeCheckout();
  }
  await page.emulateMedia({ colorScheme: 'light' });
});

import { expect, test } from '@playwright/test';
import pg from 'pg';

// Promoción de registro en el login y, compacta, en la captación del
// invitado. El número de sellos sale de get_public_loyalty_program (10 en la
// base local). Solo contra la base local desechable.
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });
// Sin service worker: si controla la página, page.route no ve sus peticiones.
test.use({ serviceWorkers: 'block' });

const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';
const TITLE = 'Crea tu cuenta y llévate un café gratis';
// 10 huellas: 370 ms + 10 × 90 ms hasta la taza, 460 ms de taza y 900 ms de brillo.
const ANIMATION_MS = 370 + 10 * 90 + 460 + 900;

const promo = (page) => page.locator('section.signup-promo');
const guestCard = (page) => page.locator('section.guest-entry');

async function openLogin(page, { lang = 'es' } = {}) {
  await page.addInitScript((language) => {
    localStorage.setItem('spirit-onboarded', '1');
    localStorage.setItem('spirit-language', language);
  }, lang);
  await page.goto('/login');
  await expect(promo(page).getByRole('heading', { level: 2 })).toBeVisible();
}

async function setGuestOrdering(enabled) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(`insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only, guest_ordering_enabled)
      select id, true, true, $2 from public.businesses where lower(btrim(name)) = lower(btrim($1))
      on conflict (business_id) do update set ordering_enabled = true, guest_ordering_enabled = excluded.guest_ordering_enabled`, [BUSINESS_NAME, enabled]);
  } finally {
    await db.end();
  }
}

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

// Nada se sale por la derecha ni queda recortado dentro de su caja.
async function overflowOf(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5 || element.scrollWidth > element.clientWidth + 1)
    .map((element) => element.className || element.tagName));
}

test.afterAll(async () => {
  if (e2eEnabled) await setGuestOrdering(false);
});

e2eTest('encima de «¿Solo quieres pedir?» en las dos pestañas; el botón lleva al registro', async ({ page }) => {
  await openLogin(page);
  await expect(promo(page).getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
  // Número real de la configuración (10 en local).
  await expect(promo(page).getByText('Con 10 sellos, tu próximo café es gratis.')).toBeVisible();
  await expect(promo(page).getByRole('listitem')).toHaveCount(3);
  await expect(promo(page).getByRole('listitem').first()).toHaveText('Suma un sello en cada consumición.');
  await expect(promo(page).getByRole('listitem').last()).toHaveText('Sigue tus pedidos desde el móvil.');
  const isAbove = async () => {
    const [top, bottom] = [await promo(page).boundingBox(), await guestCard(page).boundingBox()];
    return top.y + top.height <= bottom.y;
  };
  expect(await isAbove()).toBe(true);
  // La tarjeta animada no la leen los lectores de pantalla.
  await expect(promo(page).locator('[data-promo-card]')).toHaveAttribute('aria-hidden', 'true');

  const action = promo(page).getByRole('button', { name: 'Crear mi cuenta' });
  const box = await action.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await action.click();
  await expect(page.locator('form[data-auth-mode="signup"]')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused();
  // En la pestaña de registro sigue visible, sin botón y encima de la tarjeta.
  await expect(promo(page).getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
  await expect(promo(page).getByRole('button')).toHaveCount(0);
  expect(await isAbove()).toBe(true);

  // Orden de lectura: formulario, promoción y «¿Solo quieres pedir?».
  const order = await page.locator('form[data-form="customer-auth"], section.signup-promo, section.guest-entry')
    .evaluateAll((elements) => elements.map((element) => element.tagName + (element.className ? `.${element.className.split(' ')[0]}` : '')));
  expect(order).toEqual(['FORM.form', 'SECTION.signup-promo', 'SECTION.guest-entry']);
});

e2eTest('animación una sola vez: continúa si se repinta y no se repite al cambiar de pestaña', async ({ page }) => {
  await openLogin(page);
  const section = promo(page);
  await expect(section).toHaveClass(/signup-promo--animate/);
  // Repintado a mitad: sigue por donde iba (no empieza de cero).
  await page.locator('.auth-switch').getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(section).toHaveClass(/signup-promo--animate/);
  const elapsed = Number((await section.getAttribute('style')).match(/--promo-elapsed:(\d+)ms/)[1]);
  expect(elapsed).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(ANIMATION_MS);
  // Termina con el café gratis visible y sin animaciones vivas.
  await expect.poll(() => section.locator('[data-promo-card]').evaluate((card) => card.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length), { timeout: ANIMATION_MS + 3000 }).toBe(0);
  await expect(section.locator('.signup-promo__cup')).toBeVisible();
  // Cambiar de pestaña después: estado final, sin volver a animar.
  await page.locator('.auth-switch').getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(section).not.toHaveClass(/signup-promo--animate/);
  await expect(section.locator('.signup-promo__slot .signup-promo__paw')).toHaveCount(10);
  expect(await section.locator('[data-promo-card]').evaluate((card) => card.getAnimations({ subtree: true }).length)).toBe(0);
});

e2eTest('movimiento reducido: estado final desde el principio', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLogin(page);
  await expect(promo(page).getByText('Con 10 sellos, tu próximo café es gratis.')).toBeVisible();
  await expect(promo(page)).not.toHaveClass(/signup-promo--animate/);
  await expect(promo(page).locator('.signup-promo__slot .signup-promo__paw')).toHaveCount(10);
  await expect(promo(page).locator('.signup-promo__cup')).toBeVisible();
  expect(await promo(page).evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  expect(Number(await promo(page).locator('.signup-promo__cup').evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
});

e2eTest('sin datos del programa: texto sin número y tarjeta decorativa', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_loyalty_program', (route) => route.abort('internetdisconnected'));
  await openLogin(page);
  await expect(promo(page).getByText('Completa tu tarjeta y tu próximo café es gratis.')).toBeVisible();
  await expect(promo(page).getByText(/\d+ sellos/)).toHaveCount(0);
  await expect(promo(page).locator('.signup-promo__slot:not(.signup-promo__slot--reward)')).toHaveCount(6);
});

e2eTest('si el número llega tarde, no borra lo escrito en el login', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_loyalty_program', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => { setTimeout(resolve, 1500); });
    await route.fulfill({ response });
  });
  await openLogin(page);
  await expect(promo(page).getByText('Completa tu tarjeta y tu próximo café es gratis.')).toBeVisible();
  const email = page.getByLabel('Correo electrónico');
  await email.fill('cliente@spirit.test');
  await page.getByLabel('Contraseña', { exact: true }).click();
  await page.keyboard.type('secreta');
  await expect(promo(page).getByText('Con 10 sellos, tu próximo café es gratis.')).toBeVisible({ timeout: 5000 });
  await expect(email).toHaveValue('cliente@spirit.test');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('secreta');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
});

e2eTest('en catalán', async ({ page }) => {
  await openLogin(page, { lang: 'ca' });
  await expect(promo(page).getByRole('heading', { level: 2, name: 'Crea el teu compte i emporta’t un cafè gratis' })).toBeVisible();
  await expect(promo(page).getByText('Amb 10 segells, el teu pròxim cafè és gratis.')).toBeVisible();
  await expect(promo(page).getByText('Suma un segell a cada consumició.')).toBeVisible();
  await expect(promo(page).getByText('Segueix les teves comandes des del mòbil.')).toBeVisible();
  await expect(promo(page).getByRole('button', { name: 'Crear el meu compte' })).toBeVisible();
});

e2eTest('contraste AA en claro y oscuro', async ({ page }) => {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await openLogin(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    const section = promo(page);
    expect(await contrastOf(section.getByRole('heading', { level: 2 })), `título (${scheme})`).toBeGreaterThanOrEqual(4.5);
    for (const item of await section.locator('.signup-promo__benefits li > span').all()) {
      expect(await contrastOf(item), `ventaja (${scheme})`).toBeGreaterThanOrEqual(4.5);
    }
    expect(await contrastOf(section.getByRole('button', { name: 'Crear mi cuenta' })), `botón (${scheme})`).toBeGreaterThanOrEqual(4.5);
  }
});

for (const scale of ['150%', '200%']) {
  e2eTest(`360 px con el texto al ${scale}: sin desbordes y botón de 44 px o más`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLogin(page);
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, scale);
    for (const mode of ['signin', 'signup']) {
      if (mode === 'signup') await promo(page).getByRole('button', { name: 'Crear mi cuenta' }).click();
      expect(await overflowOf(page, 'section.signup-promo, section.signup-promo *:not(svg):not(svg *)'), `${mode} ${scale}`).toEqual([]);
      const card = await promo(page).locator('[data-promo-card]').boundingBox();
      const section = await promo(page).boundingBox();
      expect(card.x + card.width).toBeLessThanOrEqual(section.x + section.width);
    }
    await page.locator('.auth-switch').getByRole('button', { name: 'Iniciar sesión' }).click();
    const button = await promo(page).getByRole('button', { name: 'Crear mi cuenta' }).boundingBox();
    expect(button.height).toBeGreaterThanOrEqual(44);
  });
}

e2eTest('invitado: la misma promoción, compacta, en la carta', async ({ page }) => {
  await setGuestOrdering(true);
  await openLogin(page);
  await guestCard(page).getByRole('button', { name: 'Pedir sin cuenta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  const compact = page.locator('.guest-menu-slot aside.signup-promo--compact');
  await expect(compact.getByText(TITLE)).toBeVisible();
  const action = compact.getByRole('button', { name: 'Crear mi cuenta' });
  await expect(action).toBeVisible();
  expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await contrastOf(compact.locator('.signup-promo__title > span'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(action)).toBeGreaterThanOrEqual(4.5);
  await action.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu cuenta Spirit' })).toBeVisible();
});

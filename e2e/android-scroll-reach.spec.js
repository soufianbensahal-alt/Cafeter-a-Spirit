import { expect, test } from '@playwright/test';
import { access } from 'node:fs/promises';

// Recorrido táctil de Android: en cada perfil (playwright.config.js,
// android-reach-*) se llega al final de cada pantalla con gestos táctiles
// reales (Input.synthesizeScrollGesture con origen «touch», no la rueda),
// también desde la cabecera y las barras fijas, y después de abrir y cerrar
// diálogos y de pulsar atrás. El último elemento de cada pantalla debe verse
// sin que lo tape ninguna barra fija. Solo contra la base local desechable.
const CUSTOMER_STATE = 'playwright/.auth/customer.json';
const EMPLOYEE_STATE = 'playwright/.auth/employee.json';
const e2eEnabled = process.env.SPIRIT_E2E === '1';
test.describe.configure({ mode: 'serial' });

const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

// Perfil: app instalada, letra solo-texto y CPU lenta (opciones del proyecto).
async function openPage(browser, testInfo, storageState) {
  const { standalone = false, textScale = 1, cpuThrottle = 1, ...use } = testInfo.project.use;
  const context = await browser.newContext({ ...use, serviceWorkers: 'block', ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  await page.addInitScript((installed) => {
    localStorage.setItem('spirit-onboarded', '1');
    if (installed) {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query)
        ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
        : original(query));
    }
  }, standalone);
  if (cpuThrottle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }
  page.__textScale = textScale;
  return page;
}

// Letra solo-texto: multiplica cada font-size declarado en el CSS de la app.
async function applyTextScale(page) {
  if (!page.__textScale || page.__textScale === 1) return;
  await page.evaluate((value) => {
    document.querySelector('style[data-text-scale]')?.remove();
    const out = [`html { font-size: ${16 * value}px !important; }`];
    const scaled = (size) => {
      const match = /^(-?[\d.]+)px$/.exec(size.trim());
      if (match) return `${Number(match[1]) * value}px`;
      if (/^(clamp|calc|min|max)\(/.test(size.trim())) return `calc(${size} * ${value})`;
      return null;
    };
    const walk = (rules, wrap) => {
      for (const rule of rules) {
        if (rule.cssRules && rule.media) { walk(rule.cssRules, (css) => wrap(`@media ${rule.media.mediaText} { ${css} }`)); continue; }
        if (rule.cssRules && rule.conditionText) { walk(rule.cssRules, (css) => wrap(`@supports ${rule.conditionText} { ${css} }`)); continue; }
        if (!rule.selectorText || !rule.style) continue;
        const next = rule.style.getPropertyValue('font-size') && scaled(rule.style.getPropertyValue('font-size'));
        if (next) out.push(wrap(`${rule.selectorText} { font-size: ${next} !important; }`));
      }
    };
    for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; } walk(rules, (css) => css); }
    const style = document.createElement('style');
    style.dataset.textScale = '1';
    style.textContent = out.join('\n');
    document.head.append(style);
  }, page.__textScale);
}

// Deslizar con el dedo: el contenido sube (gesto hacia arriba) desde (x, y).
async function swipe(page, { x, y, distance }) {
  const cdp = await page.context().newCDPSession(page);
  // Sin inercia: un clic simulado no la corta como haría un dedo real.
  await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -distance, gestureSourceType: 'touch', speed: 2400, preventFling: true });
  await cdp.detach();
}

const scrollTop = (page, selector) => page.evaluate((sel) => {
  const element = sel ? document.querySelector(sel) : null;
  return element ? element.scrollTop : window.scrollY;
}, selector);

// Desliza hasta que deja de moverse y comprueba que se ha llegado al final.
async function reachEnd(page, label, { scroller = null, from = null } = {}) {
  const { width, height } = page.viewportSize();
  const origin = from || { x: Math.round(width / 2), y: Math.round(height * 0.72) };
  let previous = -1;
  let still = 0;
  for (let index = 0; index < 160 && still < 2; index += 1) {
    await swipe(page, { ...origin, distance: Math.round(height * 0.6) });
    const current = await scrollTop(page, scroller);
    still = Math.abs(current - previous) < 1 ? still + 1 : 0;
    previous = current;
  }
  const atEnd = await page.evaluate((sel) => {
    const element = sel ? document.querySelector(sel) : (document.scrollingElement || document.documentElement);
    const viewport = sel ? element.clientHeight : window.innerHeight;
    return Math.ceil(element.scrollTop + viewport) >= element.scrollHeight - 2;
  }, scroller);
  expect(atEnd, `${label}: se llega al final deslizando`).toBe(true);
}

// El elemento se ve entero en pantalla y no lo tapa ninguna barra fija.
async function expectUncovered(page, locator, label) {
  await expect(locator, label).toBeVisible();
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 1), window.innerWidth - 1);
    const points = [rect.top + 2, rect.top + rect.height / 2, rect.bottom - 2].map((y) => Math.min(Math.max(y, 1), window.innerHeight - 1));
    const hits = points.map((y) => document.elementFromPoint(x, y));
    return {
      inView: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      covered: hits.filter((hit) => hit && !element.contains(hit) && !hit.contains(element)).map((hit) => `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`)
    };
  });
  expect(result.inView, `${label}: se ve entero`).toBe(true);
  expect(result.covered, `${label}: no lo tapa nada`).toEqual([]);
}

// Final de un área con scroll: se ve el borde inferior del último elemento y
// nada lo tapa (si es más alto que el área visible, no puede verse entero).
async function expectEndVisible(page, locator, label) {
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(rect.bottom - 3, window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return { bottomInView: rect.bottom <= window.innerHeight + 1 && rect.bottom > 0, ownHit: Boolean(hit && (element.contains(hit) || hit.contains(element))) };
  });
  expect(result, label).toEqual({ bottomInView: true, ownHit: true });
}

async function expectScrollFree(page, label) {
  const state = await page.evaluate(() => ({
    modalOpen: document.documentElement.classList.contains('modal-open'),
    splash: document.documentElement.classList.contains('splash-active'),
    overflow: getComputedStyle(document.body).overflowY
  }));
  expect(state, `${label}: la página puede desplazarse`).toEqual({ modalOpen: false, splash: false, overflow: state.overflow === 'hidden' ? 'visible' : state.overflow });
}

const pressBack = (page) => page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {});

test.beforeAll(async () => {
  test.skip(!e2eEnabled || !(await exists(CUSTOMER_STATE)) || !(await exists(EMPLOYEE_STATE)), 'Necesita las sesiones de android-auth.');
});

test('login con la promo: se llega al final desde cualquier punto', async ({ browser }, testInfo) => {
  const page = await openPage(browser, testInfo, null);
  await page.goto('/login');
  await expect(page.locator('section.signup-promo h2')).toBeVisible();
  await applyTextScale(page);
  await reachEnd(page, 'login');
  await expectUncovered(page, page.locator('footer.legal-footer'), 'login: pie legal');
  await page.context().close();
});

test('cliente: inicio, carta, carrito, confirmación, mis pedidos y perfil', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const page = await openPage(browser, testInfo, CUSTOMER_STATE);
  // Con sesión, «/» pasa por la bienvenida y llega al inicio.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
  await applyTextScale(page);
  const { width, height } = page.viewportSize();

  // Inicio: hasta el pie, sin que lo tape la barra de navegación.
  await reachEnd(page, 'inicio');
  await expectUncovered(page, page.locator('footer.legal-footer'), 'inicio: pie legal');

  // Carta.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  if (!(await page.locator('.cart-bar').count())) await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await expect(page.locator('.cart-bar')).toBeVisible();
  // Sin zonas muertas: se desliza también desde la cabecera y desde la barra del carrito.
  const header = await page.locator('.menu-sticky').boundingBox();
  for (const [zone, y] of [['cabecera', Math.round(header.y + Math.min(header.height / 2, 60))], ['barra del carrito', Math.round((await page.locator('.cart-bar').boundingBox()).y + 10)]]) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    await swipe(page, { x: Math.round(width / 2), y, distance: Math.round(height * 0.4) });
    expect(await scrollTop(page), `carta: deslizar desde la ${zone}`).toBeGreaterThan(20);
  }
  // Cabecera pegajosa arriba al desplazar.
  expect(Math.round((await page.locator('.menu-sticky').boundingBox()).y)).toBe(0);
  // Salto a categoría: el título de la sección queda bajo la cabecera.
  const tabs = page.locator('[data-menu-category]');
  const target = tabs.nth(1);
  const targetId = await target.getAttribute('data-menu-category');
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(async () => {
    const stickyBottom = (await page.locator('.menu-sticky').boundingBox()).y + (await page.locator('.menu-sticky').boundingBox()).height;
    const title = await page.locator(`[data-menu-section="${targetId}"] h2`).first().boundingBox();
    expect(title.y).toBeGreaterThanOrEqual(stickyBottom - 1);
    expect(title.y).toBeLessThan(height);
  }).toPass();
  // Categoría activa al desplazar con el dedo.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await expect(tabs.first()).toHaveAttribute('aria-pressed', 'true');
  // Final de la carta: el último producto se ve sin que lo tape «Ver carrito».
  await reachEnd(page, 'carta');
  await expectUncovered(page, page.locator('.menu-product').last(), 'carta: último producto');
  await expect(page.locator('.cart-bar')).toBeInViewport();
  const lastSection = await page.locator('[data-menu-section]').last().getAttribute('data-menu-section');
  await expect(page.locator(`[data-menu-category="${lastSection}"]`)).toHaveAttribute('aria-pressed', 'true');
  // «Volver arriba».
  await page.getByRole('button', { name: 'Volver arriba' }).click();
  await expect.poll(() => scrollTop(page), { timeout: 5000 }).toBeLessThan(2);
  // Confirmación: dentro del diálogo se llega al último campo y al envío; al
  // cerrarla con atrás la página vuelve a desplazarse.
  await page.locator('.cart-bar').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
  await reachEnd(page, 'carrito');
  await expectUncovered(page, page.getByRole('button', { name: 'Continuar' }), 'carrito: «Continuar»');
  const dialog = page.getByRole('dialog', { name: 'Confirmar pedido' });
  // El carrito se repinta al cargar los pedidos: si el toque cae justo en el
  // botón sustituido, se repite.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Continuar' }).click({ timeout: 2000 });
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  const body = await dialog.locator('[data-checkout-body]').boundingBox();
  await reachEnd(page, 'confirmación', { scroller: '[data-checkout-body]', from: { x: Math.round(body.x + body.width / 2), y: Math.round(body.y + body.height * 0.7) } });
  await expectEndVisible(page, dialog.locator('[data-checkout-body] > :not([hidden])').last(), 'confirmación: final del contenido');
  await expectUncovered(page, dialog.locator('[data-checkout-submit]'), 'confirmación: «Enviar pedido»');
  await pressBack(page);
  await expect(dialog).toBeHidden();
  await expectScrollFree(page, 'carrito tras cerrar la confirmación con atrás');
  await reachEnd(page, 'carrito tras la confirmación');

  // Mis pedidos.
  await page.getByRole('button', { name: 'Volver a la carta' }).click();
  await page.getByRole('button', { name: 'Mis pedidos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible();
  await reachEnd(page, 'mis pedidos');
  await expectUncovered(page, page.locator('main section > *').last(), 'mis pedidos: final');

  // Perfil: hasta el final; también tras abrir y cerrar un diálogo con atrás.
  // Con sesión, «/» pasa por la bienvenida y llega al inicio.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
  await applyTextScale(page);
  await page.getByRole('button', { name: 'Perfil' }).first().click();
  await reachEnd(page, 'perfil');
  await expectUncovered(page, page.locator('footer.legal-footer'), 'perfil: pie legal');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.getByRole('button', { name: 'Datos personales' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await pressBack(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expectScrollFree(page, 'perfil tras cerrar el diálogo con atrás');
  await reachEnd(page, 'perfil tras el diálogo');
  // Atrás desde el perfil: el inicio vuelve a desplazarse hasta el final.
  await pressBack(page);
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
  await reachEnd(page, 'inicio tras atrás');
  await page.context().close();
});

test('carta: posición y categoría activa recuperadas al volver del carrito', async ({ browser }, testInfo) => {
  // Página nueva, sin gestos previos: la inercia de los gestos simulados no se
  // corta como con un dedo real y falsearía la medida. Posición por código.
  const page = await openPage(browser, testInfo, CUSTOMER_STATE);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible({ timeout: 15000 });
  await applyTextScale(page);
  const { height } = page.viewportSize();
  await page.getByRole('button', { name: 'Carta: Ver menú' }).click();
  if (!(await page.locator('.cart-bar').count())) await page.getByRole('button', { name: 'Añadir Latte al carrito', exact: true }).click();
  await expect(page.locator('.cart-bar')).toBeVisible();
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'auto' }), Math.round(height * 1.4));
  await page.waitForTimeout(300);
  const positionBefore = await scrollTop(page);
  const activeBefore = await page.locator('[data-menu-category][aria-pressed="true"]').getAttribute('data-menu-category');
  await page.locator('.cart-bar').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a la carta' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await page.waitForTimeout(800);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(positionBefore - 4);
  expect(Math.abs(await scrollTop(page) - positionBefore)).toBeLessThan(4);
  await expect(page.locator(`[data-menu-category="${activeBefore}"]`)).toHaveAttribute('aria-pressed', 'true');

  await page.context().close();
});

test('panel: pedidos, ticket, historial y control', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const page = await openPage(browser, testInfo, EMPLOYEE_STATE);
  await page.goto('/cafeteria');
  await expect(page.getByRole('tablist', { name: 'Secciones del modo cafetería' })).toBeVisible({ timeout: 15000 });
  await applyTextScale(page);
  await page.getByRole('tab', { name: /^Pedidos/ }).click();
  await expect(page.locator('article.order-ticket').first()).toBeVisible();
  await reachEnd(page, 'pedidos');
  await expectUncovered(page, page.locator('.business-security-note'), 'pedidos: final');
  // Ticket abierto y cerrado con atrás.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.getByRole('button', { name: /^Ver ticket del pedido/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await pressBack(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expectScrollFree(page, 'pedidos tras cerrar el ticket con atrás');
  await reachEnd(page, 'pedidos tras el ticket');
  // Historial (día anterior).
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.getByRole('button', { name: 'Día anterior' }).click();
  await expect(page.locator('[data-orders-history]')).toBeVisible();
  await reachEnd(page, 'historial');
  await expectUncovered(page, page.locator('.business-security-note'), 'historial: final');
  await pressBack(page);
  await expect(page.locator('[data-orders-history]')).toHaveCount(0);
  // Panel de control.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.getByRole('tab', { name: 'Panel' }).click();
  await expect(page.locator('.control-card').first()).toBeVisible();
  await reachEnd(page, 'panel de control');
  await expectUncovered(page, page.locator('.business-security-note'), 'panel: final');
  await page.context().close();
});

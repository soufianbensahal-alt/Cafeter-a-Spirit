import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ORDER_COPY } from '../client/order-copy.js';
import { CLIENT_ICONS } from '../client/icons.js';
import { listedPriceCents, renderCartScreen, renderCheckoutContent } from '../client/order-view.js';
import { addToCart, emptyCart } from '../services/cart-rules.js';
import {
  COMPACT_MAX_HEIGHT_PX,
  KEYBOARD_THRESHOLD_PX,
  checkoutViewportLayout,
  scrollDeltaToReveal
} from '../services/checkout-viewport.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const translator = (lang) => (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), ORDER_COPY[lang][key] || key);
const t = translator('es');
const cartWith = (...ids) => ids.reduce((cart, id) => addToCart(cart, id).cart, emptyCart());
const names = { 'cafes-latte': 'Latte', 'cafes-mocha': 'Mocha' };
const cartOptions = (cart, products) => ({ cart, products, productName: (id) => names[id], translate: t, escapeHTML, icons: CLIENT_ICONS, lang: 'es' });
const css = () => readFile(new URL('../styles.css', import.meta.url), 'utf8');
const rule = (source, selector) => source.match(new RegExp(`(?:^|\\n)${selector.replace(/[.[\]"=()]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';

// ---------------------------------------------------------------------------
// Teclado y viewport visible.
// ---------------------------------------------------------------------------
test('sin teclado el diálogo usa todo el alto y no es compacto', () => {
  assert.deepEqual(checkoutViewportLayout({ layoutHeight: 844, viewportHeight: 844, offsetTop: 0 }), { height: 844, top: 0, keyboardOpen: false, compact: false });
  // Las barras de Safari cambian el alto visible sin que haya teclado.
  assert.equal(checkoutViewportLayout({ layoutHeight: 844, viewportHeight: 844 - KEYBOARD_THRESHOLD_PX + 1 }).keyboardOpen, false);
  // Sin visualViewport se usa el alto del layout.
  assert.equal(checkoutViewportLayout({ layoutHeight: 700, viewportHeight: undefined }).height, 700);
});

test('con teclado el diálogo sigue al viewport visible y, si es bajo, oculta el total', () => {
  const iphone = checkoutViewportLayout({ layoutHeight: 844, viewportHeight: 460.4, offsetTop: 112.6 });
  assert.deepEqual(iphone, { height: 460, top: 113, keyboardOpen: true, compact: true });
  const ipad = checkoutViewportLayout({ layoutHeight: 1180, viewportHeight: 790 });
  assert.equal(ipad.keyboardOpen, true);
  assert.equal(ipad.compact, false, `con más de ${COMPACT_MAX_HEIGHT_PX}px visibles se mantiene el total`);
  assert.equal(checkoutViewportLayout({ layoutHeight: 844, viewportHeight: 460, offsetTop: -5 }).top, 0);
});

test('scrollDeltaToReveal deja el campo entre la cabecera y el pie', () => {
  const container = { containerTop: 100, containerBottom: 400 };
  assert.equal(scrollDeltaToReveal({ ...container, targetTop: 150, targetBottom: 250 }), 0);
  // Tapado por el pie: baja lo justo más el margen.
  assert.equal(scrollDeltaToReveal({ ...container, targetTop: 360, targetBottom: 460 }), 72);
  // Por encima de la cabecera: sube.
  assert.equal(scrollDeltaToReveal({ ...container, targetTop: 40, targetBottom: 140 }), -72);
  // No cabe entero: prioriza el control enfocado.
  assert.equal(scrollDeltaToReveal({ ...container, targetTop: 300, targetBottom: 700, focusTop: 350 }), 238);
});

// ---------------------------------------------------------------------------
// Precio tachado y nota bajo el total.
// ---------------------------------------------------------------------------
test('listedPriceCents sólo devuelve precios válidos de la carta', () => {
  assert.equal(listedPriceCents({ priceCents: 250, available: false, inCatalog: true }), 250);
  assert.equal(listedPriceCents({ priceCents: 250, available: true, inCatalog: false }), null);
  assert.equal(listedPriceCents({ priceCents: 0, available: true, inCatalog: true }), null);
  assert.equal(listedPriceCents(undefined), null);
});

test('una línea agotada conserva el precio tachado y el total avisa de que no la incluye', () => {
  const cart = addToCart(cartWith('cafes-latte', 'cafes-mocha'), 'cafes-latte').cart;
  const products = new Map([
    ['cafes-latte', { priceCents: 250, available: false, inCatalog: true }],
    ['cafes-mocha', { priceCents: 300, available: true, inCatalog: true }]
  ]);
  const html = renderCartScreen(cartOptions(cart, products));
  assert.match(html, /<s class="cart-line__unit-price price--struck">2,50\s€<span class="sr-only"> \(no incluido en el total\)<\/span><\/s>/);
  assert.match(html, /<s class="cart-line__total price--struck">5,00\s€<span class="sr-only"> \(no incluido en el total\)<\/span><\/s>/);
  assert.match(html, /Agotado: elimínalo para continuar/);
  assert.match(html, /<strong data-cart-total>3,00\s€<\/strong>/);
  assert.match(html, /<p class="order-summary__excluded" data-total-excluded>No incluye productos agotados<\/p>/);
  // El producto disponible no se tacha.
  assert.match(html, /<strong class="cart-line__total">3,00\s€<\/strong>/);
});

test('sin agotados no hay tachado ni nota; con pedidos cerrados tampoco', () => {
  const cart = cartWith('cafes-latte');
  const available = new Map([['cafes-latte', { priceCents: 250, available: true, inCatalog: true }]]);
  const html = renderCartScreen(cartOptions(cart, available));
  assert.doesNotMatch(html, /price--struck|data-total-excluded/);
  const closed = renderCartScreen({ ...cartOptions(cart, new Map()), orderingOpen: false });
  assert.doesNotMatch(closed, /price--struck|data-total-excluded/);
});

test('el catalán tiene los textos del total sin agotados', () => {
  assert.equal(ORDER_COPY.ca.cartTotalExcludesSoldOut, 'No inclou productes esgotats');
  assert.ok(ORDER_COPY.ca.cartExcludedFromTotal);
});

// ---------------------------------------------------------------------------
// Estructura de la confirmación.
// ---------------------------------------------------------------------------
test('la confirmación separa cuerpo desplazable y pie con total, error y envío', () => {
  const cart = cartWith('cafes-latte');
  const products = new Map([['cafes-latte', { priceCents: 250, available: true, inCatalog: true }]]);
  const html = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es' });
  const body = html.slice(html.indexOf('data-checkout-body'), html.indexOf('data-checkout-footer'));
  const footer = html.slice(html.indexOf('data-checkout-footer'));
  for (const marker of ['data-checkout-code', 'data-checkout-table', 'data-checkout-pickup', 'data-checkout-availability', 'Pagarás en el local.']) {
    assert.ok(body.includes(marker), `${marker} va en el cuerpo`);
  }
  for (const marker of ['data-checkout-total', 'data-total-excluded', 'data-checkout-error', 'data-checkout-submit']) {
    assert.ok(footer.includes(marker), `${marker} va en el pie`);
  }
  assert.match(footer, /<p class="order-summary__excluded" data-total-excluded hidden>/);
  // El pie sigue dentro del formulario para que «Enviar pedido» lo envíe.
  assert.ok(html.indexOf('data-checkout-footer') < html.indexOf('</form>'));

  const blocked = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es', soldOutNames: ['Latte'] });
  assert.match(blocked, /<p class="order-summary__excluded" data-total-excluded >No incluye productos agotados/);
});

test('CSS: pie fijo con safe-area, cuerpo desplazable y modo compacto con teclado', async () => {
  const source = await css();
  assert.match(rule(source, '.modal--checkout'), /display: flex; flex-direction: column; overflow: hidden; max-height: calc\(var\(--viewport-height, 100svh\) - 40px\)/);
  assert.match(rule(source, '.checkout-body'), /overflow-y: auto; overscroll-behavior: contain/);
  assert.match(rule(source, '.checkout-body'), /min-height: 0/);
  assert.match(rule(source, '.checkout-footer'), /flex: none/);
  assert.match(rule(source, '.checkout-footer'), /padding: 14px 27px max\(18px, env\(safe-area-inset-bottom\)\)/);
  assert.match(rule(source, '.modal--compact .checkout-footer__summary'), /display: none/);
  assert.match(rule(source, '.modal-backdrop--viewport'), /top: var\(--viewport-top, 0px\); height: var\(--viewport-height, 100%\)/);
  assert.match(rule(source, '.price--struck'), /text-decoration: line-through/);
});

test('CSS: casilla «Recoger en barra» de la marca con 44 px, foco visible y variante oscura', async () => {
  const source = await css();
  const box = rule(source, '.checkout-pickup input[type="checkbox"]');
  assert.match(box, /appearance: none/);
  assert.match(box, /width: 24px; height: 24px/);
  assert.match(box, /border: 2px solid/);
  assert.match(rule(source, '.checkout-pickup input[type="checkbox"]:checked'), /background-color: var\(--mustard\)/);
  assert.match(rule(source, '.checkout-pickup input[type="checkbox"]:focus-visible'), /outline: 3px solid/);
  assert.match(rule(source, '.checkout-pickup'), /min-height: 44px/);
  assert.match(rule(source, 'html[data-theme="dark"] .checkout-pickup input[type="checkbox"]:checked'), /background-color: var\(--mustard\)/);
  assert.match(rule(source, 'html[data-theme="dark"] .checkout-pickup input[type="checkbox"]'), /border-color: rgba\(247,240,222,\.62\)/);
});

test('app.js ajusta la confirmación al viewport visible y lo libera al cerrar', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /modalController\.open\(checkoutSheet\(\), \{ initialFocus: '\[data-checkout-code\]' \}\); bind\(\); startCheckoutViewport\(\);/);
  assert.match(app, /viewport\?\.addEventListener\('resize', update\)/);
  assert.match(app, /viewport\?\.addEventListener\('scroll', update\)/);
  assert.match(app, /dialog\.addEventListener\('focusin', onFocusIn\)/);
  assert.match(app, /if \(closingCheckout\) \{\n      stopCheckoutViewport\(\);/);
  assert.match(app, /if \(excluded\) excluded\.hidden = names\.length === 0;/);
});

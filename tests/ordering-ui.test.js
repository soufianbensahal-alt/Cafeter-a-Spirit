import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMenuCategories } from '../data/menu.js';
import { CLIENT_ICONS } from '../client/icons.js';
import { ORDER_COPY } from '../client/order-copy.js';
import { renderCartBar, renderMenuContent, renderMenuScreen } from '../client/menu-view.js';
import {
  renderCartScreen,
  renderCheckoutContent,
  renderOrderTrackingScreen
} from '../client/order-view.js';
import { addToCart, emptyCart } from '../services/cart-rules.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const translator = (lang) => (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), ORDER_COPY[lang][key] || key);
const t = translator('es');
const categories = getMenuCategories('es');
const latte = categories.flatMap((category) => category.products).find((product) => product.id === 'cafes-latte');
const base = { categories, query: '', activeCategory: 'cafes', icons: CLIENT_ICONS, translate: t, escapeHTML, brandLogo: () => '' };

const products = new Map(categories.flatMap((category) => category.products).map((product) => [product.id, { priceCents: 250, available: true, inCatalog: true }]));
products.set('cafes-flat-white', { priceCents: 260, available: false, inCatalog: true });
const ordering = { products, quantities: new Map([['cafes-latte', 2]]), units: 2, totalLabel: '5,00 €' };

test('castellano y catalán definen exactamente las mismas claves de pedidos', async () => {
  assert.deepEqual(Object.keys(ORDER_COPY.ca).sort(), Object.keys(ORDER_COPY.es).sort());
  for (const lang of ['es', 'ca']) {
    for (const [key, value] of Object.entries(ORDER_COPY[lang])) {
      assert.ok(value.trim(), `${lang}.${key} está vacío`);
    }
  }
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const existingKeys = [...app.slice(app.indexOf('const copy = {'), app.indexOf('Object.assign(copy.es')).matchAll(/(\w+): '/g)].map((match) => match[1]);
  const collisions = Object.keys(ORDER_COPY.es).filter((key) => existingKeys.includes(key));
  assert.deepEqual(collisions, [], 'las claves de pedidos no deben pisar textos existentes');
});

test('textos obligatorios del flujo en ambos idiomas', () => {
  assert.equal(ORDER_COPY.es.checkoutCodeHint, 'El código está en la barra.');
  assert.equal(ORDER_COPY.es.checkoutPayAtVenue, 'Pagarás en el local.');
  assert.equal(ORDER_COPY.es.checkoutPickup, 'Recoger en barra');
  assert.equal(ORDER_COPY.ca.checkoutCodeHint, 'El codi és a la barra.');
  assert.equal(ORDER_COPY.ca.checkoutPayAtVenue, 'Pagaràs al local.');
});

test('sin contexto de pedidos la carta sigue siendo informativa', () => {
  const html = renderMenuScreen(base);
  assert.doesNotMatch(html, /data-add-product|menu-add|cart-bar|data-product-order|open-orders/);
  assert.doesNotMatch(renderMenuContent(base), /menu-product__order/);
});

test('con pedidos abiertos aparecen «Añadir», agotados deshabilitados y la barra de carrito', () => {
  const html = renderMenuScreen({ ...base, ordering });
  assert.match(html, /data-add-product="cafes-latte"[^>]*aria-label="Añadir Latte al carrito"/);
  assert.match(html, /2 en el carrito/);
  assert.match(html, /<button class="menu-add menu-add--soldout" type="button" disabled aria-label="Flat white está agotado">Agotado<\/button>/);
  assert.match(html, /data-action="open-orders" aria-label="Mis pedidos"/);
  assert.match(html, /class="cart-bar"[^>]*aria-label="Ver carrito: 2 productos, 5,00 €"/);
});

test('los productos sin precio en public.products no muestran botón', () => {
  const html = renderMenuContent({ ...base, ordering: { ...ordering, products: new Map() } });
  assert.doesNotMatch(html, /data-add-product/);
});

test('la barra de carrito desaparece con el carrito vacío', () => {
  assert.equal(renderCartBar({ ordering: { ...ordering, units: 0 }, translate: t }), '');
  assert.match(renderCartBar({ ordering: { ...ordering, units: 1 }, translate: t }), /1 producto,/);
});

test('el carrito ofrece +/−, eliminar, nota de 140 y total orientativo', () => {
  const cart = addToCart(emptyCart(), 'cafes-latte').cart;
  const html = renderCartScreen({ cart, products, productName: () => latte.name, translate: t, escapeHTML, icons: CLIENT_ICONS, lang: 'es' });
  assert.match(html, /data-cart-dec="cafes-latte" aria-label="Quitar una unidad de Latte"/);
  assert.match(html, /data-cart-inc="cafes-latte" aria-label="Añadir una unidad de Latte"/);
  assert.match(html, /data-cart-remove="cafes-latte" aria-label="Eliminar Latte"/);
  assert.match(html, /<textarea id="cart-note"[^>]*maxlength="140"/);
  assert.match(html, /Total orientativo/);
  assert.match(html, /data-action="open-checkout" >/);
});

test('el carrito bloquea la confirmación si hay agotados o los pedidos están cerrados', () => {
  const cart = addToCart(emptyCart(), 'cafes-flat-white').cart;
  const options = { cart, products, productName: () => 'Flat white', translate: t, escapeHTML, icons: CLIENT_ICONS, lang: 'es' };
  assert.match(renderCartScreen(options), /data-action="open-checkout" disabled/);
  assert.match(renderCartScreen(options), /Agotado: elimínalo para continuar/);
  const closed = renderCartScreen({ ...options, orderingOpen: false });
  assert.match(closed, /Ahora mismo no aceptamos pedidos/);
  assert.match(closed, /data-action="open-checkout" disabled/);
});

test('la confirmación pide código numérico de 4 cifras, mesa o barra, y avisa del pago', () => {
  const cart = addToCart(emptyCart(), 'cafes-latte').cart;
  const html = renderCheckoutContent({ cart, products, translate: t, lang: 'es' });
  assert.match(html, /<input id="checkout-code"[^>]*inputmode="numeric"[^>]*maxlength="4"[^>]*autocomplete="one-time-code"/);
  assert.match(html, /El código está en la barra\./);
  assert.match(html, /<input id="checkout-table"[^>]*maxlength="20"/);
  assert.match(html, /name="pickup" value="Barra"/);
  assert.match(html, /Pagarás en el local\./);
  assert.match(html, /role="alert" data-checkout-error/);
});

test('el seguimiento muestra número, estado, progreso y cancelar solo en pending', () => {
  const order = {
    id: 'o1', number: 7, status: 'pending', tableLabel: 'Barra', totalCents: 440, note: 'Sin azúcar',
    rejectionReason: '', createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z',
    items: [{ productId: 'cafes-latte', productName: 'Latte', quantity: 2, unitPriceCents: 220, lineTotalCents: 440 }]
  };
  const options = { order, loading: false, offline: false, productName: (id, fallback) => fallback, translate: t, escapeHTML, icons: CLIENT_ICONS, lang: 'es' };
  const pending = renderOrderTrackingScreen(options);
  assert.match(pending, /<h1[^>]*>Pedido nº 7<\/h1>/);
  assert.match(pending, /Recoger en barra/);
  assert.match(pending, /aria-current="step"/);
  assert.match(pending, /data-action="cancel-order"/);
  assert.match(pending, /Pagarás en el local/);

  const accepted = renderOrderTrackingScreen({ ...options, order: { ...order, status: 'accepted', tableLabel: '4' } });
  assert.doesNotMatch(accepted, /data-action="cancel-order"/);
  assert.match(accepted, /Mesa 4/);

  const rejected = renderOrderTrackingScreen({ ...options, order: { ...order, status: 'rejected', rejectionReason: '<b>Cocina cerrada</b>' } });
  assert.match(rejected, /Motivo: &lt;b&gt;Cocina cerrada&lt;\/b&gt;/);
  assert.doesNotMatch(rejected, /order-progress/);
});

test('los controles nuevos respetan el mínimo de 44 px', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  for (const selector of ['.menu-add', '.stepper__button', '.cart-line__remove']) {
    const rule = css.match(new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] || '';
    const sizes = [...rule.matchAll(/(?:min-)?(?:height|width): (\d+)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.length && sizes.every((size) => size >= 44), `${selector} mide al menos 44 px`);
  }
});

test('app.js usa live-announcer, el modal accesible y sessionStorage para pedidos', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /announcer\.announce\(t\('orderAdded'/);
  assert.match(app, /announcer\.announce\(t\('orderStatusAnnouncement'/);
  assert.match(app, /modalController\.open\(checkoutSheet\(\), \{ initialFocus: '\[data-checkout-code\]' \}\)/);
  assert.match(app, /sessionStorage\.setItem\(CART_STORAGE_KEY/);
  assert.match(app, /createRealtimeWithFallback\(/);
});

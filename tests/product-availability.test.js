import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ORDER_COPY } from '../client/order-copy.js';
import { renderCheckoutContent, renderCheckoutSoldOutNotice } from '../client/order-view.js';
import {
  addToCart,
  canCheckout,
  cartAvailabilityChanges,
  emptyCart,
  productsSignature
} from '../services/cart-rules.js';
import { shouldWatchProducts } from '../services/order-monitor.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const t = (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), ORDER_COPY.es[key] || key);

const product = (available, priceCents = 250) => ({ priceCents, available, inCatalog: true });
const catalog = (entries) => new Map(entries);
const cartWith = (...ids) => ids.reduce((cart, id) => addToCart(cart, id).cart, emptyCart());

test('productsSignature ignora el orden y detecta disponibilidad, precio y catálogo', () => {
  const a = catalog([['cafes-latte', product(true)], ['cafes-mocha', product(true)]]);
  const b = catalog([['cafes-mocha', product(true)], ['cafes-latte', product(true)]]);
  assert.equal(productsSignature(a), productsSignature(b));
  assert.notEqual(productsSignature(a), productsSignature(catalog([['cafes-latte', product(false)], ['cafes-mocha', product(true)]])));
  assert.notEqual(productsSignature(a), productsSignature(catalog([['cafes-latte', product(true, 260)], ['cafes-mocha', product(true)]])));
  assert.notEqual(productsSignature(a), productsSignature(catalog([['cafes-latte', { ...product(true), inCatalog: false }], ['cafes-mocha', product(true)]])));
  assert.equal(productsSignature(new Map()), '');
  assert.equal(productsSignature(undefined), '');
});

test('cartAvailabilityChanges sólo informa de líneas del carrito que cambian', () => {
  const cart = cartWith('cafes-latte', 'cafes-mocha');
  const before = catalog([['cafes-latte', product(true)], ['cafes-mocha', product(false)], ['cafes-flat-white', product(true)]]);
  const after = catalog([['cafes-latte', product(false)], ['cafes-mocha', product(true)], ['cafes-flat-white', product(false)]]);
  const changes = cartAvailabilityChanges(cart, before, after);
  assert.deepEqual(changes.soldOut, ['cafes-latte']);
  assert.deepEqual(changes.restored, ['cafes-mocha']);
  assert.ok(Object.isFrozen(changes));
});

test('la primera carga y los productos desconocidos no generan avisos', () => {
  const cart = cartWith('cafes-latte');
  assert.deepEqual(cartAvailabilityChanges(cart, new Map(), catalog([['cafes-latte', product(false)]])), { soldOut: [], restored: [] });
  assert.deepEqual(cartAvailabilityChanges(cart, catalog([['cafes-latte', product(true)]]), new Map()), { soldOut: [], restored: [] });
  assert.deepEqual(cartAvailabilityChanges(emptyCart(), catalog([['cafes-latte', product(true)]]), catalog([['cafes-latte', product(false)]])), { soldOut: [], restored: [] });
});

test('agotar bloquea el pedido y reponer lo desbloquea solo', () => {
  const cart = cartWith('cafes-latte');
  assert.equal(canCheckout(cart, catalog([['cafes-latte', product(false)]])), false);
  assert.equal(canCheckout(cart, catalog([['cafes-latte', product(true)]])), true);
});

test('la disponibilidad sólo se vigila en la carta y el carrito con los pedidos activos', () => {
  assert.equal(shouldWatchProducts({ orderingActive: true, screen: 'menu' }), true);
  assert.equal(shouldWatchProducts({ orderingActive: true, screen: 'cart' }), true);
  assert.equal(shouldWatchProducts({ orderingActive: false, screen: 'menu' }), false);
  for (const screen of ['home', 'orders', 'orderTracking', 'profile']) {
    assert.equal(shouldWatchProducts({ orderingActive: true, screen }), false, screen);
  }
});

test('el aviso de la confirmación nombra lo agotado, escapa y ofrece volver al carrito', () => {
  assert.equal(renderCheckoutSoldOutNotice({ names: [], translate: t, escapeHTML }), '');
  const one = renderCheckoutSoldOutNotice({ names: ['Latte'], translate: t, escapeHTML });
  assert.match(one, /tabindex="-1" data-checkout-soldout/);
  assert.match(one, /Latte se acaba de agotar\./);
  assert.match(one, /data-action="checkout-back-to-cart">Volver al carrito</);
  const many = renderCheckoutSoldOutNotice({ names: ['Latte', '<b>Mocha</b>'], translate: t, escapeHTML });
  assert.match(many, /Se acaban de agotar: Latte, &lt;b&gt;Mocha&lt;\/b&gt;\./);
});

test('la confirmación conserva el borrador y desactiva «Enviar pedido» si hay agotados', () => {
  const cart = cartWith('cafes-latte');
  const products = catalog([['cafes-latte', product(true)]]);
  const draft = { code: '4826', table: 'Terraza "2"', pickup: false };
  const html = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es', draft });
  assert.match(html, /id="checkout-code"[^>]*value="4826"/);
  assert.match(html, /id="checkout-table"[^>]*value="Terraza &quot;2&quot;"[^>]*required/);
  assert.match(html, /data-checkout-submit >/);
  assert.match(html, /<div data-checkout-availability><\/div>/);

  const pickup = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es', draft: { ...draft, pickup: true } });
  assert.match(pickup, /id="checkout-table"[^>]*disabled/);
  assert.match(pickup, /name="pickup" value="Barra" checked/);

  const blocked = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es', soldOutNames: ['Latte'] });
  assert.match(blocked, /data-checkout-submit disabled/);
  assert.match(blocked, /Latte se acaba de agotar/);
});

test('app.js vigila products en tiempo real y no cierra la confirmación por un agotado', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /subscribeToProducts\(watchedProductsBusinessId/);
  assert.match(app, /reconcile: reconcileProducts/);
  assert.match(app, /syncProductMonitor\(\);\n  if \(lastAnnouncedScreen/);
  assert.match(app, /productMonitor\.stop\(\);/);
  assert.match(app, /announcer\.announce\(names\(soldOut\)\.map\(\(name\) => t\('cartItemSoldOut', \{ name \}\)\)\.join\(' '\), \{ assertive: true \}\)/);
  // Consulta justo antes de create_order.
  const submit = app.slice(app.indexOf('async function submitCheckout'), app.indexOf('async function confirmCancelOrder'));
  assert.ok(submit.indexOf('await reconcileProducts()') > -1 && submit.indexOf('await reconcileProducts()') < submit.indexOf('createOrder('));
  // product_unavailable ya no cierra el diálogo.
  assert.doesNotMatch(app, /\['ordering_closed', 'ordering_unavailable', 'not_in_pilot', 'product_unavailable'\]/);
  assert.match(app, /reason === 'order-created' \? null : readCheckoutDraft\(closingCheckout\)/);
});

test('la suscripción filtra por negocio', async () => {
  const service = await readFile(new URL('../services/order-service.js', import.meta.url), 'utf8');
  assert.match(service, /table: 'products',\n      filter: `business_id=eq\.\$\{businessId\}`/);
});

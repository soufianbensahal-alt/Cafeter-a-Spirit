import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CART_LIMITS,
  CART_STORAGE_VERSION,
  PICKUP_TABLE_LABEL,
  addToCart,
  canCheckout,
  cartQuantity,
  cartTotalCents,
  cartUnits,
  changeQuantity,
  emptyCart,
  formatCents,
  isValidOrderCode,
  isValidTableLabel,
  limitNote,
  normalizeOrderCode,
  orderErrorKey,
  parseStoredCart,
  removeFromCart,
  resolveTableLabel,
  serializeCart,
  setCartNote,
  toOrderItems,
  unavailableCartItems
} from '../services/cart-rules.js';

const products = new Map([
  ['cafes-latte', { priceCents: 220, available: true, inCatalog: true }],
  ['tostadas-aguacate', { priceCents: 850, available: true, inCatalog: true }],
  ['cafes-agotado', { priceCents: 300, available: false, inCatalog: true }],
  ['cafes-retirado', { priceCents: 300, available: true, inCatalog: false }]
]);

const add = (cart, id, times = 1) => {
  let current = cart;
  for (let index = 0; index < times; index += 1) current = addToCart(current, id).cart;
  return current;
};

test('añadir agrupa unidades del mismo producto y conserva el orden de inserción', () => {
  let cart = add(emptyCart(), 'cafes-latte');
  cart = add(cart, 'tostadas-aguacate');
  cart = add(cart, 'cafes-latte');
  assert.deepEqual(cart.items, [
    { productId: 'cafes-latte', quantity: 2 },
    { productId: 'tostadas-aguacate', quantity: 1 }
  ]);
  assert.equal(cartUnits(cart), 3);
  assert.equal(cartQuantity(cart, 'cafes-latte'), 2);
});

test('el carrito es inmutable: cada operación devuelve un objeto nuevo', () => {
  const original = emptyCart();
  const { cart } = addToCart(original, 'cafes-latte');
  assert.equal(original.items.length, 0);
  assert.notEqual(cart, original);
  assert.ok(Object.isFrozen(cart.items));
});

test('no se superan 10 unidades por producto (mismo límite que create_order)', () => {
  const cart = add(emptyCart(), 'cafes-latte', CART_LIMITS.maxQuantity);
  const result = addToCart(cart, 'cafes-latte');
  assert.equal(result.status, 'quantity_limit');
  assert.equal(cartQuantity(result.cart, 'cafes-latte'), 10);
  assert.equal(cartQuantity(changeQuantity(cart, 'cafes-latte', 1), 'cafes-latte'), 10);
});

test('no se superan 20 líneas distintas', () => {
  let cart = emptyCart();
  for (let index = 0; index < CART_LIMITS.maxLines; index += 1) cart = add(cart, `p-${index}`);
  const result = addToCart(cart, 'p-extra');
  assert.equal(result.status, 'line_limit');
  assert.equal(result.cart.items.length, 20);
  assert.equal(addToCart(cart, 'p-0').status, 'ok', 'sumar a una línea existente sigue permitido');
});

test('rechaza identificadores de producto con formato inválido', () => {
  assert.equal(addToCart(emptyCart(), 'Café Latte').status, 'invalid_product');
  assert.equal(addToCart(emptyCart(), '').status, 'invalid_product');
});

test('+/− cambia la cantidad y bajar de 1 elimina la línea', () => {
  let cart = add(emptyCart(), 'cafes-latte', 2);
  cart = changeQuantity(cart, 'cafes-latte', -1);
  assert.equal(cartQuantity(cart, 'cafes-latte'), 1);
  cart = changeQuantity(cart, 'cafes-latte', -1);
  assert.equal(cart.items.length, 0);
  assert.equal(changeQuantity(cart, 'no-existe', 1), cart);
});

test('eliminar quita la línea completa sin tocar el resto', () => {
  let cart = add(add(emptyCart(), 'cafes-latte', 3), 'tostadas-aguacate');
  cart = removeFromCart(cart, 'cafes-latte');
  assert.deepEqual(cart.items, [{ productId: 'tostadas-aguacate', quantity: 1 }]);
});

test('la nota se limita a 140 caracteres sin partir emojis', () => {
  const long = 'a'.repeat(200);
  assert.equal(setCartNote(emptyCart(), long).note.length, 140);
  const emojis = '☕️'.repeat(100);
  const limited = limitNote(emojis);
  assert.equal(Array.from(limited).length, 140);
  assert.ok(!/[\uD800-\uDBFF]$/.test(limited), 'no deja un surrogate suelto');
});

test('el total orientativo usa los precios de public.products en céntimos', () => {
  const cart = add(add(emptyCart(), 'cafes-latte', 3), 'tostadas-aguacate');
  assert.equal(cartTotalCents(cart, products), 3 * 220 + 850);
  assert.equal(formatCents(1510, 'es').replace(/\s/g, ' '), '15,10 €');
  assert.equal(formatCents(220, 'ca').replace(/\s/g, ' '), '2,20 €');
});

test('productos agotados o retirados bloquean la confirmación y no suman', () => {
  let cart = add(emptyCart(), 'cafes-latte');
  assert.equal(canCheckout(cart, products), true);
  cart = add(cart, 'cafes-agotado');
  cart = add(cart, 'cafes-retirado');
  cart = add(cart, 'producto-desconocido');
  assert.deepEqual(unavailableCartItems(cart, products), ['cafes-agotado', 'cafes-retirado', 'producto-desconocido']);
  assert.equal(canCheckout(cart, products), false);
  assert.equal(cartTotalCents(cart, products), 220);
  assert.equal(canCheckout(emptyCart(), products), false, 'un carrito vacío no se confirma');
});

test('toOrderItems produce exactamente el formato que espera create_order', () => {
  const cart = add(add(emptyCart(), 'cafes-latte', 2), 'tostadas-aguacate');
  assert.deepEqual(toOrderItems(cart), [
    { product_id: 'cafes-latte', quantity: 2 },
    { product_id: 'tostadas-aguacate', quantity: 1 }
  ]);
});

test('sessionStorage: ida y vuelta conserva líneas y nota del mismo usuario', () => {
  const cart = setCartNote(add(emptyCart(), 'cafes-latte', 2), 'Sin azúcar');
  const raw = serializeCart(cart, 'user-1');
  assert.equal(JSON.parse(raw).v, CART_STORAGE_VERSION);
  const restored = parseStoredCart(raw, 'user-1');
  assert.deepEqual(restored.items, cart.items);
  assert.equal(restored.note, 'Sin azúcar');
});

test('sessionStorage: se descarta un carrito de otro usuario, otra versión o corrupto', () => {
  const raw = serializeCart(add(emptyCart(), 'cafes-latte'), 'user-1');
  assert.equal(parseStoredCart(raw, 'user-2').items.length, 0);
  assert.equal(parseStoredCart(raw, null).items.length, 0);
  assert.equal(parseStoredCart(JSON.stringify({ ...JSON.parse(raw), v: 99 }), 'user-1').items.length, 0);
  assert.equal(parseStoredCart('{no json', 'user-1').items.length, 0);
  assert.equal(parseStoredCart(null, 'user-1').items.length, 0);
  const tampered = (items) => JSON.stringify({ v: CART_STORAGE_VERSION, userId: 'user-1', items, note: '' });
  assert.equal(parseStoredCart(tampered([{ productId: 'cafes-latte', quantity: 11 }]), 'user-1').items.length, 0);
  assert.equal(parseStoredCart(tampered([{ productId: 'cafes-latte', quantity: 1.5 }]), 'user-1').items.length, 0);
  assert.equal(parseStoredCart(tampered([{ productId: '<script>', quantity: 1 }]), 'user-1').items.length, 0);
  assert.equal(parseStoredCart(tampered([{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }]), 'user-1').items.length, 0);
  assert.equal(parseStoredCart(tampered(Array.from({ length: 21 }, (_, index) => ({ productId: `p-${index}`, quantity: 1 }))), 'user-1').items.length, 0);
});

test('sessionStorage: una nota guardada demasiado larga se recorta', () => {
  const raw = JSON.stringify({ v: CART_STORAGE_VERSION, userId: 'u', items: [], note: 'x'.repeat(300) });
  assert.equal(parseStoredCart(raw, 'u').note.length, 140);
});

test('el código del local acepta solo 4 cifras', () => {
  assert.equal(normalizeOrderCode(' 12a3-45 '), '1234');
  assert.equal(isValidOrderCode('1234'), true);
  assert.equal(isValidOrderCode('123'), false);
  assert.equal(isValidOrderCode('12345'), false);
  assert.equal(isValidOrderCode('12a4'), false);
});

test('la mesa es texto corto (1-20) y «Recoger en barra» envía Barra', () => {
  assert.equal(isValidTableLabel('  Terraza   2 '), true);
  assert.equal(isValidTableLabel('   '), false);
  assert.equal(isValidTableLabel('x'.repeat(21)), false);
  assert.equal(resolveTableLabel({ pickup: false, table: '  Terraza   2 ' }), 'Terraza 2');
  assert.equal(resolveTableLabel({ pickup: true, table: '7' }), PICKUP_TABLE_LABEL);
  assert.equal(PICKUP_TABLE_LABEL, 'Barra');
});

test('cada estado de error de create_order tiene un mensaje específico', () => {
  assert.equal(orderErrorKey('invalid_code'), 'orderErrorCode');
  assert.equal(orderErrorKey('code_rate_limited'), 'orderErrorRateLimited');
  assert.equal(orderErrorKey('ordering_closed'), 'orderErrorClosed');
  assert.equal(orderErrorKey('product_unavailable'), 'orderErrorProductUnavailable');
  assert.equal(orderErrorKey('active_order_limit'), 'orderErrorActiveLimit');
  assert.equal(orderErrorKey('network_error'), 'orderErrorNetwork');
  assert.equal(orderErrorKey('algo_raro'), 'orderErrorGeneric');
});

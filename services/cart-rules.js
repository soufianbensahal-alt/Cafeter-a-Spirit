// Lógica pura del carrito de pedidos. Sin DOM ni red: se prueba en
// tests/cart-rules.test.js. Los límites replican los de create_order.

export const CART_STORAGE_KEY = 'spirit-order-cart';
export const CART_STORAGE_VERSION = 1;
export const PICKUP_TABLE_LABEL = 'Barra';

export const CART_LIMITS = Object.freeze({
  maxQuantity: 10,
  maxLines: 20,
  noteMaxLength: 140,
  tableMaxLength: 20
});

const PRODUCT_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const emptyCart = () => Object.freeze({ items: Object.freeze([]), note: '' });

const freezeCart = (items, note) => Object.freeze({
  items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
  note
});

const isValidProductId = (value) => typeof value === 'string'
  && value.length <= 120
  && PRODUCT_ID_PATTERN.test(value);

const isValidQuantity = (value) => Number.isInteger(value)
  && value >= 1
  && value <= CART_LIMITS.maxQuantity;

// Recorta por puntos de código para no partir emojis ni caracteres compuestos.
export function limitNote(value) {
  return Array.from(String(value ?? '')).slice(0, CART_LIMITS.noteMaxLength).join('');
}

export const noteLength = (value) => Array.from(String(value ?? '')).length;

export function cartQuantity(cart, productId) {
  return cart.items.find((item) => item.productId === productId)?.quantity || 0;
}

export function addToCart(cart, productId) {
  if (!isValidProductId(productId)) return { cart, status: 'invalid_product' };
  const current = cartQuantity(cart, productId);
  if (current >= CART_LIMITS.maxQuantity) return { cart, status: 'quantity_limit' };
  if (!current && cart.items.length >= CART_LIMITS.maxLines) return { cart, status: 'line_limit' };
  const items = current
    ? cart.items.map((item) => item.productId === productId ? { ...item, quantity: current + 1 } : item)
    : [...cart.items, { productId, quantity: 1 }];
  return { cart: freezeCart(items, cart.note), status: 'ok' };
}

export function changeQuantity(cart, productId, delta) {
  const current = cartQuantity(cart, productId);
  if (!current || !Number.isInteger(delta)) return cart;
  const next = Math.min(CART_LIMITS.maxQuantity, current + delta);
  if (next <= 0) return removeFromCart(cart, productId);
  if (next === current) return cart;
  return freezeCart(
    cart.items.map((item) => item.productId === productId ? { ...item, quantity: next } : item),
    cart.note
  );
}

export function removeFromCart(cart, productId) {
  if (!cartQuantity(cart, productId)) return cart;
  return freezeCart(cart.items.filter((item) => item.productId !== productId), cart.note);
}

export function setCartNote(cart, note) {
  return freezeCart([...cart.items], limitNote(note));
}

export const cartUnits = (cart) => cart.items.reduce((sum, item) => sum + item.quantity, 0);

export const isCartEmpty = (cart) => cart.items.length === 0;

// products: Map<id, { priceCents, available, inCatalog }> procedente de public.products.
export const isProductOrderable = (product) => Boolean(
  product && product.available && product.inCatalog && Number.isInteger(product.priceCents) && product.priceCents > 0
);

export function unavailableCartItems(cart, products) {
  return cart.items
    .filter((item) => !isProductOrderable(products?.get(item.productId)))
    .map((item) => item.productId);
}

// Firma estable de la disponibilidad para no repintar si nada ha cambiado.
export function productsSignature(products) {
  return [...(products?.entries() || [])]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, product]) => `${id}:${product.priceCents}:${product.available ? 1 : 0}:${product.inCatalog ? 1 : 0}`)
    .join('|');
}

// Líneas del carrito cuyo estado pedible cambia entre dos lecturas de
// public.products. Sólo cuenta productos conocidos en ambas: la primera carga
// (mapa vacío) no anuncia nada.
export function cartAvailabilityChanges(cart, previous, next) {
  const soldOut = [];
  const restored = [];
  for (const { productId } of cart.items) {
    if (!previous?.has(productId) || !next?.has(productId)) continue;
    const before = isProductOrderable(previous.get(productId));
    const after = isProductOrderable(next.get(productId));
    if (before && !after) soldOut.push(productId);
    else if (!before && after) restored.push(productId);
  }
  return Object.freeze({ soldOut: Object.freeze(soldOut), restored: Object.freeze(restored) });
}

// Total orientativo: el definitivo lo calcula create_order con public.products.
export function cartTotalCents(cart, products) {
  return cart.items.reduce((sum, item) => {
    const product = products?.get(item.productId);
    return isProductOrderable(product) ? sum + product.priceCents * item.quantity : sum;
  }, 0);
}

export function canCheckout(cart, products) {
  return !isCartEmpty(cart)
    && cart.items.length <= CART_LIMITS.maxLines
    && unavailableCartItems(cart, products).length === 0;
}

export const toOrderItems = (cart) => cart.items.map((item) => ({
  product_id: item.productId,
  quantity: item.quantity
}));

export function serializeCart(cart, userId) {
  return JSON.stringify({
    v: CART_STORAGE_VERSION,
    userId: userId || null,
    items: cart.items.map(({ productId, quantity }) => ({ productId, quantity })),
    note: cart.note
  });
}

// Devuelve un carrito vacío ante cualquier dato corrupto, de otra versión o de
// otro usuario: nunca se confía en lo que haya en sessionStorage.
export function parseStoredCart(raw, userId) {
  if (typeof raw !== 'string' || !raw) return emptyCart();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyCart();
  }
  if (!data || data.v !== CART_STORAGE_VERSION || !userId || data.userId !== userId) return emptyCart();
  if (!Array.isArray(data.items) || data.items.length > CART_LIMITS.maxLines) return emptyCart();
  const seen = new Set();
  for (const item of data.items) {
    if (!item || !isValidProductId(item.productId) || !isValidQuantity(item.quantity) || seen.has(item.productId)) {
      return emptyCart();
    }
    seen.add(item.productId);
  }
  const note = typeof data.note === 'string' ? limitNote(data.note) : '';
  return freezeCart(data.items.map(({ productId, quantity }) => ({ productId, quantity })), note);
}

export const normalizeOrderCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 4);
export const isValidOrderCode = (value) => /^\d{4}$/.test(String(value ?? ''));

export const normalizeTableLabel = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export function isValidTableLabel(value) {
  const length = Array.from(normalizeTableLabel(value)).length;
  return length >= 1 && length <= CART_LIMITS.tableMaxLength;
}

export function resolveTableLabel({ pickup, table }) {
  return pickup ? PICKUP_TABLE_LABEL : normalizeTableLabel(table);
}

export function formatCents(cents, lang = 'es') {
  return new Intl.NumberFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format((Number(cents) || 0) / 100);
}

// Estados de create_order → clave de texto de la interfaz.
export const ORDER_ERROR_KEYS = Object.freeze({
  invalid_code: 'orderErrorCode',
  code_rate_limited: 'orderErrorRateLimited',
  ordering_closed: 'orderErrorClosed',
  ordering_unavailable: 'orderErrorClosed',
  not_in_pilot: 'orderErrorNotInPilot',
  guest_ordering_disabled: 'orderErrorGuestDisabled',
  invalid_guest_name: 'orderErrorGuestName',
  product_unavailable: 'orderErrorProductUnavailable',
  active_order_limit: 'orderErrorActiveLimit',
  invalid_table_label: 'orderErrorTable',
  invalid_note: 'orderErrorNote',
  invalid_items: 'orderErrorItems',
  invalid_quantity: 'orderErrorItems',
  duplicate_product: 'orderErrorItems',
  not_authenticated: 'orderErrorSession',
  network_error: 'orderErrorNetwork'
});

export const orderErrorKey = (status) => ORDER_ERROR_KEYS[status] || 'orderErrorGeneric';

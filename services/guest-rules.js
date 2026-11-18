// Reglas puras de «Pedir sin cuenta» (invitados con sesión anónima de
// Supabase). Sin DOM ni red: se prueban en tests/guest-ordering.test.js.

export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 30;

// Un invitado sólo usa la carta, el carrito y sus pedidos (y las páginas legales).
export const GUEST_SCREENS = Object.freeze(['menu', 'cart', 'orders', 'orderTracking', 'legal']);

export const isGuestUser = (user) => user?.is_anonymous === true;

// «Pedir sin cuenta» sólo se ofrece si el local lo permite (interruptor del
// Panel y pedidos abiertos) Y Supabase Auth admite inicios anónimos. Cualquier
// dato que falte (cargando, error de red) cuenta como «no».
/** @param {{ statusAvailable?: unknown, anonymousEnabled?: unknown }} [options] */
export function guestOrderingAvailable({ statusAvailable, anonymousEnabled } = {}) {
  return statusAvailable === true && anonymousEnabled === true;
}

export const guestScreen = (screen) => (GUEST_SCREENS.includes(screen) ? screen : 'menu');

// Mismas reglas que create_order: espacios normalizados, 2–30 caracteres
// (por puntos de código) y sin caracteres de control.
export function normalizeGuestName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function validateGuestName(value) {
  const name = normalizeGuestName(value);
  const length = Array.from(name).length;
  if (!name || length < GUEST_NAME_MIN || length > GUEST_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    return Object.freeze({ ok: false, value: name });
  }
  return Object.freeze({ ok: true, value: name });
}

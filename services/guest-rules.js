// Reglas puras de «Pedir sin cuenta» (invitados con sesión anónima de
// Supabase). Sin DOM ni red: se prueban en tests/guest-ordering.test.js.

export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 30;

// Un invitado sólo usa la carta, el carrito y sus pedidos (más crear cuenta).
export const GUEST_SCREENS = Object.freeze(['menu', 'cart', 'orders', 'orderTracking', 'guestSignup', 'guestPassword']);

export const isGuestUser = (user) => user?.is_anonymous === true;

export const guestScreen = (screen) => (GUEST_SCREENS.includes(screen) ? screen : 'menu');

// Mismas reglas que create_order: espacios normalizados, 2–30 caracteres
// (por puntos de código) y sin caracteres de control.
export function normalizeGuestName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function validateGuestName(value) {
  const name = normalizeGuestName(value);
  const length = Array.from(name).length;
  // eslint-disable-next-line no-control-regex
  if (!name || length < GUEST_NAME_MIN || length > GUEST_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    return Object.freeze({ ok: false, value: name });
  }
  return Object.freeze({ ok: true, value: name });
}

// Datos que se guardan al convertir la cuenta (mismos campos que el registro,
// para que los triggers creen el perfil y el consentimiento).
export function guestConversionMetadata({ firstName, lastName, consent }) {
  const cleanFirstName = normalizeGuestName(firstName).slice(0, 28);
  const cleanLastName = normalizeGuestName(lastName).slice(0, 42);
  const displayName = `${cleanFirstName} ${cleanLastName}`.trim().slice(0, 80);
  return Object.freeze({
    display_name: displayName,
    first_name: cleanFirstName,
    last_name: cleanLastName,
    full_name: displayName,
    privacy_consent: consent?.accepted === true,
    privacy_policy_version: String(consent?.version || '')
  });
}

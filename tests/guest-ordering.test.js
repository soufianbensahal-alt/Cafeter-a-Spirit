import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUEST_COPY } from '../client/guest-copy.js';
import { ORDER_COPY } from '../client/order-copy.js';
import { CLIENT_ICONS } from '../client/icons.js';
import {
  renderGuestEntry,
  renderGuestExitContent,
  renderGuestMenuBanner,
  renderGuestTrackingReminder
} from '../client/guest-view.js';
import { SIGNUP_PROMO_COPY } from '../client/signup-promo.js';
import { renderCheckoutContent } from '../client/order-view.js';
import { renderMenuScreen } from '../client/menu-view.js';
import { getMenuCategories } from '../data/menu.js';
import { addToCart, emptyCart, orderErrorKey } from '../services/cart-rules.js';
import {
  GUEST_SCREENS,
  guestScreen,
  isGuestUser,
  normalizeGuestName,
  validateGuestName
} from '../services/guest-rules.js';
import { readEmailConfirmationRoute } from '../services/email-confirmation-route.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const dictionary = { ...ORDER_COPY.es, ...GUEST_COPY.es, ...SIGNUP_PROMO_COPY.es, firstName: 'Nombre', lastName: 'Apellidos', email: 'Correo electrónico', privacy: 'Acepto la política de privacidad', newPassword: 'Nueva contraseña', confirmPassword: 'Confirmar contraseña', passwordLength: 'Usa al menos 12 caracteres.' };
const t = (key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[key] || key);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('nombre para el pedido: espacios normalizados, 2–30 caracteres y sin control', () => {
  assert.equal(normalizeGuestName('  Laura   Gómez '), 'Laura Gómez');
  assert.deepEqual(validateGuestName('  Laura   Gómez '), { ok: true, value: 'Laura Gómez' });
  assert.equal(validateGuestName('L').ok, false);
  assert.equal(validateGuestName('  ').ok, false);
  assert.equal(validateGuestName(null).ok, false);
  assert.equal(validateGuestName('a'.repeat(30)).ok, true);
  assert.equal(validateGuestName('a'.repeat(31)).ok, false);
  // Cuenta caracteres, no unidades UTF-16: 30 emojis caben.
  assert.equal(validateGuestName('☕'.repeat(15)).ok, true);
  assert.equal(validateGuestName('Lau\u0007ra').ok, false);
});

test('el invitado sólo navega por carta, carrito y pedidos (sin pantallas de alta)', () => {
  assert.deepEqual([...GUEST_SCREENS], ['menu', 'cart', 'orders', 'orderTracking', 'legal']);
  for (const screen of ['menu', 'cart', 'orders', 'orderTracking']) assert.equal(guestScreen(screen), screen);
  for (const screen of ['home', 'rewards', 'history', 'profile', 'login', 'guestSignup', 'guestPassword']) assert.equal(guestScreen(screen), 'menu', screen);
});

test('isGuestUser se basa en is_anonymous de Supabase', () => {
  assert.equal(isGuestUser({ is_anonymous: true }), true);
  assert.equal(isGuestUser({ is_anonymous: false }), false);
  assert.equal(isGuestUser({}), false);
  assert.equal(isGuestUser(null), false);
});

test('textos en castellano y catalán con las mismas claves, sin pisar los existentes', async () => {
  assert.deepEqual(Object.keys(GUEST_COPY.ca).sort(), Object.keys(GUEST_COPY.es).sort());
  for (const lang of ['es', 'ca']) {
    for (const [key, value] of Object.entries(GUEST_COPY[lang])) assert.ok(value.trim(), `${lang}.${key}`);
  }
  assert.equal(GUEST_COPY.es.guestStart, 'Pedir sin cuenta');
  assert.equal(GUEST_COPY.es.guestName, 'Nombre para el pedido');
  // Textos aprobados: recordatorio del seguimiento y hoja de salida.
  assert.equal(GUEST_COPY.es.guestTrackingReminder, '¿Quieres sumar sellos? La próxima vez, crea tu cuenta desde el inicio de la app.');
  assert.equal(GUEST_COPY.ca.guestTrackingReminder, 'Vols sumar segells? La propera vegada, crea el teu compte des de l’inici de l’app.');
  assert.equal(GUEST_COPY.es.guestExitTitle, '¿Salir del modo invitado?');
  assert.equal(GUEST_COPY.ca.guestExitTitle, 'Vols sortir del mode convidat?');
  assert.equal(GUEST_COPY.es.guestExitStay, 'Seguir pidiendo');
  assert.equal(GUEST_COPY.ca.guestExitStay, 'Continuar demanant');
  // Sin textos de la conversión invitado → cuenta.
  for (const key of Object.keys(GUEST_COPY.es)) assert.doesNotMatch(key, /^guest(Signup|Password|CreateAccount)/, key);
  const collisions = Object.keys(GUEST_COPY.es).filter((key) => key in ORDER_COPY.es);
  assert.deepEqual(collisions, []);
  const app = await read('app.js');
  const existing = [...app.slice(app.indexOf('const copy = {'), app.indexOf('Object.assign(copy.es')).matchAll(/(\w+): '/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(GUEST_COPY.es).filter((key) => existing.includes(key)), []);
});

test('entrada del login: «Pedir sin cuenta» sólo si está disponible; «Ver la carta» siempre', () => {
  const available = renderGuestEntry({ translate: t, available: true });
  assert.match(available, /data-action="guest-start"[^>]*>Pedir sin cuenta</);
  assert.match(available, /data-action="guest-view-menu"/);
  const unavailable = renderGuestEntry({ translate: t, available: false });
  assert.doesNotMatch(unavailable, /guest-start/);
  assert.match(unavailable, /data-action="guest-view-menu"/);
  assert.match(renderGuestEntry({ translate: t, available: true, busy: true }), /data-action="guest-start" disabled>Preparando tu pedido…</);
});

test('salida del invitado: «Seguir pidiendo» primero (opción segura), sin crear cuenta', () => {
  const exit = renderGuestExitContent({ translate: t });
  assert.match(exit, /<h2 id="guest-exit-title">¿Salir del modo invitado\?<\/h2>/);
  assert.match(exit, /data-action="close-sheet" data-guest-exit-stay>Seguir pidiendo</);
  assert.ok(exit.indexOf('data-guest-exit-stay') < exit.indexOf('data-action="guest-exit-confirm"'));
  assert.doesNotMatch(exit, /guest-create-account|Crear/);
  assert.match(renderGuestMenuBanner({ translate: t }), /data-action="guest-start"/);
});

test('recordatorio del seguimiento: una línea de texto, sin botón ni enlace', () => {
  const reminder = renderGuestTrackingReminder({ translate: t });
  assert.equal(reminder, '<p class="guest-reminder" data-guest-reminder>¿Quieres sumar sellos? La próxima vez, crea tu cuenta desde el inicio de la app.</p>');
  assert.doesNotMatch(reminder, /<(a|button)\b/);
});

test('la confirmación del invitado pide «Nombre para el pedido» antes del código', () => {
  const cart = addToCart(emptyCart(), 'cafes-latte').cart;
  const products = new Map([['cafes-latte', { priceCents: 250, available: true, inCatalog: true }]]);
  const guest = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es', guest: true, draft: { guestName: 'Laura "L"' } });
  assert.match(guest, /<input id="checkout-guest-name" name="guestName" type="text" maxlength="30"[^>]*required value="Laura &quot;L&quot;" data-checkout-guest-name>/);
  assert.ok(guest.indexOf('data-checkout-guest-name') < guest.indexOf('data-checkout-code'));
  const registered = renderCheckoutContent({ cart, products, translate: t, escapeHTML, lang: 'es' });
  assert.doesNotMatch(registered, /checkout-guest-name/);
});

test('la carta acepta franja y botón de volver propios', () => {
  const html = renderMenuScreen({ categories: getMenuCategories('es'), query: '', activeCategory: 'cafes', icons: CLIENT_ICONS, translate: t, escapeHTML, brandLogo: () => '', banner: '<div data-test-banner></div>', back: { action: 'guest-exit', label: 'Salir del modo invitado' } });
  assert.match(html, /data-action="guest-exit" aria-label="Salir del modo invitado"/);
  assert.ok(html.indexOf('data-test-banner') < html.indexOf('data-menu-content'));
  const normal = renderMenuScreen({ categories: getMenuCategories('es'), query: '', activeCategory: 'cafes', icons: CLIENT_ICONS, translate: t, escapeHTML, brandLogo: () => '' });
  assert.match(normal, /data-action="close-menu"/);
});

test('/auth/confirm sólo verifica el alta normal (type=email), ya no email_change', () => {
  assert.equal(readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '?token_hash=abc&type=email' }).shouldVerify, true);
  const change = readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '?token_hash=abc&type=email_change' });
  assert.equal(change.shouldVerify, false);
  assert.equal(change.status, 'invalid');
  assert.equal(readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '?token_hash=abc&type=recovery' }).shouldVerify, false);
});

test('estados nuevos de create_order con mensaje propio', () => {
  assert.equal(orderErrorKey('guest_ordering_disabled'), 'orderErrorGuestDisabled');
  assert.equal(orderErrorKey('invalid_guest_name'), 'orderErrorGuestName');
});

test('app.js: invitado sin fidelización ni conversión en cuenta; recordatorio sólo en el seguimiento', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(state\.isGuest\) state\.screen = guestScreen\(state\.screen\);/);
  assert.match(app, /async function refreshCustomerLoyaltySafely\(options\) \{\n  if \(state\.isGuest\) return null;/);
  assert.match(app, /if \(isGuestUser\(user\)\) \{\n      applyGuestContext\(user\);/);
  assert.doesNotMatch(app, /email_change|guestSignup|guestPassword|guest-create-account|startGuestConversion|setConvertedAccountPassword|confirmGuestConversion/);
  assert.doesNotMatch(app, /variant: 'compact'/);
  // Recordatorio: sólo envuelve el seguimiento, no el carrito ni la carta.
  assert.match(app, /const orderTracking = \(\) => withGuestTrackingReminder\(renderOrderTrackingScreen\(\{/);
  assert.match(app, /const cartScreen = \(\) => renderCartScreen\(\{/);
  assert.equal((app.match(/withGuestTrackingReminder\(/g) || []).length, 1);
  // «Seguir pidiendo» recibe el foco al abrir la hoja de salida.
  assert.match(app, /'guest-exit-description'\), \{ initialFocus: '\[data-guest-exit-stay\]' \}\)/);
  assert.match(app, /guestName: guestNameInput \? guestName\.value : null/);
  const service = await read('services/guest-service.js');
  assert.match(service, /auth\.signInAnonymously\(/);
  assert.doesNotMatch(service, /updateUser|verifyOtp|email_change/);
  assert.match(service, /rpc\('get_guest_ordering_status'\)/);
  const orders = await read('services/order-service.js');
  assert.match(orders, /p_guest_name: guestName \|\| null/);
});

test('panel: interruptor «Pedidos sin cuenta» sólo para owner y manager', async () => {
  const panel = await read('business/business-orders.js');
  assert.match(panel, /switchHTML\(\{ key: 'guest-ordering', label: 'Pedidos sin cuenta', checked: settings\.guestOrderingEnabled, disabled: !canManagePilot \|\| control\.busy\.has\('guest-ordering'\) \}\)/);
  assert.match(panel, /expectOk\(await setGuestOrderingEnabled\(businessId, checked\)\);/);
  const service = await read('services/business-order-service.js');
  assert.match(service, /rpc\('set_guest_ordering_enabled'/);
  assert.match(service, /select\('ordering_enabled, pilot_only, guest_ordering_enabled'\)/);
});

test('local: anónimos activados, 50 por hora y plantilla neutra de cambio de correo', async () => {
  const config = await read('supabase/config.toml');
  assert.match(config, /^enable_anonymous_sign_ins = true$/m);
  assert.match(config, /^anonymous_users = 50$/m);
  assert.match(config, /\[auth\.email\.template\.email_change\]\nsubject = "Confirma tu nuevo correo de Spirit Coffee"\ncontent_path = "\.\/supabase\/templates\/email_change\.html"/);
  const template = await read('supabase/templates/email_change.html');
  // Enlace estándar de Supabase, sin rutas de la app ni mención a invitados.
  assert.match(template, /<a href="\{\{ \.ConfirmationURL \}\}">Confirmar el nuevo correo<\/a>/);
  assert.doesNotMatch(template, /auth\/confirm|TokenHash|invitado|tus pedidos/i);
});

test('los pedidos propios se cargan aunque no sea elegible para pedir (p. ej. con los pedidos cerrados)', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(context\) \{\n      \[products, activeOrders\] = await Promise\.all\(\[\n        context\.eligible && context\.orderingEnabled \? getOrderableProducts/);
});

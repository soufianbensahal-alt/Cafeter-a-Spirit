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
  renderGuestPasswordScreen,
  renderGuestPrompt,
  renderGuestSignupScreen
} from '../client/guest-view.js';
import { renderCheckoutContent } from '../client/order-view.js';
import { renderMenuScreen } from '../client/menu-view.js';
import { getMenuCategories } from '../data/menu.js';
import { addToCart, emptyCart, orderErrorKey } from '../services/cart-rules.js';
import {
  GUEST_SCREENS,
  guestConversionMetadata,
  guestScreen,
  isGuestUser,
  normalizeGuestName,
  validateGuestName
} from '../services/guest-rules.js';
import { readEmailConfirmationRoute } from '../services/email-confirmation-route.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const dictionary = { ...ORDER_COPY.es, ...GUEST_COPY.es, firstName: 'Nombre', lastName: 'Apellidos', email: 'Correo electrónico', privacy: 'Acepto la política de privacidad', newPassword: 'Nueva contraseña', confirmPassword: 'Confirmar contraseña', passwordLength: 'Usa al menos 12 caracteres.' };
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

test('el invitado sólo navega por carta, carrito y pedidos (y crear cuenta)', () => {
  assert.deepEqual([...GUEST_SCREENS], ['menu', 'cart', 'orders', 'orderTracking', 'guestSignup', 'guestPassword']);
  for (const screen of ['menu', 'cart', 'orders', 'orderTracking', 'guestSignup']) assert.equal(guestScreen(screen), screen);
  for (const screen of ['home', 'rewards', 'history', 'profile', 'login']) assert.equal(guestScreen(screen), 'menu', screen);
});

test('isGuestUser se basa en is_anonymous de Supabase', () => {
  assert.equal(isGuestUser({ is_anonymous: true }), true);
  assert.equal(isGuestUser({ is_anonymous: false }), false);
  assert.equal(isGuestUser({}), false);
  assert.equal(isGuestUser(null), false);
});

test('la conversión guarda los mismos metadatos que el registro (perfil y consentimiento)', () => {
  assert.deepEqual(guestConversionMetadata({ firstName: ' Laura ', lastName: ' Gómez  Puig ', consent: { accepted: true, version: '2026-08-05' } }), {
    display_name: 'Laura Gómez Puig',
    first_name: 'Laura',
    last_name: 'Gómez Puig',
    full_name: 'Laura Gómez Puig',
    privacy_consent: true,
    privacy_policy_version: '2026-08-05'
  });
  assert.equal(guestConversionMetadata({ firstName: 'Ana' }).privacy_consent, false);
});

test('textos en castellano y catalán con las mismas claves, sin pisar los existentes', async () => {
  assert.deepEqual(Object.keys(GUEST_COPY.ca).sort(), Object.keys(GUEST_COPY.es).sort());
  for (const lang of ['es', 'ca']) {
    for (const [key, value] of Object.entries(GUEST_COPY[lang])) assert.ok(value.trim(), `${lang}.${key}`);
  }
  assert.equal(GUEST_COPY.es.guestPromptTitle, 'Crea tu cuenta y consigue un café gratis con tus sellos');
  assert.equal(GUEST_COPY.es.guestStart, 'Pedir sin cuenta');
  assert.equal(GUEST_COPY.es.guestName, 'Nombre para el pedido');
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

test('captación y salida del invitado', () => {
  const prompt = renderGuestPrompt({ translate: t, id: 'guest-prompt-cart' });
  assert.match(prompt, /<aside class="guest-prompt" aria-labelledby="guest-prompt-cart-title">/);
  assert.match(prompt, /Crea tu cuenta y consigue un café gratis con tus sellos/);
  assert.match(prompt, /data-action="guest-create-account">Crear cuenta</);
  const exit = renderGuestExitContent({ translate: t });
  assert.match(exit, /id="guest-exit-title"/);
  assert.match(exit, /data-action="guest-exit-confirm"/);
  assert.match(exit, /data-action="guest-create-account"/);
  assert.match(renderGuestMenuBanner({ translate: t }), /data-action="guest-start"/);
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

test('conversión: formulario, correo enviado y contraseña', () => {
  const form = renderGuestSignupScreen({ translate: t, escapeHTML, icons: CLIENT_ICONS });
  for (const marker of ['data-form="guest-signup"', 'name="firstName"', 'name="email"', 'name="privacyConsent"', 'data-action="guest-signup-back"']) assert.ok(form.includes(marker), marker);
  const sent = renderGuestSignupScreen({ translate: t, escapeHTML, icons: CLIENT_ICONS, sentTo: 'laura@<x>.es' });
  assert.match(sent, /Te hemos enviado un enlace a laura@&lt;x&gt;\.es/);
  assert.doesNotMatch(sent, /data-form="guest-signup"/);
  const password = renderGuestPasswordScreen({ translate: t, escapeHTML, minLength: 12 });
  assert.match(password, /data-form="guest-password"/);
  assert.match(password, /minlength="12" autocomplete="new-password"/);
});

test('el enlace de conversión (type=email_change) se verifica en /auth/confirm', () => {
  const route = readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '?token_hash=abc&type=email_change' });
  assert.equal(route.shouldVerify, true);
  assert.equal(route.type, 'email_change');
  assert.equal(readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '?token_hash=abc&type=recovery' }).shouldVerify, false);
});

test('estados nuevos de create_order con mensaje propio', () => {
  assert.equal(orderErrorKey('guest_ordering_disabled'), 'orderErrorGuestDisabled');
  assert.equal(orderErrorKey('invalid_guest_name'), 'orderErrorGuestName');
});

test('app.js: invitado sin fidelización, con carta y conversión que conserva la cuenta', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(state\.isGuest\) state\.screen = guestScreen\(state\.screen\);/);
  assert.match(app, /async function refreshCustomerLoyaltySafely\(options\) \{\n  if \(state\.isGuest\) return null;/);
  assert.match(app, /if \(isGuestUser\(user\)\) \{\n      applyGuestContext\(user\);/);
  assert.match(app, /if \(emailConfirmationRoute\.type === 'email_change'\) \{/);
  assert.match(app, /guestName: guestNameInput \? guestName\.value : null/);
  const service = await read('services/guest-service.js');
  assert.match(service, /auth\.signInAnonymously\(/);
  assert.match(service, /auth\.updateUser\(\{\n\s+email: /);
  assert.match(service, /verifyOtp\(\{ token_hash: String\(tokenHash \|\| ''\)\.trim\(\), type: 'email_change' \}\)/);
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

test('local: anónimos activados, 50 por hora y plantilla de conversión', async () => {
  const config = await read('supabase/config.toml');
  assert.match(config, /^enable_anonymous_sign_ins = true$/m);
  assert.match(config, /^anonymous_users = 50$/m);
  assert.match(config, /\[auth\.email\.template\.email_change\]\nsubject = "Confirma tu correo para crear tu cuenta de Spirit Coffee"\ncontent_path = "\.\/supabase\/templates\/email_change\.html"/);
  const template = await read('supabase/templates/email_change.html');
  assert.match(template, /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email_change/);
});

test('los pedidos propios se cargan aunque no sea elegible para pedir (invitado recién convertido)', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(context\) \{\n      \[products, activeOrders\] = await Promise\.all\(\[\n        context\.eligible && context\.orderingEnabled \? getOrderableProducts/);
});

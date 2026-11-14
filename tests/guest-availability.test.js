import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guestOrderingAvailable } from '../services/guest-rules.js';
import { renderGuestEntry, renderGuestMenuBanner } from '../client/guest-view.js';
import { GUEST_COPY } from '../client/guest-copy.js';
import { LEGAL_COPY } from '../client/legal-view.js';

const t = (key) => ({ ...GUEST_COPY.es, ...LEGAL_COPY.es })[key] || key;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sólo se ofrece si el local lo permite y Auth admite anónimos', () => {
  assert.equal(guestOrderingAvailable({ statusAvailable: true, anonymousEnabled: true }), true);
  assert.equal(guestOrderingAvailable({ statusAvailable: true, anonymousEnabled: false }), false, 'interruptor encendido pero Auth sin anónimos');
  assert.equal(guestOrderingAvailable({ statusAvailable: false, anonymousEnabled: true }), false, 'Auth con anónimos pero interruptor apagado');
  assert.equal(guestOrderingAvailable({ statusAvailable: false, anonymousEnabled: false }), false);
  assert.equal(guestOrderingAvailable({ statusAvailable: true }), false, 'cargando o sin respuesta de Auth');
  assert.equal(guestOrderingAvailable({}), false);
  assert.equal(guestOrderingAvailable(), false);
  assert.equal(guestOrderingAvailable({ statusAvailable: 'true', anonymousEnabled: 1 }), false, 'sólo booleanos verdaderos');
});

test('sin modo invitado: texto alternativo y «Ver la carta», sin botón', () => {
  const html = renderGuestEntry({ translate: t, available: false });
  assert.doesNotMatch(html, /data-action="guest-start"/);
  assert.match(html, /<p>Para pedir desde la mesa, crea tu cuenta o pide en la barra\.<\/p>/);
  assert.match(html, /data-action="guest-view-menu">Ver la carta</);
  assert.doesNotMatch(html, /data-guest-error/);
  assert.ok(GUEST_COPY.ca.guestEntryUnavailable);
});

test('con modo invitado: botón y aviso de privacidad, sin el texto alternativo', () => {
  const html = renderGuestEntry({ translate: t, available: true });
  assert.match(html, /data-action="guest-start"[^>]*>Pedir sin cuenta</);
  assert.doesNotMatch(html, /crea tu cuenta o pide en la barra/);
});

test('el error del modo invitado va dentro de su tarjeta y se escapa', () => {
  const html = renderGuestEntry({ translate: t, available: false, error: 'Ahora mismo no se puede pedir sin cuenta. <b>' });
  assert.match(html, /<p class="guest-error" role="alert" data-guest-error>Ahora mismo no se puede pedir sin cuenta\. &lt;b&gt;<\/p>/);
  assert.ok(html.indexOf('data-guest-error') > html.indexOf('guest-entry-title'), 'dentro de la tarjeta');
  const banner = renderGuestMenuBanner({ translate: t, error: 'Sin conexión' });
  assert.match(banner, /guest-menu-banner--error/);
  assert.doesNotMatch(banner, /guest-start/);
});

test('el servicio consulta el interruptor y los ajustes de Auth a la vez', async () => {
  const service = await read('services/guest-service.js');
  assert.match(service, /rpc\('get_guest_ordering_status'\)/);
  assert.match(service, /`\$\{url\}\/auth\/v1\/settings`/);
  assert.match(service, /settings\?\.external\?\.anonymous_users === true/);
  assert.match(service, /Promise\.all\(\[localGuestStatus\(\), anonymousSignInsEnabled\(\)\]\)/);
  assert.match(service, /\} catch \{\n    return false;\n  \}/);
});

test('app.js: el aviso no va al formulario de login y oculta el botón si Auth no lo permite', async () => {
  const app = await read('app.js');
  const start = app.slice(app.indexOf('async function startGuestOrdering'), app.indexOf('function openGuestSignup'));
  assert.doesNotMatch(start, /state\.authError/);
  assert.match(start, /state\.guestError = error\?\.code === 'guest_disabled' \? t\('guestUnavailable'\) : t\('guestStartError'\);/);
  assert.match(start, /if \(error\?\.code === 'guest_disabled'\) state\.guestOrderingAvailable = false;/);
  assert.match(app, /guestOrderingAvailable: false,\n  guestError: '',/);
});

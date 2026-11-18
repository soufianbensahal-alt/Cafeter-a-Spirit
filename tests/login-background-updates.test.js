import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Respuestas que llegan en segundo plano mientras se escribe en el login o el
// registro: sólo sustituyen su propio bloque, nunca repintan la pantalla (eso
// borraría el correo, la contraseña o el nombre ya escritos).
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const body = (source, signature) => {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, source.indexOf('\n}\n', start));
};

test('login y carta: huecos estables para «¿Solo quieres pedir?», la franja y «Instala la app»', async () => {
  const app = await read('app.js');
  assert.match(app, /\? `<div class="slot-contents" data-guest-entry-slot>\$\{loginGuestEntry\(\)\}<\/div>`/);
  assert.match(app, /const installRow = `<div class="slot-contents" data-install-row-slot>\$\{loginInstallRow\(\)\}<\/div>`;/);
  assert.match(app, /banner = `<div class="slot-contents" data-guest-banner-slot>\$\{menuGuestBanner\(\)\}<\/div>`;/);
  const css = await read('styles.css');
  assert.match(css, /^\.slot-contents \{ display: contents; \}$/m);
});

test('disponibilidad de «Pedir sin cuenta»: sólo se sustituye su bloque, sin repintar', async () => {
  const app = await read('app.js');
  const refresh = body(app, 'async function refreshGuestAvailability');
  assert.match(refresh, /if \(repaint && state\.authStatus !== 'authenticated'\) refreshGuestBlocks\(\);/);
  assert.doesNotMatch(refresh, /render(PreservingFocus)?\(\)/);
  const blocks = body(app, 'function refreshGuestBlocks');
  assert.match(blocks, /if \(state\.screen === 'login'\) return replaceSlot\('\[data-guest-entry-slot\]', loginGuestEntry\(\)\);/);
  assert.match(blocks, /if \(state\.screen === 'menu'\) return replaceSlot\('\[data-guest-banner-slot\]', menuGuestBanner\(\)\);/);
  // Empezar como invitado (ocupado o error) tampoco repinta el login.
  const start = body(app, 'async function startGuestOrdering');
  assert.doesNotMatch(start, /renderPreservingFocus\(\)/);
  assert.equal((start.match(/refreshGuestBlocks\(\)/g) || []).length, 2);
  // El hueco conserva el foco del botón que lo tenía.
  const slot = body(app, 'function replaceSlot');
  assert.match(slot, /slot\.innerHTML = html;\n  bind\(\);/);
  assert.match(slot, /focus\(\{ preventScroll: true \}\)/);
});

test('aviso de instalación de Android: en el login sólo cambia la fila «Instala la app»', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(state\.screen === 'login'\) replaceSlot\('\[data-install-row-slot\]', loginInstallRow\(\)\);\n    else if \(state\.screen === 'profile' && !modalController\.isOpen\(\)\) renderPreservingFocus\(\);/);
});

test('sesión cerrada en segundo plano: ya sin sesión en el login no se repinta ni cambia de pestaña', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(event === 'SIGNED_OUT'\) \{\n[^\n]*\n[^\n]*\n        if \(state\.authStatus === 'unauthenticated' && !state\.userId && !state\.isGuest\n          && state\.screen === 'login' && !passwordRecoveryState\.isPending\(\)\) \{\n          void refreshGuestAvailability\(\{ repaint: true \}\);\n          return;\n        \}/);
});

test('el número de sellos sigue sustituyendo sólo la promoción', async () => {
  const app = await read('app.js');
  const load = body(app, 'async function loadPublicProgram');
  assert.doesNotMatch(load, /render(PreservingFocus)?\(\)/);
});

test('bind() se puede repetir: cada formulario se enlaza una sola vez', async () => {
  const app = await read('app.js');
  const bind = body(app, 'function bind()');
  for (const form of ['customer-auth', 'customer-forgot', 'email-confirmation-resend', 'customer-recovery', 'profile', 'password', 'delete-account']) {
    assert.match(bind, new RegExp(`bindOnce\\(document\\.querySelector\\('\\[data-form="${form}"\\]'\\)\\)`), form);
  }
  // Ningún listener sin guarda (data-bound o bindOnce).
  for (const line of bind.split('\n').filter((text) => /document\.querySelector(All)?\(/.test(text) && /addEventListener\(/.test(text))) {
    assert.ok(line.includes(':not([data-bound])') || line.includes('bindOnce('), line.trim().slice(0, 120));
  }
});

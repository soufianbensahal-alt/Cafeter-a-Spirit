import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INSTALL_DISMISS_DAYS, createInstallPrompt, renderInstallBanner, shouldOfferInstall } from '../services/install-prompt.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

function fakeWindow() {
  const target = new EventTarget();
  return Object.assign(target, { __spiritInstallPrompt: null });
}

function installEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompts = 0;
  event.prompt = async () => { event.prompts += 1; };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

test('shouldOfferInstall: solo con el evento, sin instalar y sin descartar en 30 días', () => {
  const now = 100 * DAY;
  assert.equal(INSTALL_DISMISS_DAYS, 30);
  assert.equal(shouldOfferInstall({ hasPrompt: true, installed: false, dismissedAt: null, now }), true);
  assert.equal(shouldOfferInstall({ hasPrompt: false, installed: false, dismissedAt: null, now }), false);
  assert.equal(shouldOfferInstall({ hasPrompt: true, installed: true, dismissedAt: null, now }), false);
  assert.equal(shouldOfferInstall({ hasPrompt: true, installed: false, dismissedAt: now - 29 * DAY, now }), false);
  assert.equal(shouldOfferInstall({ hasPrompt: true, installed: false, dismissedAt: now - 30 * DAY, now }), true);
});

test('el evento del navegador se guarda (aunque llegue antes) y «Instalar» abre el diálogo del sistema', async () => {
  const win = fakeWindow();
  const early = installEvent();
  win.__spiritInstallPrompt = early;
  let changes = 0;
  const prompt = createInstallPrompt({ win, storage: memoryStorage(), onChange: () => { changes += 1; } });
  assert.equal(prompt.visible(), true);
  assert.equal(await prompt.install(), 'accepted');
  assert.equal(early.prompts, 1);
  assert.equal(prompt.visible(), false);
  assert.ok(changes >= 1);
  // Un evento nuevo lo vuelve a ofrecer; appinstalled lo retira.
  const later = installEvent();
  win.dispatchEvent(later);
  assert.equal(later.defaultPrevented, true, 'se evita el aviso genérico del navegador');
  assert.equal(prompt.visible(), true);
  win.dispatchEvent(new Event('appinstalled'));
  assert.equal(prompt.visible(), false);
});

test('rechazado en el diálogo del sistema o con «Ahora no»: no vuelve en 30 días', async () => {
  let now = 50 * DAY;
  const storage = memoryStorage();
  const win = fakeWindow();
  const prompt = createInstallPrompt({ win, storage, now: () => now });
  win.dispatchEvent(installEvent('dismissed'));
  assert.equal(await prompt.install(), 'dismissed');
  win.dispatchEvent(installEvent());
  assert.equal(prompt.visible(), false);
  now += 30 * DAY;
  assert.equal(prompt.visible(), true);
  prompt.dismiss();
  assert.equal(prompt.visible(), false);
  assert.equal(storage.data.get('spirit-install-dismissed-at'), String(now));
});

test('con la app instalada no se ofrece; sin evento, «Instalar» no hace nada', async () => {
  const win = fakeWindow();
  const installed = createInstallPrompt({ win, storage: memoryStorage(), isInstalled: () => true });
  win.dispatchEvent(installEvent());
  assert.equal(installed.visible(), false);
  const empty = createInstallPrompt({ win: fakeWindow(), storage: memoryStorage() });
  assert.equal(await empty.install(), 'unavailable');
});

test('la franja: título, texto, «Instalar» y cerrar con nombre accesible', () => {
  const html = renderInstallBanner({ id: 'install-banner', title: 'Instala Spirit en tu móvil', copy: 'Ábrela desde la pantalla de inicio, como una app.', action: 'Instalar', dismissLabel: 'Ahora no' });
  assert.match(html, /<aside class="install-banner" aria-labelledby="install-banner-title" data-install-banner>/);
  assert.match(html, /data-install-action="install">Instalar</);
  assert.match(html, /data-install-action="dismiss" aria-label="Ahora no">×</);
});

test('app.js y el panel: aviso en inicio y carta (no en el login) y en la tablet', async () => {
  const [app, panel, startup] = await Promise.all([read('app.js'), read('business/business-view.js'), read('startup.js')]);
  assert.match(app, /<\/article>\$\{installBanner\(\)\}/);
  assert.match(app, /if \(!banner\) banner = installBanner\(\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function login()'), app.indexOf('function login()') + 4000), /installBanner/);
  assert.match(app, /installTitle: 'Instala Spirit en tu móvil'/);
  assert.match(app, /installTitle: 'Instal·la Spirit al mòbil'/);
  assert.match(panel, /storageKey: 'spirit-panel-install-dismissed-at'/);
  assert.match(startup, /addEventListener\('beforeinstallprompt', \(event\) => \{\n {4}event\.preventDefault\(\);\n {4}window\.__spiritInstallPrompt = event;/);
});

test('selector de día en Android: «Borrar» vuelve a Hoy y el toque no llama a showPicker', async () => {
  const orders = await read('business/business-orders.js');
  assert.match(orders, /else if \(state\.history\.date\) showToday\(\{ reason: 'cleared' \}\);/);
  assert.match(orders, /const pointerType = lastPointerType \|\| event\.pointerType;/);
  assert.match(orders, /const touch = pointerType \? pointerType !== 'mouse'/);
  assert.match(orders, /!touch && typeof dateInput\.showPicker === 'function'/);
  assert.match(orders, /if \(wakeLock === 'error'\) return \['warn', 'La pantalla puede apagarse: desactiva el ahorro de batería'\];/);
});

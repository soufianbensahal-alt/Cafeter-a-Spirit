import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  INSTALL_DISMISS_DAYS,
  INSTALL_FIRST_VISIT_KEY,
  chromeIntentUrl,
  createInstallPrompt,
  renderInstallSheet,
  shouldAutoShowInstall
} from '../services/install-prompt.js';
import { shouldCloseOnSwipe } from '../services/sheet-swipe.js';
import { INSTALL_COPY } from '../client/install-copy.js';

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

const translator = (lang) => (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), INSTALL_COPY[lang][key] ?? key);
const es = translator('es');
const ca = translator('ca');
const platform = (kind, extra = {}) => ({ kind, device: 'android', browser: 'chrome', inApp: null, ...extra });

test('hoja automática: primera visita, inicio o carta, sin otro diálogo y cada 30 días como mucho', () => {
  const now = 100 * DAY;
  const base = { offer: true, firstVisit: true, screen: 'menu', modalOpen: false, lastShownAt: null, now };
  assert.equal(INSTALL_DISMISS_DAYS, 30);
  assert.equal(INSTALL_FIRST_VISIT_KEY, 'spirit-install-first-visit');
  assert.equal(shouldAutoShowInstall(base), true);
  assert.equal(shouldAutoShowInstall({ ...base, screen: 'home' }), true);
  for (const screen of ['login', 'cart', 'orderTracking', 'orders', 'profile', 'intro', 'onboarding', 'consent', 'legal']) {
    assert.equal(shouldAutoShowInstall({ ...base, screen }), false, screen);
  }
  assert.equal(shouldAutoShowInstall({ ...base, modalOpen: true }), false, 'nunca encima de otro diálogo');
  assert.equal(shouldAutoShowInstall({ ...base, offer: false }), false, 'escritorio o ya instalada');
  assert.equal(shouldAutoShowInstall({ ...base, firstVisit: false }), false, 'solo tras la primera visita');
  assert.equal(shouldAutoShowInstall({ ...base, lastShownAt: String(now - 29 * DAY) }), false);
  assert.equal(shouldAutoShowInstall({ ...base, lastShownAt: String(now - 30 * DAY) }), true);
});

test('el evento del navegador se guarda (aunque llegue antes) y «Instalar app» abre el diálogo del sistema', async () => {
  const win = fakeWindow();
  const early = installEvent();
  win.__spiritInstallPrompt = early;
  let changes = 0;
  let installedCalls = 0;
  const storage = memoryStorage();
  const prompt = createInstallPrompt({ win, storage, now: () => 7, onChange: () => { changes += 1; }, onInstalled: () => { installedCalls += 1; } });
  assert.equal(prompt.hasNativePrompt(), true);
  assert.equal(await prompt.install(), 'accepted');
  assert.equal(early.prompts, 1);
  assert.equal(prompt.hasNativePrompt(), false);
  assert.equal(storage.data.get('spirit-install-dismissed-at'), '7');
  assert.ok(changes >= 1);
  const later = installEvent();
  win.dispatchEvent(later);
  assert.equal(later.defaultPrevented, true, 'se evita el aviso genérico del navegador');
  assert.equal(prompt.hasNativePrompt(), true);
  assert.equal(prompt.installed(), false);
  win.dispatchEvent(new Event('appinstalled'));
  assert.equal(prompt.installed(), true);
  assert.equal(prompt.hasNativePrompt(), false);
  assert.equal(installedCalls, 1);
});

test('markShown guarda la fecha; sin evento, «Instalar app» no hace nada', async () => {
  const storage = memoryStorage();
  const prompt = createInstallPrompt({ win: fakeWindow(), storage, now: () => 42 });
  assert.equal(prompt.lastShownAt(), null);
  prompt.markShown();
  assert.equal(prompt.lastShownAt(), '42');
  assert.equal(await prompt.install(), 'unavailable');
  assert.equal(createInstallPrompt({ win: fakeWindow(), storage: memoryStorage(), isInstalled: () => true }).installed(), true);
});

test('hoja: título, beneficio, cerrar accesible y «Ahora no» solo en la automática', () => {
  const html = renderInstallSheet({ platform: platform('android-native'), translate: es, auto: true });
  assert.match(html, /<h2 id="install-sheet-title">Instala Spirit en tu móvil<\/h2>/);
  assert.match(html, /id="install-sheet-copy" class="install-sheet__benefit">Abre la carta y pide en un toque, sin buscar la web\.</);
  assert.match(html, /data-install-action="close" aria-label="Cerrar">×</);
  assert.match(html, /data-install-action="native" data-install-focus>Instalar app</);
  assert.match(html, /data-install-action="later">Ahora no</);
  assert.match(html, /data-sheet-drag/);
  assert.doesNotMatch(renderInstallSheet({ platform: platform('android-native'), translate: es }), /data-install-action="later"/);
  assert.match(renderInstallSheet({ platform: platform('android-native'), translate: ca }), /Instal·la Spirit al mòbil[\s\S]*Instal·lar l’app/);
});

test('hoja: pasos por plataforma', () => {
  const menu = renderInstallSheet({ platform: platform('android-menu', { browser: 'xiaomi' }), translate: es });
  assert.match(menu, /Abre el menú ⋮ y elige «Instalar app» o «Añadir a pantalla de inicio»\./);
  assert.doesNotMatch(menu, /data-install-action="native"/);

  const iphone = renderInstallSheet({ platform: platform('ios', { device: 'iphone', browser: 'safari' }), translate: es });
  assert.match(iphone, /<ol class="install-sheet__steps">/);
  assert.equal((iphone.match(/<li>/g) || []).length, 4);
  assert.match(iphone, /Toca Compartir <svg class="install-sheet__share"/);
  assert.match(iphone, /«Añadir a pantalla de inicio»[\s\S]*«Abrir como app web»[\s\S]*Toca «Añadir»/);
  assert.match(iphone, /En Safari, Compartir está abajo o en el menú ···/);
  const ipad = renderInstallSheet({ platform: platform('ios', { device: 'ipad', browser: 'safari' }), translate: ca });
  assert.match(ipad, /Compartir és a dalt, al costat de la barra d’adreces\./);
  assert.match(ipad, /Tria «Afegeix a la pantalla d’inici»/);

  const old = renderInstallSheet({ platform: platform('ios-safari-only', { device: 'iphone', browser: 'chrome' }), translate: es });
  assert.match(old, /Desde este navegador no se puede instalar\. Abre esta página en Safari\./);
  assert.match(old, /data-install-action="copy" data-install-focus>Copiar enlace</);
});

test('hoja: navegadores internos (copiar enlace; Chrome solo en Android)', () => {
  const androidInsta = renderInstallSheet({ platform: platform('in-app', { inApp: 'Instagram' }), translate: es, url: 'https://spirit.example/' });
  assert.match(androidInsta, /Desde Instagram no se puede instalar\.<\/strong> Abre esta página en Chrome: toca ··· y elige «Abrir en el navegador»\./);
  assert.match(androidInsta, /href="intent:\/\/spirit\.example\/#Intent;scheme=https;package=com\.android\.chrome;S\.browser_fallback_url=https%3A%2F%2Fspirit\.example%2F;end"/);
  assert.match(androidInsta, />Abrir en Chrome</);
  assert.match(androidInsta, /data-install-action="copy">Copiar enlace</);
  const iosTikTok = renderInstallSheet({ platform: platform('in-app', { device: 'iphone', inApp: 'TikTok' }), translate: es, url: 'https://spirit.example/' });
  assert.match(iosTikTok, /Abre esta página en Safari/);
  assert.doesNotMatch(iosTikTok, /intent:/);
  assert.match(renderInstallSheet({ platform: platform('in-app', { inApp: 'Instagram' }), translate: ca, url: 'https://a.b/' }), /Des d’Instagram no es pot instal·lar\./);
  assert.match(renderInstallSheet({ platform: platform('in-app', { inApp: 'TikTok' }), translate: ca, url: 'https://a.b/' }), /Des de TikTok no es pot instal·lar\./);
  assert.equal(chromeIntentUrl('javascript:alert(1)'), '');
  assert.equal(chromeIntentUrl('no es url'), '');
});

test('deslizar para cerrar: 80 px o un gesto rápido', () => {
  assert.equal(shouldCloseOnSwipe({ deltaY: 80, elapsedMs: 900 }), true);
  assert.equal(shouldCloseOnSwipe({ deltaY: 60, elapsedMs: 900 }), false);
  assert.equal(shouldCloseOnSwipe({ deltaY: 40, elapsedMs: 50 }), true);
  assert.equal(shouldCloseOnSwipe({ deltaY: 20, elapsedMs: 10 }), false);
  assert.equal(shouldCloseOnSwipe({ deltaY: -120, elapsedMs: 50 }), false);
});

test('los textos existen en castellano y catalán con las mismas claves', () => {
  assert.deepEqual(Object.keys(INSTALL_COPY.ca).sort(), Object.keys(INSTALL_COPY.es).sort());
  assert.equal(INSTALL_COPY.es.installDone, '¡Listo! Ya tienes Spirit en tu pantalla de inicio');
  assert.equal(INSTALL_COPY.ca.installDone, 'Fet! Ja tens Spirit a la pantalla d’inici');
});

test('app.js y el panel: hoja (no franja), fila del login, perfil y botón del Panel', async () => {
  const [app, panel, startup] = await Promise.all([read('app.js'), read('business/business-view.js'), read('startup.js')]);
  assert.doesNotMatch(app, /installBanner|renderInstallBanner/);
  assert.match(app, /\$\{form\}\$\{signupPromo\}\$\{installRow\}\$\{guestEntry\}/);
  assert.match(app, /const installRow = `<div class="slot-contents" data-install-row-slot>\$\{loginInstallRow\(\)\}<\/div>`;/);
  assert.match(app, /data-action="open-install" data-install-access/);
  assert.match(app, /if \(installPrompt\) scheduleInstallAutoShow\(view\);/);
  assert.match(app, /showToast\(t\('installDone'\)\)/);
  assert.match(panel, /data-business-action="install-panel">Instalar en este dispositivo</);
  assert.doesNotMatch(panel, /renderInstallBanner/);
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

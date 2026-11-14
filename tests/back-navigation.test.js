import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EXIT_HINT_MS,
  createBackNavigation,
  createExitHint,
  customerScreenDepth,
  isInstalledApp,
  isCustomerTab,
  panelDepth
} from '../services/back-navigation.js';
import { checkoutViewportLayout, createViewportBaseline } from '../services/checkout-viewport.js';
import { colorSchemeFor } from '../services/theme-preference.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Historial de navegador simulado: go/back son asíncronos y disparan popstate.
function fakeWindow(path = '/') {
  const listeners = new Set();
  const entries = [{ state: null, url: path }];
  let index = 0;
  const queue = [];
  const win = {
    location: { pathname: path, search: '', hash: '' },
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state, _title, url) {
        entries.splice(index + 1);
        entries.push({ state, url });
        index += 1;
        win.location.pathname = url;
      },
      replaceState(state, _title, url) {
        entries[index] = { state, url };
        win.location.pathname = url;
      },
      go(delta) { queue.push(delta); },
      back() { queue.push(-1); }
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.add(fn); },
    // Ejecuta los saltos pendientes (como el navegador, después del código).
    flush() {
      while (queue.length) {
        const delta = queue.shift();
        const next = Math.max(0, Math.min(entries.length - 1, index + delta));
        if (next === index) { win.exited = delta < 0; continue; }
        index = next;
        win.location.pathname = entries[index].url;
        for (const fn of listeners) fn({ state: entries[index].state });
      }
    },
    // Botón atrás del sistema.
    pressBack() { queue.push(-1); win.flush(); },
    entries,
    index: () => index
  };
  return win;
}

function harness({ depth = 0, installed = true } = {}) {
  const win = fakeWindow('/');
  const app = { depth, backs: 0, exits: 0, onBack: null };
  const nav = createBackNavigation({
    win,
    guardRoot: () => installed,
    getDepth: () => app.depth,
    onBack: (info) => {
      app.backs += 1;
      return app.onBack ? app.onBack(info) : undefined;
    }
  });
  return { win, app, nav };
}

test('pestaña normal (no instalada): sin guarda; atrás desde la raíz sale como siempre', () => {
  const { win, app, nav } = harness({ installed: false });
  nav.start();
  assert.equal(win.entries.length, 1);
  assert.equal(nav.depth(), 0);
  // Las pantallas hijas y los diálogos sí tienen su entrada.
  app.depth = 1;
  nav.sync();
  app.onBack = () => { app.depth = 0; };
  win.pressBack();
  assert.equal(app.backs, 1);
  assert.equal(win.entries.length, 2);
  assert.equal(nav.depth(), 0);
  // En la raíz, atrás ya no pasa por la app.
  win.pressBack();
  assert.equal(app.backs, 1);
  assert.equal(win.exited, true);
});

test('isInstalledApp: display-mode standalone o navigator.standalone de iPhone', () => {
  const media = (modes) => (query) => ({ matches: modes.some((mode) => query === `(display-mode: ${mode})`) });
  assert.equal(isInstalledApp({ matchMedia: media(['standalone']), navigator: {} }), true);
  assert.equal(isInstalledApp({ matchMedia: media(['browser']), navigator: {} }), false);
  assert.equal(isInstalledApp({ matchMedia: media([]), navigator: { standalone: true } }), true);
  assert.equal(isInstalledApp({}), false);
});

test('arranque (instalada): entrada base y una guarda encima', () => {
  const { win, nav } = harness();
  nav.start();
  assert.equal(win.entries.length, 2);
  assert.deepEqual(win.entries.map((entry) => entry.state.spiritDepth), [0, 1]);
  assert.equal(nav.depth(), 1);
});

test('abrir un diálogo o una pantalla hija añade una entrada; cerrarlo desde la app la consume', () => {
  const { win, app, nav } = harness();
  nav.start();
  app.depth = 1;
  nav.sync();
  assert.equal(win.entries.length, 3);
  app.depth = 2;
  nav.sync();
  assert.equal(win.index(), 3);
  // Cierre con la × de la app: vuelve atrás sin avisar a onBack.
  app.depth = 1;
  nav.sync();
  win.flush();
  assert.equal(win.index(), 2);
  assert.equal(app.backs, 0);
  assert.equal(nav.depth(), 2);
});

test('atrás del sistema: deshace un nivel y deja el historial alineado', () => {
  const { win, app, nav } = harness();
  nav.start();
  app.depth = 2;
  nav.sync();
  app.onBack = () => { app.depth -= 1; };
  win.pressBack();
  assert.equal(app.backs, 1);
  assert.equal(app.depth, 1);
  assert.equal(nav.depth(), 2);
  win.pressBack();
  assert.equal(app.depth, 0);
  assert.equal(nav.depth(), 1);
});

test('si el diálogo no se puede cerrar, se repone su entrada', () => {
  const { win, app, nav } = harness();
  nav.start();
  app.depth = 1;
  nav.sync();
  app.onBack = () => {};
  win.pressBack();
  assert.equal(nav.depth(), 2);
  assert.equal(win.index(), 2);
});

test('raíz: la primera pulsación avisa y repone la guarda; la segunda deja salir', () => {
  const { win, app, nav } = harness();
  let now = 1000;
  const hint = createExitHint({ now: () => now });
  const warnings = [];
  app.onBack = () => {
    if (!hint.shouldWarn()) return 'exit';
    warnings.push(now);
    return undefined;
  };
  nav.start();
  win.pressBack();
  assert.equal(warnings.length, 1);
  assert.equal(nav.depth(), 1, 'la guarda vuelve a estar');
  now += 800;
  win.pressBack();
  assert.equal(warnings.length, 1);
  assert.equal(win.exited, true, 'intenta salir de la PWA');
});

test('aviso de salida: vuelve a avisar pasado el plazo', () => {
  let now = 0;
  const hint = createExitHint({ now: () => now });
  assert.equal(hint.shouldWarn(), true);
  now += EXIT_HINT_MS - 1;
  assert.equal(hint.shouldWarn(), false);
  now += EXIT_HINT_MS + 1;
  assert.equal(hint.shouldWarn(), true);
});

test('al volver por su cuenta, la app conserva su URL aunque la entrada de abajo tuviera otra', () => {
  const { win, app, nav } = harness();
  nav.start();
  app.depth = 1;
  nav.sync();
  nav.replaceUrl('/privacidad');
  // «Volver» de la página legal: la app pone «/» y baja un nivel.
  nav.replaceUrl('/');
  app.depth = 0;
  nav.sync();
  win.flush();
  assert.equal(win.location.pathname, '/');
  assert.equal(win.entries[win.index()].state.spiritDepth, 1);
});

test('replaceUrl conserva la profundidad de la entrada', () => {
  const { win, app, nav } = harness();
  nav.start();
  app.depth = 1;
  nav.sync();
  nav.replaceUrl('/privacidad');
  assert.deepEqual(win.entries[win.index()], { state: { spiritDepth: 2 }, url: '/privacidad' });
});

test('profundidad de las pantallas del cliente coincide con su botón «volver»', () => {
  const ctx = { isGuest: false };
  assert.equal(customerScreenDepth('home', ctx), 0);
  assert.equal(customerScreenDepth('login', ctx), 0);
  assert.equal(customerScreenDepth('menu', ctx), 1);
  assert.equal(customerScreenDepth('cart', ctx), 2);
  for (const tab of ['rewards', 'history', 'profile']) {
    assert.equal(customerScreenDepth(tab, ctx), 1);
    assert.equal(isCustomerTab(tab), true);
  }
  assert.equal(customerScreenDepth('orders', { ...ctx, ordersBackTarget: 'home' }), 1);
  assert.equal(customerScreenDepth('orders', { ...ctx, ordersBackTarget: 'menu' }), 2);
  assert.equal(customerScreenDepth('orderTracking', { ...ctx, orderBackTarget: 'menu' }), 2);
  assert.equal(customerScreenDepth('orderTracking', { ...ctx, orderBackTarget: 'orders', ordersBackTarget: 'menu' }), 3);
  assert.equal(customerScreenDepth('legal', { ...ctx, legalReturn: { screen: 'cart' } }), 3);
  assert.equal(customerScreenDepth('legal', { ...ctx, legalReturn: null }), 1);
  // Invitado: la carta es su raíz.
  const guest = { isGuest: true };
  assert.equal(customerScreenDepth('menu', guest), 0);
  assert.equal(customerScreenDepth('cart', guest), 1);
  assert.equal(customerScreenDepth('guestSignup', guest), 1);
});

test('profundidad del panel: Pedidos es la raíz', () => {
  assert.equal(panelDepth({ view: 'home', tab: 'orders' }), 0);
  assert.equal(panelDepth({ view: 'home', tab: 'orders', historyOpen: true }), 1);
  assert.equal(panelDepth({ view: 'home', tab: 'loyalty' }), 1);
  assert.equal(panelDepth({ view: 'scanner', tab: 'loyalty' }), 2);
  assert.equal(panelDepth({ view: 'preview', tab: 'orders' }), 1);
  assert.equal(panelDepth({ view: 'signedOut', tab: 'loyalty' }), 0);
  assert.equal(panelDepth({ view: 'mfaChallenge', tab: 'control' }), 0);
});

test('cliente y panel usan la navegación atrás; los botones «volver» están marcados', async () => {
  const [app, panel, orders, menuView, orderView, legalView, guestView] = await Promise.all([
    read('app.js'), read('business/business-view.js'), read('business/business-orders.js'),
    read('client/menu-view.js'), read('client/order-view.js'), read('client/legal-view.js'), read('client/guest-view.js')
  ]);
  assert.doesNotMatch(app, /window\.history\.(pushState|replaceState)\(\{\}/);
  assert.doesNotMatch(app, /addEventListener\('popstate'/);
  assert.match(app, /backNavigation\.start\(\);/);
  assert.match(app, /onOpen: \(\) => backNavigation\.sync\(\)/);
  assert.match(app, /modalController\.close\(\{ reason: 'back' \}\)/);
  assert.match(app, /showToast\(t\('backExitHint'\)\)/);
  assert.match(app, /guardRoot: \(\) => isInstalledApp\(\)/);
  assert.match(panel, /guardRoot: \(\) => isInstalledApp\(\)/);
  // Atrás no cierra la confirmación mientras se envía el pedido, ni el rechazo.
  assert.match(app, /&& !\(state\.checkoutSubmitting && backdrop\.querySelector\('\[data-form="checkout"\]'\)\)/);
  assert.match(orders, /canClose: \(\{ backdrop \}\) => !backdrop\.querySelector\('\[data-orders-form="reject"\]\[data-submitting\]'\)/);
  assert.match(panel, /backNavigation\.start\(\);\n  restoreAccess\(\);/);
  assert.match(panel, /onNavigationChange: \(\) => backNavigation\.sync\(\)/);
  assert.match(panel, /showBackHint\('Pulsa atrás otra vez para salir'\)/);
  assert.match(orders, /closeModal: \(\) => modal\.close\(\{ reason: 'back' \}\)/);
  for (const view of [menuView, orderView, legalView, guestView]) assert.match(view, /data-screen-back/);
});

test('teclado de Android: se detecta frente al alto de referencia aunque el layout encoja', () => {
  const baseline = createViewportBaseline();
  assert.equal(baseline.update({ width: 360, height: 740 }), 740);
  // resizes-content: layout y visualViewport bajan juntos a 400.
  const reference = baseline.update({ width: 360, height: 400 });
  assert.equal(reference, 740);
  const layout = checkoutViewportLayout({ layoutHeight: 400, viewportHeight: 400, baselineHeight: reference });
  assert.equal(layout.keyboardOpen, true);
  assert.equal(layout.compact, true);
  assert.equal(layout.height, 400);
  // Sin referencia (comportamiento anterior) no lo veía.
  assert.equal(checkoutViewportLayout({ layoutHeight: 400, viewportHeight: 400 }).keyboardOpen, false);
  // iOS: el layout no encoge; sigue funcionando igual.
  assert.equal(checkoutViewportLayout({ layoutHeight: 844, viewportHeight: 500, baselineHeight: 844 }).keyboardOpen, true);
  // Giro de pantalla: nueva anchura, nueva referencia.
  assert.equal(baseline.update({ width: 740, height: 360 }), 360);
  assert.equal(checkoutViewportLayout({ layoutHeight: 360, viewportHeight: 360, baselineHeight: 360 }).keyboardOpen, false);
});

test('color-scheme: el navegador no fuerza el oscuro sobre la marca', async () => {
  assert.equal(colorSchemeFor('system'), 'light dark');
  assert.equal(colorSchemeFor('light'), 'only light');
  assert.equal(colorSchemeFor('dark'), 'dark');
  const [html, base, styles, business, startup] = await Promise.all([
    read('index.html'), read('base.css'), read('styles.css'), read('business/business.css'), read('startup.js')
  ]);
  assert.match(html, /<meta id="color-scheme" name="color-scheme" content="light dark" \/>/);
  // «only light»: Chromium no aplica su oscuro automático sobre el tema claro.
  assert.match(base, /:root \{\n[^}]*color-scheme: only light;/);
  assert.match(styles, /html\[data-theme="dark"\] \{\n {2}color-scheme: dark;/);
  assert.match(business, /html\[data-theme="dark"\] \{ color-scheme: dark; \}/);
  assert.match(startup, /colorScheme\.content = preference === 'light' \? 'only light'/);
});

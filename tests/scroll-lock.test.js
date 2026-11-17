import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SCROLL_LOCK_CLASS,
  lockScroll,
  releaseScrollLockIfIdle,
  resetScrollLock,
  scrollLockCount,
  unlockScroll
} from '../services/scroll-lock.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Documento mínimo: clases de html/body y presencia de diálogo o bienvenida.
function fakeDocument({ dialog = false, intro = false } = {}) {
  const classes = () => {
    const set = new Set();
    return { add: (name) => set.add(name), remove: (name) => set.delete(name), contains: (name) => set.has(name) };
  };
  const doc = {
    dialog,
    intro,
    documentElement: { classList: classes() },
    body: { classList: classes() },
    querySelector(selector) {
      if (selector === '[data-sheet-backdrop]') return doc.dialog ? {} : null;
      if (selector === '.intro-screen') return doc.intro ? {} : null;
      return null;
    }
  };
  return doc;
}

test('contador: la clase solo está puesta mientras quede algún diálogo', () => {
  const doc = fakeDocument();
  resetScrollLock(doc);
  const a = Symbol('a');
  const b = Symbol('b');
  lockScroll(a, doc);
  lockScroll(b, doc);
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), true);
  unlockScroll(a, doc);
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), true, 'aún queda otro diálogo');
  unlockScroll(b, doc);
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), false);
  assert.equal(scrollLockCount(), 0);
  // Liberar dos veces no rompe nada.
  unlockScroll(b, doc);
  assert.equal(scrollLockCount(), 0);
});

test('red de seguridad: sin diálogo en el documento se libera todo', () => {
  const doc = fakeDocument({ dialog: true });
  resetScrollLock(doc);
  lockScroll(Symbol('ticket'), doc);
  assert.equal(releaseScrollLockIfIdle(doc), false, 'con el diálogo presente no toca nada');
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), true);
  // El diálogo desaparece sin pasar por close (repintado, error…).
  doc.dialog = false;
  assert.equal(releaseScrollLockIfIdle(doc), true);
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), false);
  assert.equal(scrollLockCount(), 0);
  // Clase huérfana puesta por otra vía: también se quita.
  doc.documentElement.classList.add(SCROLL_LOCK_CLASS);
  assert.equal(releaseScrollLockIfIdle(doc), true);
  assert.equal(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS), false);
});

test('splash-active no se queda puesta sin la pantalla de bienvenida', () => {
  const doc = fakeDocument({ intro: true });
  doc.documentElement.classList.add('splash-active');
  doc.body.classList.add('splash-active');
  assert.equal(releaseScrollLockIfIdle(doc), false);
  assert.equal(doc.documentElement.classList.contains('splash-active'), true);
  doc.intro = false;
  assert.equal(releaseScrollLockIfIdle(doc), true);
  assert.equal(doc.documentElement.classList.contains('splash-active'), false);
  assert.equal(doc.body.classList.contains('splash-active'), false);
});

test('una sola fuente de verdad: solo scroll-lock toca html.modal-open', async () => {
  const [modal, app, panel, orders, view, base] = await Promise.all([
    read('services/accessible-modal.js'), read('app.js'), read('business/business-view.js'),
    read('business/business-orders.js'), read('business/business-view.js'), read('base.css')
  ]);
  for (const source of [modal, app, panel, orders]) assert.doesNotMatch(source, /classList\.(add|remove|toggle)\('modal-open'/);
  assert.match(modal, /lockScroll\(lockOwner\);/);
  assert.match(modal, /unlockScroll\(lockOwner\);/);
  assert.match(modal, /const verify = \(\) => \{/);
  // Red de seguridad en cada render, al pulsar atrás, al volver de la caché y ante errores.
  assert.match(app, /modalController\.verify\(\);\n {2}if \(returningToMenu\)/);
  assert.match(app, /addEventListener\('error', \(\) => modalController\.verify\(\)\);/);
  assert.match(app, /addEventListener\('pageshow', \(\) => modalController\.verify\(\)\);/);
  assert.match(app, /modalController\.close\(\{ force: true, restoreFocus: false, reason: 'signed-out' \}\);/);
  assert.match(view, /ordersPanel\?\.navigation\.verify\(\);\n {4}releaseScrollLockIfIdle\(document\);/);
  assert.match(base, /html\.modal-open, html\.modal-open body \{ overflow: hidden;/);
});

test('el navegador no restaura el scroll por su cuenta al volver atrás', async () => {
  const back = await read('services/back-navigation.js');
  assert.match(back, /history\.scrollRestoration = 'manual'/);
});

test('carta: posición recuperada al volver del carrito, pedidos, seguimiento o legal', async () => {
  const app = await read('app.js');
  assert.match(app, /const MENU_RETURN_FROM = Object\.freeze\(\['cart', 'orders', 'orderTracking', 'legal'\]\);/);
  assert.match(app, /if \(lastRenderedView === 'menu' && view !== 'menu'\) state\.menuScrollY = pageScrollY\(\);/);
  assert.match(app, /window\.scrollTo\(\{ top: state\.menuScrollY \|\| 0, behavior: 'auto' \}\);/);
  // Repintar no desplaza la página.
  assert.match(app, /focus\(\{ preventScroll: true \}\);/);
});

test('theme-color dinámico (cliente y /cafeteria) y barra de progreso visible en oscuro', async () => {
  const [startup, styles, business] = await Promise.all([read('startup.js'), read('styles.css'), read('business/business.css')]);
  assert.match(startup, /media\.addEventListener\('change', follow\)/);
  assert.match(startup, /document\.querySelector\('#theme-color'\)\.content = next === 'dark' \? '#171612' : '#eecf62';/);
  assert.match(styles, /html\[data-theme="dark"\] \.order-progress__step--done \.order-progress__dot,\nhtml\[data-theme="dark"\] \.order-progress__step--current \.order-progress__dot \{ background: var\(--mustard\); \}/);
  // Sin cajas con scroll propio dentro de la página en el móvil (panel).
  assert.match(business, /@media \(max-width: 699px\) \{\n {2}\.control-products \{ max-height: none; overflow: visible; \}/);
  // Desenfoque fuera en pantallas pequeñas o con transparencia reducida.
  assert.match(styles, /@media \(max-width: 699px\), \(prefers-reduced-transparency: reduce\) \{/);
});

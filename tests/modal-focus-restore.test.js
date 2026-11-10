import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessibleModalController,
  focusOrigin,
  installActivationTracker,
  lastActivatedControl,
  resolveFocusRestoreTarget
} from '../services/accessible-modal.js';

// Dobles mínimos del DOM: solo lo que usa el controlador.
function fakeElement(name, { connected = true, disabled = false } = {}) {
  const attributes = new Map();
  return {
    name,
    isConnected: connected,
    disabled,
    focused: 0,
    focus() { this.focused += 1; },
    hasAttribute: (key) => attributes.has(key),
    setAttribute: (key, value) => attributes.set(key, String(value)),
    getAttribute: (key) => attributes.get(key) ?? null,
    removeAttribute: (key) => attributes.delete(key),
    closest() { return this; }
  };
}

function fakeDocument() {
  const listeners = [];
  const body = fakeElement('body');
  const doc = {
    body,
    activeElement: body,
    documentElement: { classList: { add() {}, remove() {} } },
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
    click(target) { listeners.filter((entry) => entry.type === 'click').forEach((entry) => entry.handler({ target })); },
    listeners
  };
  body.ownerDocument = doc;
  return doc;
}

function fakeAppRoot({ h1 = fakeElement('h1'), main = fakeElement('main') } = {}) {
  return Object.assign(fakeElement('app'), {
    inert: false,
    querySelector: (selector) => (selector === 'h1' ? h1 : selector === 'main' ? main : null),
    h1,
    main
  });
}

function fakeModalRoot() {
  let backdrop = null;
  const dialog = Object.assign(fakeElement('dialog'), { querySelector: () => null });
  return {
    addEventListener() {},
    set innerHTML(_markup) {
      backdrop = { remove: () => { backdrop = null; }, querySelector: () => dialog };
    },
    querySelector: () => backdrop
  };
}

function withDocument(doc, callback) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return callback();
  } finally {
    globalThis.document = previous;
  }
}

test('un único listener de click compartido por todos los controladores', () => {
  const doc = fakeDocument();
  withDocument(doc, () => {
    for (let index = 0; index < 3; index += 1) {
      createAccessibleModalController({ appRoot: fakeAppRoot(), modalRoot: fakeModalRoot() });
    }
  });
  const clickListeners = doc.listeners.filter((entry) => entry.type === 'click');
  assert.equal(clickListeners.length, 1);
  assert.equal(clickListeners[0].capture, true, 'se registra en fase de captura');
  assert.equal(installActivationTracker(doc), false, 'instalar de nuevo no añade otro listener');
});

test('en Safari (activeElement = body) el foco vuelve al control tocado', () => {
  const doc = fakeDocument();
  const appRoot = fakeAppRoot();
  const opener = fakeElement('Datos personales');
  withDocument(doc, () => {
    const controller = createAccessibleModalController({ appRoot, modalRoot: fakeModalRoot() });
    doc.click(opener);
    assert.equal(lastActivatedControl(), opener);
    controller.open('<div></div>');
    controller.close({ reason: 'escape' });
  });
  assert.equal(opener.focused, 1);
  assert.equal(appRoot.h1.focused, 0);
});

test('si hay un elemento enfocado (teclado o Chromium) se usa ese', () => {
  const doc = fakeDocument();
  const focused = fakeElement('enfocado');
  doc.activeElement = focused;
  doc.click(fakeElement('otro'));
  installActivationTracker(doc);
  doc.click(fakeElement('otro'));
  assert.equal(focusOrigin(doc), focused);
});

test('si el control que abrió el modal ya no está en el DOM, el foco va al h1 de la pantalla', () => {
  const doc = fakeDocument();
  const appRoot = fakeAppRoot();
  const opener = fakeElement('Datos personales');
  withDocument(doc, () => {
    const controller = createAccessibleModalController({ appRoot, modalRoot: fakeModalRoot() });
    doc.click(opener);
    controller.open('<div></div>');
    opener.isConnected = false; // p. ej. la pantalla se repintó mientras el modal estaba abierto
    controller.close({ reason: 'escape' });
  });
  assert.equal(opener.focused, 0);
  assert.equal(appRoot.h1.focused, 1);
  assert.equal(appRoot.h1.getAttribute('tabindex'), '-1', 'el h1 se vuelve enfocable por programa');
});

test('si el control está deshabilitado, el foco va al h1', () => {
  const appRoot = fakeAppRoot();
  const target = resolveFocusRestoreTarget(fakeElement('botón', { disabled: true }), appRoot);
  assert.equal(target, appRoot.h1);
});

test('sin h1 se usa main, y sin ninguno de los dos no se enfoca nada', () => {
  const withoutHeading = fakeAppRoot({ h1: null });
  assert.equal(resolveFocusRestoreTarget(null, withoutHeading), withoutHeading.main);
  assert.equal(withoutHeading.main.getAttribute('tabindex'), '-1');
  assert.equal(resolveFocusRestoreTarget(null, fakeAppRoot({ h1: null, main: null })), null);
});

test('un h1 que ya tiene tabindex no se modifica', () => {
  const appRoot = fakeAppRoot();
  appRoot.h1.setAttribute('tabindex', '0');
  resolveFocusRestoreTarget(fakeElement('x', { connected: false }), appRoot);
  assert.equal(appRoot.h1.getAttribute('tabindex'), '0');
});

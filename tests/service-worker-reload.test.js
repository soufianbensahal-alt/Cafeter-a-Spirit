import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Se ejecuta el bloque real de registro del service worker de bootstrap.js
// con un navigator/window simulados (sin importar la app).
const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8');
const start = bootstrap.indexOf("if ('serviceWorker' in navigator) {");
let depth = 0;
let end = -1;
for (let index = bootstrap.indexOf('{', start); index < bootstrap.length; index += 1) {
  if (bootstrap[index] === '{') depth += 1;
  if (bootstrap[index] === '}' && --depth === 0) { end = index + 1; break; }
}
const serviceWorkerBlock = bootstrap.slice(start, end);

function load({ controller, pathname = '/login', search = '', hash = '' }) {
  const listeners = {};
  let reloads = 0;
  const context = vm.createContext({
    URLSearchParams,
    sessionStorage: { getItem: () => null },
    isBusinessRoute: false,
    passwordRecoveryPendingKey: 'spirit-password-recovery-pending',
    navigator: {
      serviceWorker: {
        controller,
        addEventListener: (type, fn) => { listeners[type] = fn; },
        register: () => Promise.resolve({ update: async () => {}, active: null })
      }
    },
    window: {
      location: { pathname, search, hash, reload: () => { reloads += 1; } },
      addEventListener: () => {}
    }
  });
  vm.runInContext(serviceWorkerBlock, context);
  return { fire: () => listeners.controllerchange(), reloads: () => reloads };
}

test('la primera toma de control del service worker no recarga (no borra el login a medio escribir)', () => {
  const page = load({ controller: null });
  page.fire();
  assert.equal(page.reloads(), 0);
});

test('una actualización del service worker sí recarga una única vez', () => {
  const page = load({ controller: { state: 'activated' } });
  page.fire();
  page.fire();
  assert.equal(page.reloads(), 1);
});

test('los retornos de Auth no se recargan ni siquiera al actualizar', () => {
  for (const pathname of ['/auth/callback', '/auth/confirm', '/email-confirmed', '/reset-password']) {
    const page = load({ controller: { state: 'activated' }, pathname });
    page.fire();
    assert.equal(page.reloads(), 0, pathname);
  }
});

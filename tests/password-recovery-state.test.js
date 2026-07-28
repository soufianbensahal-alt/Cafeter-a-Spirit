import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createPasswordRecoveryState,
  hasPasswordRecoverySignal,
  PASSWORD_RECOVERY_PENDING_KEY
} from '../services/password-recovery-state.js';

const location = (overrides = {}) => ({
  pathname: '/',
  search: '',
  hash: '',
  ...overrides
});

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('detecta la ruta dedicada de recuperación', () => {
  assert.equal(hasPasswordRecoverySignal(location({ pathname: '/reset-password' })), true);
  assert.equal(hasPasswordRecoverySignal(location({ pathname: '/reset-password/' })), true);
});

test('detecta una recuperación que Supabase haya devuelto por error a la raíz', () => {
  assert.equal(hasPasswordRecoverySignal(location({
    hash: '#access_token=secret&type=recovery'
  })), true);
});

test('conserva el bloqueo de recuperación después de que Supabase limpie el hash', () => {
  const storage = memoryStorage();
  const returnLocation = location({ hash: '#access_token=secret&type=recovery' });
  const recovery = createPasswordRecoveryState(storage, returnLocation);

  assert.equal(recovery.isPending(), true);
  assert.equal(storage.getItem(PASSWORD_RECOVERY_PENDING_KEY), 'true');

  returnLocation.hash = '';
  returnLocation.pathname = '/';

  assert.equal(recovery.isPending(), true);
});

test('solo libera la sesión cuando el flujo se completa o se abandona explícitamente', () => {
  const storage = memoryStorage();
  storage.setItem(PASSWORD_RECOVERY_PENDING_KEY, 'true');
  const recovery = createPasswordRecoveryState(storage, location());

  assert.equal(recovery.isPending(), true);
  recovery.clearPending();
  assert.equal(recovery.isPending(), false);
});

test('la aplicación bloquea SIGNED_IN mientras la recuperación siga pendiente', async () => {
  const app = await read('../app.js');

  assert.match(app, /if \(passwordRecoveryState\.isPending\(\)\) \{\s*normalizePasswordRecoveryRoute\(\);/);
  assert.match(app, /if \(event === 'PASSWORD_RECOVERY'\) \{\s*passwordRecoveryState\.markPending\(\);/);
});

test('la sesión temporal solo se libera después de actualizar la contraseña', async () => {
  const app = await read('../app.js');
  const update = app.indexOf('await completeCustomerPasswordRecovery(password)');
  const unlock = app.indexOf('passwordRecoveryState.clearPending()', update);

  assert.notEqual(update, -1);
  assert.ok(unlock > update);
});

test('la PWA no se recarga durante una recuperación devuelta a la raíz', async () => {
  const bootstrap = await read('../bootstrap.js');

  assert.match(bootstrap, /hash\.get\('type'\) === 'recovery'/);
  assert.match(bootstrap, /localStorage\.getItem\(passwordRecoveryPendingKey\) === 'true'/);
});

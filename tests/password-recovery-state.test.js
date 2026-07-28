import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createPasswordRecoveryState,
  hasPasswordRecoverySignal,
  PASSWORD_RECOVERY_PENDING_KEY,
  PASSWORD_RECOVERY_TOKEN_KEY
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

test('conserva el token hash en la sesión de la pestaña y limpia la URL con seguridad', () => {
  const storage = memoryStorage();
  const returnLocation = location({
    pathname: '/reset-password',
    search: '?token_hash=secure-hash&type=recovery'
  });
  const recovery = createPasswordRecoveryState(storage, returnLocation);

  assert.equal(recovery.isPending(), true);
  assert.equal(storage.getItem(PASSWORD_RECOVERY_PENDING_KEY), 'true');
  assert.equal(storage.getItem(PASSWORD_RECOVERY_TOKEN_KEY), 'secure-hash');
  assert.equal(recovery.getTokenHash(), 'secure-hash');

  returnLocation.search = '';

  assert.equal(recovery.isPending(), true);
  assert.equal(recovery.getTokenHash(), 'secure-hash');
});

test('solo libera la sesión cuando el flujo se completa o se abandona explícitamente', () => {
  const storage = memoryStorage();
  storage.setItem(PASSWORD_RECOVERY_PENDING_KEY, 'true');
  const recovery = createPasswordRecoveryState(storage, location());

  assert.equal(recovery.isPending(), true);
  recovery.clear();
  assert.equal(recovery.isPending(), false);
  assert.equal(recovery.getTokenHash(), '');
});

test('la aplicación rechaza el flujo implícito antiguo y usa el token al enviar', async () => {
  const app = await read('../app.js');

  assert.match(app, /if \(event === 'PASSWORD_RECOVERY'\) \{/);
  assert.match(app, /state\.authMode = 'forgot'/);
  assert.match(app, /const tokenHash=passwordRecoveryState\.getTokenHash\(\)/);
});

test('el token solo se borra después de completar la actualización', async () => {
  const app = await read('../app.js');
  const update = app.indexOf('await completeCustomerPasswordRecovery(tokenHash,password)');
  const unlock = app.indexOf('passwordRecoveryState.clear()', update);

  assert.notEqual(update, -1);
  assert.ok(unlock > update);
});

test('la PWA no se recarga durante una recuperación devuelta a la raíz', async () => {
  const bootstrap = await read('../bootstrap.js');

  assert.match(bootstrap, /hash\.get\('type'\) === 'recovery'/);
  assert.match(bootstrap, /sessionStorage\.getItem\(passwordRecoveryPendingKey\) === 'true'/);
});

test('la plantilla no consume el OTP al abrir el correo', async () => {
  const template = await read('../supabase/templates/recovery.html');

  assert.match(template, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
  assert.doesNotMatch(template, /ConfirmationURL/);
});

test('la sesión de recuperación está aislada de la sesión normal', async () => {
  const client = await read('../services/supabase-client.js');

  assert.match(client, /createIsolatedSupabaseClient/);
  assert.match(client, /autoRefreshToken: false/);
  assert.match(client, /persistSession: false/);
  assert.match(client, /detectSessionInUrl: false/);
});

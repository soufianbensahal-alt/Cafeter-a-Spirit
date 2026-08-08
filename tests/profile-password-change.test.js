import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';

const { createPasswordUpdater } = await import('../services/auth-service.js');

test('el cambio desde Perfil envía la contraseña actual en la misma operación segura', async () => {
  const calls = [];
  const updatePassword = createPasswordUpdater(() => ({
    auth: {
      updateUser: async (attributes) => {
        calls.push(attributes);
        return { data: { user: { id: 'user-1' } }, error: null };
      }
    }
  }));

  await updatePassword('SpiritNueva123!', 'SpiritActual123!');

  assert.deepEqual(calls, [{
    password: 'SpiritNueva123!',
    current_password: 'SpiritActual123!'
  }]);
});

test('la recuperación sigue pudiendo actualizar sin contraseña actual', async () => {
  const calls = [];
  const updatePassword = createPasswordUpdater(() => ({
    auth: {
      updateUser: async (attributes) => {
        calls.push(attributes);
        return { data: { user: { id: 'user-1' } }, error: null };
      }
    }
  }));

  await updatePassword('SpiritRecuperada123!');
  assert.deepEqual(calls, [{ password: 'SpiritRecuperada123!' }]);
});

test('los avisos del cambio de contraseña existen en castellano y catalán', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /currentPasswordRequired: 'Introduce tu contraseña actual/);
  assert.match(app, /currentPasswordRequired: 'Introdueix la contrasenya actual/);
  assert.match(app, /readablePasswordChangeError\(authError\)/);
  assert.doesNotMatch(app, /error\.textContent=readableAuthError\(authError\)/);
});

test('Supabase Auth tiene habilitado el aviso de contraseña modificada', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const template = await readFile(new URL('../supabase/templates/password_changed_notification.html', import.meta.url), 'utf8');
  assert.match(config, /\[auth\.email\.notification\.password_changed\]\s+enabled = true/);
  assert.match(config, /password_changed_notification\.html/);
  assert.match(template, /Tu contraseña se ha actualizado/);
  assert.match(template, /Si no has realizado este cambio/);
});

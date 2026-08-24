import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createSessionPersistenceController,
  SESSION_PERSISTENCE_KEY
} from '../services/session-persistence.js';

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const authKey = 'sb-spirit-auth-token';

test('la sesión se mantiene de forma persistente por defecto', () => {
  const local = new MemoryStorage();
  const temporary = new MemoryStorage();
  const controller = createSessionPersistenceController(local, temporary);

  controller.storage.setItem(authKey, 'session-token');

  assert.equal(controller.isEnabled(), true);
  assert.equal(local.getItem(authKey), 'session-token');
  assert.equal(temporary.getItem(authKey), null);
});

test('al desactivar se migra la sesión actual al almacenamiento temporal', () => {
  const local = new MemoryStorage();
  const temporary = new MemoryStorage();
  const controller = createSessionPersistenceController(local, temporary);
  controller.storage.setItem(authKey, 'session-token');

  assert.equal(controller.setEnabled(false), false);
  assert.equal(local.getItem(SESSION_PERSISTENCE_KEY), 'false');
  assert.equal(local.getItem(authKey), null);
  assert.equal(temporary.getItem(authKey), 'session-token');
  assert.equal(controller.storage.getItem(authKey), 'session-token');
});

test('al reactivar se restaura la persistencia sin duplicar el token', () => {
  const local = new MemoryStorage();
  const temporary = new MemoryStorage();
  const controller = createSessionPersistenceController(local, temporary);
  controller.storage.setItem(authKey, 'session-token');
  controller.setEnabled(false);

  assert.equal(controller.setEnabled(true), true);
  assert.equal(local.getItem(authKey), 'session-token');
  assert.equal(temporary.getItem(authKey), null);
});

test('cerrar sesión elimina el token de ambos almacenamientos', () => {
  const local = new MemoryStorage();
  const temporary = new MemoryStorage();
  const controller = createSessionPersistenceController(local, temporary);
  controller.storage.setItem(authKey, 'session-token');
  controller.setEnabled(false);

  controller.storage.removeItem(authKey);

  assert.equal(local.getItem(authKey), null);
  assert.equal(temporary.getItem(authKey), null);
});

test('cliente y cafetería guardan por usuario el mismo control de persistencia', async () => {
  const [customerApp, businessApp] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../business/business-view.js', import.meta.url), 'utf8')
  ]);

  assert.match(customerApp, /data-session-persistence/);
  assert.match(customerApp, /updateCustomerSessionPreference\(input\.checked\)/);
  assert.match(customerApp, /setSessionPersistence\(context\.keepSession !== false\)/);
  assert.match(businessApp, /data-business-session-persistence/);
  assert.match(businessApp, /updateEmployeeSessionPreference\(input\.checked\)/);
  assert.match(businessApp, /setSessionPersistence\(employee\.keepSession !== false\)/);
});

test('la migración guarda la preferencia con RLS ya existente y permiso de columna mínimo', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260824202334_persist_session_preference_per_user.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /add column keep_session_signed_in boolean not null default true/);
  assert.match(migration, /grant update \(keep_session_signed_in\) on table public\.profiles to authenticated/);
  assert.doesNotMatch(migration, /grant all/i);
});

test('el perfil del cliente no muestra la opción de invitar a un amigo', async () => {
  const customerApp = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const profileView = customerApp.match(/function profile\(\)[\s\S]*?function login\(\)/)?.[0] || '';

  assert.doesNotMatch(profileView, /data-action="share"/);
  assert.doesNotMatch(profileView, /inviteFriend/);
});

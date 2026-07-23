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

test('cliente y cafetería muestran el mismo control de persistencia', async () => {
  const [customerApp, businessApp] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../business/business-view.js', import.meta.url), 'utf8')
  ]);

  assert.match(customerApp, /data-session-persistence/);
  assert.match(customerApp, /setSessionPersistence\(event\.currentTarget\.checked\)/);
  assert.match(businessApp, /data-business-session-persistence/);
  assert.match(businessApp, /setSessionPersistence\(event\.currentTarget\.checked\)/);
});

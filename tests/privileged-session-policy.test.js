import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPrivilegedSessionMonitor,
  PRIVILEGED_SESSION_INACTIVITY_MS,
  PRIVILEGED_SESSION_MAX_DURATION_MS
} from '../services/privileged-session-policy.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

const target = () => ({ addEventListener() {}, removeEventListener() {} });

const monitorHarness = ({ start = 1_000, expiresIn = PRIVILEGED_SESSION_MAX_DURATION_MS } = {}) => {
  let current = start;
  let intervalCallback;
  const expired = [];
  let touches = 0;
  const monitor = createPrivilegedSessionMonitor({
    expiresAt: new Date(start + expiresIn).toISOString(),
    storage: storage(),
    eventTarget: target(),
    documentTarget: { ...target(), visibilityState: 'visible' },
    now: () => current,
    setIntervalFn: (callback) => { intervalCallback = callback; return 1; },
    clearIntervalFn() {},
    touch: async () => { touches += 1; return { status: 'active' }; },
    onExpired: async (reason) => expired.push(reason)
  });
  return {
    monitor,
    expired,
    touches: () => touches,
    advance: async (milliseconds) => { current += milliseconds; await intervalCallback(); }
  };
};

test('la sesión privilegiada tiene una duración máxima de 8 horas y 30 minutos de inactividad', () => {
  assert.equal(PRIVILEGED_SESSION_MAX_DURATION_MS, 8 * 60 * 60 * 1000);
  assert.equal(PRIVILEGED_SESSION_INACTIVITY_MS, 30 * 60 * 1000);
});

test('la inactividad cierra la sesión privilegiada', async () => {
  const harness = monitorHarness();
  await harness.advance(PRIVILEGED_SESSION_INACTIVITY_MS);
  assert.deepEqual(harness.expired, ['inactivity']);
});

test('la actividad renueva el límite de inactividad sin ampliar las 8 horas', async () => {
  const harness = monitorHarness();
  await harness.advance(20 * 60 * 1000);
  harness.monitor.markActivity();
  await harness.advance(20 * 60 * 1000);
  assert.deepEqual(harness.expired, []);
  assert.equal(harness.touches(), 2);
  await harness.advance(PRIVILEGED_SESSION_MAX_DURATION_MS);
  assert.deepEqual(harness.expired, ['max_duration']);
});

test('una respuesta de servidor caducada invalida todas las acciones posteriores', async () => {
  let current = 1_000;
  const expired = [];
  const monitor = createPrivilegedSessionMonitor({
    expiresAt: new Date(current + PRIVILEGED_SESSION_MAX_DURATION_MS).toISOString(),
    storage: storage(),
    eventTarget: target(),
    documentTarget: target(),
    now: () => current,
    setIntervalFn: () => 1,
    clearIntervalFn() {},
    touch: async () => ({ status: 'expired' }),
    onExpired: async (reason) => expired.push(reason)
  });
  current += 6 * 60 * 1000;
  await monitor.check();
  assert.deepEqual(expired, ['server_expired']);
  await monitor.check();
  assert.deepEqual(expired, ['server_expired']);
});

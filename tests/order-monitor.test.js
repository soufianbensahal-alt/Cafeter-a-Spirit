import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealtimeWithFallback,
  isActiveOrderStatus,
  orderProgressIndex,
  orderStatusChanged
} from '../services/order-monitor.js';

function fakeTimers() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timeouts.delete(id); },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    fireTimeouts() { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach(({ fn }) => fn()); },
    tickIntervals() { [...intervals.values()].forEach(({ fn }) => fn()); },
    get timeoutCount() { return timeouts.size; },
    get intervalCount() { return intervals.size; }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup({ reconcile } = {}) {
  const timers = fakeTimers();
  const calls = { reconcile: 0, unsubscribe: 0 };
  let handlers = null;
  const visibilityTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const networkTarget = new EventTarget();
  const monitor = createRealtimeWithFallback({
    timers,
    visibilityTarget,
    networkTarget,
    subscribe: (callbacks) => { handlers = callbacks; return () => { calls.unsubscribe += 1; }; },
    reconcile: reconcile || (async () => { calls.reconcile += 1; })
  });
  return { timers, calls, monitor, handlers: () => handlers, visibilityTarget, networkTarget };
}

function deferredReconcile() {
  const pending = [];
  let started = 0;
  return {
    reconcile: () => { started += 1; return new Promise((resolve) => pending.push(resolve)); },
    release: () => pending.splice(0).forEach((resolve) => resolve()),
    get started() { return started; }
  };
}

test('estados activos y progreso del pedido', () => {
  assert.equal(isActiveOrderStatus('pending'), true);
  assert.equal(isActiveOrderStatus('preparing'), true);
  assert.equal(isActiveOrderStatus('served'), false);
  assert.equal(orderProgressIndex('accepted'), 1);
  assert.equal(orderProgressIndex('rejected'), -1);
});

test('detecta cambios de estado o de updated_at', () => {
  const base = { status: 'pending', updatedAt: '1' };
  assert.equal(orderStatusChanged(base, { status: 'pending', updatedAt: '1' }), false);
  assert.equal(orderStatusChanged(base, { status: 'accepted', updatedAt: '2' }), true);
  assert.equal(orderStatusChanged(null, base), true);
  assert.equal(orderStatusChanged(base, null), false);
});

test('con Realtime suscrito no hay polling y cada evento reconcilia', async () => {
  const { timers, calls, monitor, handlers } = setup();
  monitor.start();
  handlers().onStatus('SUBSCRIBED');
  await flush();
  assert.equal(timers.timeoutCount, 0, 'se cancela el temporizador de respaldo');
  assert.equal(calls.reconcile, 1, 'consulta de recuperación al suscribirse');
  handlers().onChange({});
  await flush();
  assert.equal(calls.reconcile, 2);
  assert.equal(monitor.isPolling(), false);
});

test('SUBSCRIBED consulta aunque no llegue ningún evento (cambios durante la unión al canal)', async () => {
  const { calls, monitor, handlers } = setup();
  monitor.start();
  handlers().onStatus('JOINING');
  await flush();
  assert.equal(calls.reconcile, 0);
  handlers().onStatus('SUBSCRIBED');
  await flush();
  assert.equal(calls.reconcile, 1);
});

test('cada reconexión tras CHANNEL_ERROR vuelve a consultar y detiene el polling', async () => {
  const { timers, calls, monitor, handlers } = setup();
  monitor.start();
  handlers().onStatus('SUBSCRIBED');
  await flush();
  assert.equal(calls.reconcile, 1);
  for (let reconnection = 1; reconnection <= 2; reconnection += 1) {
    handlers().onStatus('CHANNEL_ERROR');
    await flush();
    assert.equal(monitor.isPolling(), true);
    const beforeRejoin = calls.reconcile;
    handlers().onStatus('SUBSCRIBED');
    await flush();
    assert.equal(calls.reconcile, beforeRejoin + 1, `consulta en la reconexión ${reconnection}`);
    assert.equal(monitor.isPolling(), false);
    assert.equal(timers.intervalCount, 0);
  }
});

test('una petición durante una consulta en curso se repite una sola vez al terminar', async () => {
  const deferred = deferredReconcile();
  const { monitor, handlers } = setup({ reconcile: deferred.reconcile });
  monitor.start();
  handlers().onChange({});
  assert.equal(deferred.started, 1);
  handlers().onStatus('SUBSCRIBED');
  handlers().onChange({});
  handlers().onChange({});
  assert.equal(deferred.started, 1, 'no hay consultas concurrentes');
  deferred.release();
  await flush();
  assert.equal(deferred.started, 2, 'se repite una vez para no perder el cambio');
  deferred.release();
  await flush();
  assert.equal(deferred.started, 2, 'no se repite indefinidamente');
});

test('volver a la app (visibilitychange a visible) consulta de inmediato', async () => {
  const { calls, monitor, visibilityTarget } = setup();
  monitor.start();
  visibilityTarget.visibilityState = 'hidden';
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(calls.reconcile, 0, 'al ocultarse no consulta');
  visibilityTarget.visibilityState = 'visible';
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(calls.reconcile, 1);
});

test('recuperar la conexión (online) consulta de inmediato', async () => {
  const { calls, monitor, networkTarget } = setup();
  monitor.start();
  networkTarget.dispatchEvent(new Event('online'));
  await flush();
  assert.equal(calls.reconcile, 1);
});

test('stop retira los listeners de visibilidad y red', async () => {
  const { calls, monitor, visibilityTarget, networkTarget } = setup();
  monitor.start();
  monitor.stop();
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  networkTarget.dispatchEvent(new Event('online'));
  await flush();
  assert.equal(calls.reconcile, 0);
  monitor.start();
  monitor.start();
  networkTarget.dispatchEvent(new Event('online'));
  await flush();
  assert.equal(calls.reconcile, 1, 'reiniciar no duplica listeners');
});

test('si el canal falla se activa el polling cada 5 s', async () => {
  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
    const { timers, calls, monitor, handlers } = setup();
    monitor.start();
    handlers().onStatus(status);
    await flush();
    assert.equal(monitor.isPolling(), true, status);
    assert.equal(calls.reconcile, 1, 'consulta inmediatamente al pasar a polling');
    timers.tickIntervals();
    await flush();
    assert.equal(calls.reconcile, 2);
  }
});

test('si no llega SUBSCRIBED a tiempo, el respaldo arranca el polling', async () => {
  const { timers, monitor } = setup();
  monitor.start();
  timers.fireTimeouts();
  await flush();
  assert.equal(monitor.isPolling(), true);
});

test('una suscripción tardía detiene el polling', async () => {
  const { timers, monitor, handlers } = setup();
  monitor.start();
  timers.fireTimeouts();
  await flush();
  handlers().onStatus('SUBSCRIBED');
  assert.equal(monitor.isPolling(), false);
  assert.equal(timers.intervalCount, 0);
});

test('stop cancela canal, temporizadores y eventos posteriores', async () => {
  const { timers, calls, monitor, handlers } = setup();
  monitor.start();
  handlers().onStatus('CHANNEL_ERROR');
  await flush();
  monitor.stop();
  assert.equal(calls.unsubscribe, 1);
  assert.equal(timers.intervalCount, 0);
  assert.equal(timers.timeoutCount, 0);
  const before = calls.reconcile;
  handlers().onChange({});
  await flush();
  assert.equal(calls.reconcile, before, 'no reconcilia tras detenerse');
});

test('no lanza reconciliaciones concurrentes y tolera errores', async () => {
  const timers = fakeTimers();
  let active = 0;
  let maxActive = 0;
  let release;
  const monitor = createRealtimeWithFallback({
    timers,
    subscribe: () => () => {},
    reconcile: () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve, reject) => { release = () => { active -= 1; reject(new Error('red')); }; });
    }
  });
  monitor.start();
  monitor.refresh();
  monitor.refresh();
  assert.equal(maxActive, 1);
  release();
  await flush();
  assert.equal(monitor.isRunning(), true);
});

test('si suscribirse lanza una excepción pasa directamente a polling', async () => {
  const timers = fakeTimers();
  const monitor = createRealtimeWithFallback({
    timers,
    subscribe: () => { throw new Error('sin Supabase'); },
    reconcile: async () => {}
  });
  monitor.start();
  assert.equal(monitor.isPolling(), true);
});

test('reconcile recibe el motivo: SUBSCRIBED, cambio, visibilidad, red y polling', async () => {
  const seen = [];
  const timers = fakeTimers();
  const visibilityTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const networkTarget = new EventTarget();
  let handlers = null;
  const monitor = createRealtimeWithFallback({
    timers,
    visibilityTarget,
    networkTarget,
    subscribe: (callbacks) => { handlers = callbacks; return () => {}; },
    reconcile: async ({ reasons }) => { seen.push([...reasons]); }
  });
  monitor.start();
  handlers.onStatus('SUBSCRIBED');
  await flush();
  handlers.onChange({});
  await flush();
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  networkTarget.dispatchEvent(new Event('online'));
  await flush();
  handlers.onStatus('CHANNEL_ERROR');
  await flush();
  monitor.refresh('action');
  await flush();
  assert.deepEqual(seen, [['subscribed'], ['change'], ['visible'], ['online'], ['poll'], ['action']]);
  monitor.stop();
});

test('los motivos que llegan durante una consulta se acumulan en la repetición', async () => {
  const seen = [];
  const pending = [];
  const timers = fakeTimers();
  let handlers = null;
  const monitor = createRealtimeWithFallback({
    timers,
    visibilityTarget: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    networkTarget: new EventTarget(),
    subscribe: (callbacks) => { handlers = callbacks; return () => {}; },
    reconcile: ({ reasons }) => { seen.push([...reasons].sort()); return new Promise((resolve) => pending.push(resolve)); }
  });
  monitor.start();
  handlers.onStatus('SUBSCRIBED');
  handlers.onChange({});
  monitor.refresh('online');
  pending.splice(0).forEach((resolve) => resolve());
  await flush();
  pending.splice(0).forEach((resolve) => resolve());
  await flush();
  assert.deepEqual(seen, [['subscribed'], ['change', 'online']]);
  monitor.stop();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { earnedRewardDelta, hasLoyaltyBalanceChanged, shouldStartPolling } from '../services/loyalty-monitor.js';

// Las funciones del monitor de sellos viven en app.js (que depende del DOM).
// Se extraen tal cual y se ejecutan en un contexto aislado con dobles de prueba,
// para comprobar el comportamiento real y no solo la presencia del código.
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `no se encuentra ${name} en app.js`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} sin cerrar`);
}

const monitorSource = [
  'let stampPollingTimer = 0;',
  'let stampFallbackTimer = 0;',
  'let stopStampRealtime = null;',
  'let stampReconcileBusy = false;',
  'let stampReconcilePending = false;',
  ...['stopStampMonitoring', 'reconcileConfirmedStamp', 'startStampPolling', 'startStampMonitoring'].map((name) => extractFunction(app, name))
].join('\n');

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const cardReads = [];
  const calls = { cleared: 0, toasts: [] };
  let handlers = null;
  const context = {
    state: { stampRequest: { customerCardId: 'card-1', type: 'stamp', baselineStamps: 3, baselineRewards: 0 } },
    getOwnCustomerCard: () => new Promise((resolve) => cardReads.push(resolve)),
    getOwnStampHistory: async () => [],
    hasLoyaltyBalanceChanged,
    earnedRewardDelta,
    shouldStartPolling,
    applyCustomerCard: () => {},
    clearStampRequest: () => { calls.cleared += 1; context.state.stampRequest = null; },
    render: () => {},
    showToast: (message) => calls.toasts.push(message),
    t: (key) => key,
    subscribeToOwnStampTransactions: (_cardId, callbacks) => { handlers = callbacks; return () => {}; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 2,
    clearInterval: () => {}
  };
  vm.createContext(context);
  vm.runInContext(monitorSource, context);
  return { context, calls, cardReads, handlers: () => handlers };
}

const unchanged = { currentStamps: 3, availableRewards: 0 };
const stamped = { currentStamps: 4, availableRewards: 0 };

test('un sello confirmado mientras el canal se une se detecta al llegar SUBSCRIBED', async () => {
  const { context, calls, cardReads, handlers } = setup();
  context.startStampMonitoring(context.state.stampRequest);
  // El equipo confirma antes de SUBSCRIBED: ese INSERT nunca llega por Realtime.
  handlers().onStatus('SUBSCRIBED');
  assert.equal(cardReads.length, 1, 'consulta la tarjeta al suscribirse');
  cardReads.shift()(stamped);
  await flush();
  assert.equal(calls.cleared, 1, 'cierra la solicitud');
  assert.deepEqual(calls.toasts, ['stampConfirmed']);
});

test('un evento durante una consulta en curso no se descarta: se repite al terminar', async () => {
  const { context, calls, cardReads, handlers } = setup();
  context.startStampMonitoring(context.state.stampRequest);
  handlers().onStatus('SUBSCRIBED');
  assert.equal(cardReads.length, 1);
  handlers().onInsert({});
  handlers().onInsert({});
  assert.equal(cardReads.length, 1, 'no hay consultas concurrentes');
  cardReads.shift()(unchanged); // la consulta en curso leyó antes de la confirmación
  await flush();
  assert.equal(cardReads.length, 1, 'se repite una sola vez');
  cardReads.shift()(stamped);
  await flush();
  assert.equal(calls.cleared, 1);
});

test('si la tarjeta no ha cambiado, la consulta al suscribirse no cierra la solicitud', async () => {
  const { context, calls, cardReads, handlers } = setup();
  context.startStampMonitoring(context.state.stampRequest);
  handlers().onStatus('SUBSCRIBED');
  cardReads.shift()(unchanged);
  await flush();
  assert.equal(calls.cleared, 0);
  assert.deepEqual(calls.toasts, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderAlertTracker,
  groupBusinessOrders,
  isSilentReconcile,
  newlyCancelled,
  normalizeRejectionReason,
  pendingTitle,
  REMINDER_AFTER_MS,
  REMINDER_EVERY_MS
} from '../services/order-alert-rules.js';

const minute = 60 * 1000;
const order = (id, status, createdAt, extra = {}) => ({ id, status, createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(createdAt).toISOString(), ...extra });

function clock(start = Date.parse('2026-11-11T10:00:00Z')) {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; }, at: (offset = 0) => start + offset };
}

test('motivos silenciosos: carga, reconexión, volver a la pestaña y recuperar red', () => {
  assert.equal(isSilentReconcile(['subscribed']), true);
  assert.equal(isSilentReconcile(['visible', 'online']), true);
  assert.equal(isSilentReconcile(['initial']), true);
  assert.equal(isSilentReconcile(['change']), false);
  assert.equal(isSilentReconcile(['poll']), false);
  // Un evento real que coincide con una reconexión sí suena.
  assert.equal(isSilentReconcile(['subscribed', 'change']), false);
});

test('los pedidos pending de la carga inicial no suenan pero quedan como sin atender', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  const result = tracker.reconcile([order('a', 'pending', time.at(-5 * minute)), order('b', 'served', time.at(-10 * minute))], { reasons: ['change'] });
  assert.deepEqual(result.fresh, [], 'la primera lectura siempre es silenciosa aunque llegue por un evento');
  assert.equal(result.silent, true);
  assert.deepEqual(tracker.pendingIds(), ['a']);
});

test('un pedido nuevo por Realtime o polling suena una vez', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([], { reasons: ['subscribed'] });
  const first = tracker.reconcile([order('a', 'pending', time.at())], { reasons: ['change'] });
  assert.deepEqual(first.fresh, ['a']);
  const repeated = tracker.reconcile([order('a', 'pending', time.at())], { reasons: ['change'] });
  assert.deepEqual(repeated.fresh, [], 'un evento repetido no vuelve a sonar');
  const polled = tracker.reconcile([order('a', 'pending', time.at()), order('b', 'pending', time.at())], { reasons: ['poll'] });
  assert.deepEqual(polled.fresh, ['b']);
});

test('tras reconectar, los pedidos llegados durante la caída no suenan pero se resaltan', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([], { reasons: ['subscribed'] });
  for (const reasons of [['subscribed'], ['online'], ['visible']]) {
    const id = reasons[0];
    const result = tracker.reconcile([...tracker.pendingIds().map((pendingId) => order(pendingId, 'pending', time.at())), order(id, 'pending', time.at())], { reasons });
    assert.deepEqual(result.fresh, [], `${reasons[0]} es silencioso`);
    assert.ok(tracker.pendingIds().includes(id));
  }
});

test('más de 2 minutos en pending: vuelve a sonar cada minuto hasta aceptar o rechazar', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([], { reasons: ['subscribed'] });
  const pending = [order('a', 'pending', time.at())];
  assert.deepEqual(tracker.reconcile(pending, { reasons: ['change'] }).fresh, ['a']);

  time.advance(REMINDER_AFTER_MS - 1000);
  assert.deepEqual(tracker.dueReminders(), [], 'antes de 2 minutos no hay recordatorio');
  time.advance(1000);
  assert.deepEqual(tracker.dueReminders(), ['a'], 'a los 2 minutos suena');
  time.advance(30 * 1000);
  assert.deepEqual(tracker.dueReminders(), [], 'no repite antes del minuto');
  time.advance(REMINDER_EVERY_MS - 30 * 1000);
  assert.deepEqual(tracker.dueReminders(), ['a'], 'repite cada minuto');

  tracker.reconcile([order('a', 'accepted', time.at())], { reasons: ['change'] });
  time.advance(5 * minute);
  assert.deepEqual(tracker.dueReminders(), [], 'aceptado: deja de sonar');
});

test('un pedido antiguo de la carga inicial suena al minuto, no al cargar', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([order('old', 'pending', time.at(-10 * minute))], { reasons: ['initial'] });
  assert.deepEqual(tracker.dueReminders(), []);
  time.advance(REMINDER_EVERY_MS);
  assert.deepEqual(tracker.dueReminders(), ['old']);
});

test('rechazado o cancelado por el cliente: deja de sonar', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([order('a', 'pending', time.at()), order('b', 'pending', time.at())], { reasons: ['initial'] });
  const result = tracker.reconcile([order('a', 'rejected', time.at()), order('b', 'cancelled', time.at())], { reasons: ['change'] });
  assert.deepEqual(result.left.sort(), ['a', 'b']);
  time.advance(10 * minute);
  assert.deepEqual(tracker.dueReminders(), []);
});

test('un reloj de tablet atrasado (created_at en el futuro) no adelanta ni bloquea el recordatorio', () => {
  const time = clock();
  const tracker = createOrderAlertTracker({ now: time.now });
  tracker.reconcile([], { reasons: ['subscribed'] });
  tracker.reconcile([order('a', 'pending', time.at(5 * minute))], { reasons: ['change'] });
  time.advance(REMINDER_AFTER_MS);
  assert.deepEqual(tracker.dueReminders(), ['a']);
});

test('columnas: nuevos, en preparación (aceptados y preparando), servidos y cerrados', () => {
  const t = Date.parse('2026-11-11T10:00:00Z');
  const groups = groupBusinessOrders([
    order('p2', 'pending', t + 2000),
    order('p1', 'pending', t + 1000),
    order('acc', 'accepted', t),
    order('prep', 'preparing', t + 500),
    order('s1', 'served', t, { servedAt: new Date(t + 10000).toISOString() }),
    order('s2', 'served', t, { servedAt: new Date(t + 20000).toISOString() }),
    order('c', 'cancelled', t),
    order('r', 'rejected', t)
  ]);
  assert.deepEqual(groups.fresh.map((o) => o.id), ['p1', 'p2']);
  assert.deepEqual(groups.inProgress.map((o) => o.id), ['acc', 'prep']);
  assert.deepEqual(groups.served.map((o) => o.id), ['s2', 's1']);
  assert.deepEqual(groups.closed.map((o) => o.id).sort(), ['c', 'r']);
});

test('detecta cancelaciones del cliente entre dos lecturas', () => {
  const before = new Map([['a', { id: 'a', status: 'pending' }], ['b', { id: 'b', status: 'cancelled' }]]);
  const cancelled = newlyCancelled(before, [{ id: 'a', status: 'cancelled' }, { id: 'b', status: 'cancelled' }, { id: 'c', status: 'cancelled' }]);
  assert.deepEqual(cancelled.map((o) => o.id), ['a']);
});

test('contador de pedidos sin atender en el título', () => {
  assert.equal(pendingTitle('SPIRIT · Modo cafetería', 0), 'SPIRIT · Modo cafetería');
  assert.equal(pendingTitle('SPIRIT · Modo cafetería', 3), '(3) SPIRIT · Modo cafetería');
});

test('motivo de rechazo obligatorio y breve', () => {
  assert.deepEqual(normalizeRejectionReason('   '), { ok: false, error: 'required', value: '' });
  assert.deepEqual(normalizeRejectionReason('  Cocina   cerrada '), { ok: true, value: 'Cocina cerrada' });
  assert.equal(normalizeRejectionReason('x'.repeat(201)).error, 'too_long');
});

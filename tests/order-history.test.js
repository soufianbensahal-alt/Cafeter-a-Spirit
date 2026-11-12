import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMPLOYEE_HISTORY_DAYS,
  HISTORY_IDLE_MS,
  clampServiceDate,
  createIdleTimer,
  formatServiceDate,
  historyMinDate,
  isServiceDate,
  madridToday,
  pendingBannerText,
  shiftServiceDate,
  sortByCreatedAt,
  summarizeDay
} from '../services/order-history.js';

test('madridToday usa el día de Madrid, no el del dispositivo ni UTC', () => {
  // 23:30 UTC del 11 de noviembre = 00:30 del 12 en Madrid (CET, UTC+1).
  assert.equal(madridToday(Date.parse('2026-11-11T23:30:00Z')), '2026-11-12');
  assert.equal(madridToday(Date.parse('2026-11-11T22:59:00Z')), '2026-11-11');
  // Horario de verano (CEST, UTC+2): 22:30 UTC del 24 de octubre = 00:30 del 25.
  assert.equal(madridToday(Date.parse('2026-10-24T22:30:00Z')), '2026-10-25');
  // Noche del cambio de hora de marzo.
  assert.equal(madridToday(Date.parse('2026-03-29T00:30:00Z')), '2026-03-29');
  assert.equal(madridToday(Date.parse('2026-03-28T23:30:00Z')), '2026-03-29');
});

test('shiftServiceDate suma días de calendario sin verse afectado por el cambio de hora', () => {
  assert.equal(shiftServiceDate('2026-11-12', -1), '2026-11-11');
  assert.equal(shiftServiceDate('2026-03-30', -1), '2026-03-29');
  assert.equal(shiftServiceDate('2026-10-26', -1), '2026-10-25');
  assert.equal(shiftServiceDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftServiceDate('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftServiceDate('2026-11-12', -30), '2026-10-13');
  assert.throws(() => shiftServiceDate('12/11/2026', 1), TypeError);
});

test('isServiceDate sólo acepta fechas reales YYYY-MM-DD', () => {
  assert.equal(isServiceDate('2026-11-12'), true);
  assert.equal(isServiceDate('2026-02-30'), false);
  assert.equal(isServiceDate('2026-11-12T00:00'), false);
  assert.equal(isServiceDate(''), false);
  assert.equal(isServiceDate(null), false);
});

test('límite por rol: employee 30 días, owner y manager sin límite', () => {
  assert.equal(EMPLOYEE_HISTORY_DAYS, 30);
  assert.equal(historyMinDate('employee', '2026-11-12'), '2026-10-13');
  assert.equal(historyMinDate('manager', '2026-11-12'), null);
  assert.equal(historyMinDate('owner', '2026-11-12'), null);
  assert.equal(historyMinDate(undefined, '2026-11-12'), '2026-10-13', 'un rol desconocido tiene el límite más estricto');
});

test('clampServiceDate: nunca futura ni anterior al límite; hoy o inválida = Hoy', () => {
  const bounds = { today: '2026-11-12', min: '2026-10-13' };
  assert.equal(clampServiceDate('2026-11-11', bounds), '2026-11-11');
  assert.equal(clampServiceDate('2026-11-12', bounds), '2026-11-12');
  assert.equal(clampServiceDate('2026-12-01', bounds), '2026-11-12');
  assert.equal(clampServiceDate('2026-09-01', bounds), '2026-10-13');
  assert.equal(clampServiceDate('2026-09-01', { today: '2026-11-12', min: null }), '2026-09-01');
  assert.equal(clampServiceDate('basura', bounds), '2026-11-12');
});

test('formatServiceDate en castellano, con el año sólo si no es el actual', () => {
  assert.equal(formatServiceDate('2026-11-10', { today: '2026-11-12' }), 'martes, 10 de noviembre');
  assert.equal(formatServiceDate('2025-12-31', { today: '2026-11-12' }), 'miércoles, 31 de diciembre de 2025');
  assert.equal(formatServiceDate('no', { today: '2026-11-12' }), '');
});

test('summarizeDay: el importe es sólo lo servido; cancelados y rechazados aparte', () => {
  const orders = [
    { status: 'served', totalCents: 500 },
    { status: 'served', totalCents: 250 },
    { status: 'cancelled', totalCents: 900 },
    { status: 'rejected', totalCents: 300 },
    { status: 'rejected', totalCents: 300 },
    { status: 'preparing', totalCents: 250 }
  ];
  assert.deepEqual(summarizeDay(orders), { served: 2, servedCents: 750, cancelled: 1, rejected: 2, total: 6 });
  assert.deepEqual(summarizeDay([]), { served: 0, servedCents: 0, cancelled: 0, rejected: 0, total: 0 });
  assert.ok(Object.isFrozen(summarizeDay(orders)));
});

test('sortByCreatedAt ordena por hora (y número si empatan) sin mutar', () => {
  const orders = [
    { number: 3, createdAt: '2026-11-11T11:00:00Z' },
    { number: 2, createdAt: '2026-11-11T09:00:00Z' },
    { number: 1, createdAt: '2026-11-11T09:00:00Z' }
  ];
  assert.deepEqual(sortByCreatedAt(orders).map((order) => order.number), [1, 2, 3]);
  assert.equal(orders[0].number, 3);
});

test('franja de pedidos nuevos en singular y plural', () => {
  assert.equal(pendingBannerText(1), '1 pedido nuevo sin atender');
  assert.equal(pendingBannerText(3), '3 pedidos nuevos sin atender');
});

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) { pending.delete(id); timer.fn(); }
      }
    },
    size: () => pending.size
  };
}

test('temporizador: vuelve a Hoy a los 3 minutos sin interacción', () => {
  assert.equal(HISTORY_IDLE_MS, 180000);
  const timers = fakeTimers();
  let idle = 0;
  const timer = createIdleTimer({ timers, onIdle: () => { idle += 1; } });
  timer.start();
  assert.equal(timer.isRunning(), true);
  timers.advance(HISTORY_IDLE_MS - 1);
  assert.equal(idle, 0);
  timers.advance(1);
  assert.equal(idle, 1);
  assert.equal(timer.isRunning(), false);
  // Se dispara una sola vez.
  timers.advance(HISTORY_IDLE_MS * 2);
  assert.equal(idle, 1);
});

test('temporizador: cada interacción reinicia los 3 minutos', () => {
  const timers = fakeTimers();
  let idle = 0;
  const timer = createIdleTimer({ timers, onIdle: () => { idle += 1; } });
  timer.start();
  timers.advance(170000);
  timer.touch();
  timers.advance(170000);
  assert.equal(idle, 0, '170 s después de tocar todavía no vuelve');
  timer.touch();
  timers.advance(HISTORY_IDLE_MS);
  assert.equal(idle, 1);
  assert.equal(timers.size(), 0, 'no deja temporizadores colgando');
});

test('temporizador: stop lo cancela y touch sin start no lo arma', () => {
  const timers = fakeTimers();
  let idle = 0;
  const timer = createIdleTimer({ timers, onIdle: () => { idle += 1; } });
  timer.touch();
  assert.equal(timers.size(), 0);
  timer.start();
  timer.stop();
  timers.advance(HISTORY_IDLE_MS * 2);
  assert.equal(idle, 0);
  assert.equal(timer.isRunning(), false);
  assert.equal(timers.size(), 0);
});

test('el panel: selector de día, vista de solo consulta y vuelta a Hoy', async () => {
  const source = await readFile(new URL('../business/business-orders.js', import.meta.url), 'utf8');
  // Selector con día anterior/siguiente, calendario y «Hoy».
  for (const marker of ['data-orders-action="history-prev"', 'data-orders-action="history-next"', 'data-orders-action="history-today"', '<input type="date" data-history-date']) {
    assert.ok(source.includes(marker), marker);
  }
  // Solo consulta: sin acciones de estado en el historial.
  assert.match(source, /ticketHTML\(order, \{ compact: true, readOnly: true \}\)/);
  assert.match(source, /\$\{readOnly \? '' : actionsHTML\(order\)\}/);
  // Franja y anuncio de pedidos nuevos mientras se mira otro día.
  assert.match(source, /data-history-alert/);
  assert.match(source, /pendingBannerText\(pendingCount\(\)\)\}: vuelve a Hoy para atenderlos/);
  // Inactividad: vuelve a Hoy y lo anuncia; se para al volver o al cerrar.
  assert.match(source, /onIdle: \(\) => showToday\(\{ reason: 'idle' \}\)/);
  assert.match(source, /Sin actividad durante 3 minutos: de vuelta a los pedidos de hoy\./);
  assert.match(source, /historyIdle\.stop\(\);\n    watchInteraction\(false\);/);
  // Fuera de rango no cierra la sesión.
  assert.match(source, /Solo puedes consultar los últimos 30 días\./);
});

test('el servicio distingue fuera de rango y fecha inválida de una sesión perdida', async () => {
  const source = await readFile(new URL('../services/business-order-service.js', import.meta.url), 'utf8');
  assert.match(source, /rpc\('list_business_orders_by_date', \{\n\s+p_business_id: businessId,\n\s+p_service_date: serviceDate/);
  assert.match(source, /const HISTORY_ERRORS = Object\.freeze\(\['history_out_of_range', 'invalid_date'\]\);/);
});

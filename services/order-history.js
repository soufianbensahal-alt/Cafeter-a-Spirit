// Historial del panel de pedidos: fechas de servicio en Europe/Madrid, resumen
// del día y vuelta automática a «Hoy». Puro y testeable
// (tests/order-history.test.js); la consulta la autoriza
// list_business_orders_by_date en la base.

export const HISTORY_TIME_ZONE = 'Europe/Madrid';
// employee: hoy y los 30 días anteriores (el mismo límite que la RPC).
export const EMPLOYEE_HISTORY_DAYS = 30;
export const UNLIMITED_HISTORY_ROLES = Object.freeze(['owner', 'manager']);
// Vista histórica abierta sin interacción: vuelve sola a «Hoy».
export const HISTORY_IDLE_MS = 3 * 60 * 1000;

const SERVICE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isServiceDate(value) {
  const match = SERVICE_DATE.exec(String(value ?? ''));
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Día de servicio actual en Madrid ('YYYY-MM-DD'), sea cual sea la zona del dispositivo.
export function madridToday(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: HISTORY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Suma días a una fecha de calendario. Trabaja en UTC sobre fechas sin hora:
// los cambios de horario de Madrid no le afectan.
export function shiftServiceDate(date, days) {
  if (!isServiceDate(date)) throw new TypeError(`Fecha de servicio no válida: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return shifted.toISOString().slice(0, 10);
}

// Fecha más antigua que puede consultar un rol (null = sin límite).
export function historyMinDate(role, today) {
  return UNLIMITED_HISTORY_ROLES.includes(role) ? null : shiftServiceDate(today, -EMPLOYEE_HISTORY_DAYS);
}

// Fecha que se puede pedir: ni futura ni anterior al límite del rol.
export function clampServiceDate(date, { today, min = null } = {}) {
  if (!isServiceDate(date) || date >= today) return today;
  if (min && date < min) return min;
  return date;
}

export function formatServiceDate(date, { today } = {}) {
  if (!isServiceDate(date)) return '';
  const [year, month, day] = date.split('-').map(Number);
  const sameYear = !today || today.slice(0, 4) === date.slice(0, 4);
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' })
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const utcDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Fecha visible del selector: «vie, 13 nov 2026».
export function formatServiceDateShort(date) {
  if (!isServiceDate(date)) return '';
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(utcDate(date));
}

// Descripción para lectores de pantalla: «viernes, 13 de noviembre de 2026».
export function formatServiceDateLong(date) {
  if (!isServiceDate(date)) return '';
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utcDate(date));
}

const timeOf = (value) => (value ? new Date(value).getTime() : 0);

export const sortByCreatedAt = (orders) => [...(orders || [])]
  .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || (a.number || 0) - (b.number || 0));

// Resumen del día: el importe es sólo lo servido (lo que se cobró).
export function summarizeDay(orders) {
  const summary = { served: 0, servedCents: 0, cancelled: 0, rejected: 0, total: 0 };
  for (const order of orders || []) {
    summary.total += 1;
    if (order.status === 'served') {
      summary.served += 1;
      summary.servedCents += Number(order.totalCents) || 0;
    } else if (order.status === 'cancelled') {
      summary.cancelled += 1;
    } else if (order.status === 'rejected') {
      summary.rejected += 1;
    }
  }
  return Object.freeze(summary);
}

export const pendingBannerText = (count) => (count === 1
  ? '1 pedido nuevo sin atender'
  : `${count} pedidos nuevos sin atender`);

// Temporizador de inactividad: start() lo arma, touch() lo reinicia con cada
// interacción y onIdle se llama una sola vez al cumplirse el plazo.
export function createIdleTimer({ timeoutMs = HISTORY_IDLE_MS, onIdle, timers = globalThis } = {}) {
  let handle = 0;
  let running = false;
  const clear = () => {
    if (handle) timers.clearTimeout(handle);
    handle = 0;
  };
  const arm = () => {
    clear();
    handle = timers.setTimeout(() => {
      handle = 0;
      running = false;
      onIdle?.();
    }, timeoutMs);
  };
  return {
    start() { running = true; arm(); },
    touch() { if (running) arm(); },
    stop() { running = false; clear(); },
    isRunning: () => running
  };
}

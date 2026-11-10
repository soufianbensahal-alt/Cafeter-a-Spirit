import { shouldStartPolling } from './loyalty-monitor.js';

export const ACTIVE_ORDER_STATUSES = Object.freeze(['pending', 'accepted', 'preparing']);
export const ORDER_PROGRESS_STEPS = Object.freeze(['pending', 'accepted', 'preparing', 'served']);

export const isActiveOrderStatus = (status) => ACTIVE_ORDER_STATUSES.includes(status);
export const isClosedUnsuccessfully = (status) => status === 'rejected' || status === 'cancelled';
export const orderProgressIndex = (status) => ORDER_PROGRESS_STEPS.indexOf(status);

export function orderStatusChanged(previous, next) {
  if (!next) return false;
  if (!previous) return true;
  return previous.status !== next.status || previous.updatedAt !== next.updatedAt;
}

// Mismo patrón que la monitorización de sellos: Realtime como vía principal y
// polling si el canal falla o no confirma la suscripción a tiempo.
//
// Realtime no reenvía los cambios ocurridos mientras el canal se une o está
// caído, así que se consulta la fuente de verdad:
//   * en cada SUBSCRIBED (primera unión y cada reconexión tras CHANNEL_ERROR,
//     TIMED_OUT o CLOSED),
//   * al volver a la app (visibilitychange → visible) y al recuperar la red.
export function createRealtimeWithFallback({
  subscribe,
  reconcile,
  fallbackDelayMs = 8000,
  pollIntervalMs = 5000,
  timers = globalThis,
  visibilityTarget = globalThis.document,
  networkTarget = globalThis
}) {
  let stopRealtime = null;
  let fallbackTimer = 0;
  let pollTimer = 0;
  let busy = false;
  let rerun = false;
  let running = false;

  // Una petición que llega mientras otra está en curso no se descarta: se
  // repite una vez al terminar, porque la consulta en curso pudo leer antes
  // del cambio que la motivó.
  const run = async () => {
    if (!running) return;
    if (busy) {
      rerun = true;
      return;
    }
    busy = true;
    try {
      do {
        rerun = false;
        try {
          await reconcile();
        } catch {
          // El siguiente evento o ciclo de polling vuelve a consultar la fuente de verdad.
        }
      } while (rerun && running);
    } finally {
      busy = false;
      rerun = false;
    }
  };

  const clearFallback = () => {
    timers.clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  };

  const startPolling = () => {
    clearFallback();
    if (pollTimer || !running) return;
    pollTimer = timers.setInterval(run, pollIntervalMs);
    run();
  };

  const handleVisibility = () => {
    if (visibilityTarget?.visibilityState === 'visible') run();
  };
  const handleOnline = () => run();

  const addLifecycleListeners = () => {
    visibilityTarget?.addEventListener?.('visibilitychange', handleVisibility);
    networkTarget?.addEventListener?.('online', handleOnline);
  };
  const removeLifecycleListeners = () => {
    visibilityTarget?.removeEventListener?.('visibilitychange', handleVisibility);
    networkTarget?.removeEventListener?.('online', handleOnline);
  };

  const stop = () => {
    running = false;
    clearFallback();
    timers.clearInterval(pollTimer);
    pollTimer = 0;
    removeLifecycleListeners();
    const unsubscribe = stopRealtime;
    stopRealtime = null;
    unsubscribe?.();
  };

  const start = () => {
    stop();
    running = true;
    addLifecycleListeners();
    try {
      stopRealtime = subscribe({
        onChange: run,
        onStatus: (status) => {
          if (!running) return;
          if (status === 'SUBSCRIBED') {
            clearFallback();
            timers.clearInterval(pollTimer);
            pollTimer = 0;
            run();
          } else if (shouldStartPolling(status)) {
            startPolling();
          }
        }
      });
    } catch {
      startPolling();
      return;
    }
    fallbackTimer = timers.setTimeout(startPolling, fallbackDelayMs);
  };

  return {
    start,
    stop,
    refresh: run,
    isRunning: () => running,
    isPolling: () => Boolean(pollTimer)
  };
}

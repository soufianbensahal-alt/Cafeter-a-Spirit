// Reglas puras del panel de pedidos del equipo: qué pedidos suenan, cuáles se
// resaltan como sin atender, cuándo se repite el aviso y cómo se agrupan.
// Sin DOM ni red para poder probarlas con node:test.

export const REMINDER_AFTER_MS = 2 * 60 * 1000;
export const REMINDER_EVERY_MS = 60 * 1000;

// Motivos de reconciliación que nunca suenan: la primera unión del canal, cada
// reconexión, volver a la pestaña y recuperar la red. Lo que aparezca en ellos
// ya existía y se resalta como sin atender (el recordatorio lo cubrirá).
export const SILENT_REASONS = Object.freeze(['subscribed', 'visible', 'online', 'initial']);

export function isSilentReconcile(reasons) {
  const list = [...(reasons || [])];
  if (!list.length) return true;
  return list.every((reason) => SILENT_REASONS.includes(reason));
}

const timeOf = (value) => {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Seguimiento de avisos. Guarda, por pedido pendiente, cuándo se vio por
// primera vez y cuándo sonó por última vez.
export function createOrderAlertTracker({ now = () => Date.now() } = {}) {
  const pending = new Map(); // id → { firstSeenAt, lastAlertAt, createdAt }
  let initialized = false;

  // orders: lista completa actual. Devuelve los pedidos que deben sonar ahora
  // por ser nuevos y los que acaban de salir de pending (para anunciarlos).
  /** @param {Array<{ id: string, status: string, createdAt?: string }>} orders @param {{ reasons?: Iterable<string> }} [options] */
  const reconcile = (orders, { reasons } = {}) => {
    const at = now();
    const silent = !initialized || isSilentReconcile(reasons);
    initialized = true;
    const currentPending = new Map();
    for (const order of orders || []) {
      if (order?.status === 'pending') currentPending.set(order.id, order);
    }

    const fresh = [];
    for (const [id, order] of currentPending) {
      if (pending.has(id)) continue;
      // Un pedido silencioso cuenta como avisado ahora: el recordatorio llega
      // un minuto después si ya supera los dos minutos.
      pending.set(id, { firstSeenAt: at, lastAlertAt: at, createdAt: timeOf(order.createdAt) });
      if (!silent) fresh.push(id);
    }

    const left = [];
    for (const id of [...pending.keys()]) {
      if (!currentPending.has(id)) {
        pending.delete(id);
        left.push(id);
      }
    }

    return { fresh, left, silent };
  };

  // Edad en pending. Se toma la referencia más antigua entre created_at del
  // servidor y el momento en que el panel lo vio, salvo que created_at esté en
  // el futuro por un reloj de la tablet atrasado.
  const pendingAge = (entry, at) => {
    const reference = Number.isFinite(entry.createdAt) && entry.createdAt <= at
      ? Math.min(entry.createdAt, entry.firstSeenAt)
      : entry.firstSeenAt;
    return at - reference;
  };

  // Pedidos que llevan más de 2 minutos en pending y no han sonado en el
  // último minuto. Marca como avisados los devueltos.
  const dueReminders = () => {
    const at = now();
    const due = [];
    for (const [id, entry] of pending) {
      if (pendingAge(entry, at) >= REMINDER_AFTER_MS && at - entry.lastAlertAt >= REMINDER_EVERY_MS) {
        entry.lastAlertAt = at;
        due.push(id);
      }
    }
    return due;
  };

  const markAlerted = (ids) => {
    const at = now();
    for (const id of ids) {
      const entry = pending.get(id);
      if (entry) entry.lastAlertAt = at;
    }
  };

  const reset = () => {
    pending.clear();
    initialized = false;
  };

  return {
    reconcile,
    dueReminders,
    markAlerted,
    reset,
    pendingIds: () => [...pending.keys()],
    isInitialized: () => initialized
  };
}

// Columnas del panel. Los aceptados se preparan en la misma columna.
export function groupBusinessOrders(orders) {
  const byCreated = [...(orders || [])].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
  const latestFirst = (key) => (a, b) => timeOf(b[key] || b.updatedAt) - timeOf(a[key] || a.updatedAt);
  return {
    fresh: byCreated.filter((order) => order.status === 'pending'),
    inProgress: byCreated.filter((order) => order.status === 'accepted' || order.status === 'preparing'),
    served: byCreated.filter((order) => order.status === 'served').sort(latestFirst('servedAt')),
    closed: byCreated
      .filter((order) => order.status === 'cancelled' || order.status === 'rejected')
      .sort(latestFirst('updatedAt'))
  };
}

// Pedidos cuyo estado cambió de pending a cancelado entre dos lecturas: el
// cliente canceló. Se anuncian de forma destacada.
export function newlyCancelled(previousById, orders) {
  return (orders || []).filter((order) => order.status === 'cancelled'
    && previousById?.get(order.id)
    && previousById.get(order.id).status !== 'cancelled');
}

export function pendingTitle(baseTitle, pendingCount) {
  return pendingCount > 0 ? `(${pendingCount}) ${baseTitle}` : baseTitle;
}

export const REJECTION_REASON_MAX = 200;

export function normalizeRejectionReason(value) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, error: 'required', value: '' };
  if (clean.length > REJECTION_REASON_MAX) return { ok: false, error: 'too_long', value: clean };
  return { ok: true, value: clean };
}

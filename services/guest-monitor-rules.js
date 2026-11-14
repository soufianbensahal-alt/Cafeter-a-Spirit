// Reglas puras de la tarjeta «Invitados (últimos 14 días)» del Panel
// (tests/guest-monitor.test.js).

// Un día merece revisión con 20 o más invitados y menos de un 20 % con pedido.
export const SUSPICIOUS_MIN_GUESTS = 20;
export const SUSPICIOUS_MAX_ORDER_RATIO = 0.2;

export const isSuspiciousGuestDay = (row) => Number(row?.guests) >= SUSPICIOUS_MIN_GUESTS
  && Number(row?.guestsWithOrders) / Number(row.guests) < SUSPICIOUS_MAX_ORDER_RATIO;

// Sólo se muestra con «Pedidos sin cuenta» activado o si hubo invitados.
export const shouldShowGuestMonitor = ({ guestOrderingEnabled = false, rows = [] } = {}) => guestOrderingEnabled === true
  || (rows || []).some((row) => Number(row?.guests) > 0);

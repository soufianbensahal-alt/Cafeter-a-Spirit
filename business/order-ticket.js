// Ticket digital del pedido (pantalla) y comanda para imprimir (cocina).
// Render puro, sin DOM ni red: se prueba en tests/order-ticket.test.js.
//
// Precios congelados: list_business_orders devuelve line_total_cents y
// quantity de order_items. El CHECK line_total_cents = unit_price_cents *
// quantity (comprobado en supabase/tests/order_panel_test.sql) hace que el
// unitario calculado sea exactamente el precio congelado.

export const PICKUP_TABLE_LABEL = 'Barra';
export const PRINTER_ICON = '<svg class="order-tool__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

// El panel está hoy sólo en castellano; el catalán queda preparado para
// cuando tenga selector de idioma.
export const ORDER_TICKET_COPY = Object.freeze({
  es: Object.freeze({
    close: 'Cerrar',
    orderNumber: 'Nº {number}',
    orderNumberSpoken: 'Pedido nº {number}',
    table: 'Mesa {table}',
    pickup: 'Barra',
    status: 'Estado',
    customer: 'Cliente',
    times: 'Horas del pedido',
    time_created: 'Pedido',
    time_accepted: 'Aceptado',
    time_preparing: 'En preparación',
    time_served: 'Servido',
    time_rejected: 'Rechazado',
    time_cancelled: 'Cancelado por el cliente',
    status_pending: 'Sin atender',
    status_accepted: 'Aceptado',
    status_preparing: 'En preparación',
    status_served: 'Servido',
    status_rejected: 'Rechazado',
    status_cancelled: 'Cancelado por el cliente',
    reason: 'Motivo',
    items: 'Productos',
    unitPrice: '{price} c/u',
    lineSpoken: '{quantity} × {product}, {unit} cada uno, total {total}',
    note: 'Nota del cliente',
    total: 'Total',
    payAtVenue: 'Pago en el local',
    internal: 'Uso interno · No válido como factura',
    print: 'Imprimir comanda',
    printOrder: 'Imprimir comanda del pedido nº {number}',
    openTicket: 'Ver ticket del pedido nº {number}',
    kitchenTitle: 'Comanda del pedido nº {number}',
    kitchenNote: 'NOTA',
    kitchenOrderedAt: 'Pedido a las {time}'
  }),
  ca: Object.freeze({
    close: 'Tancar',
    orderNumber: 'Núm. {number}',
    orderNumberSpoken: 'Comanda núm. {number}',
    table: 'Taula {table}',
    pickup: 'Barra',
    status: 'Estat',
    customer: 'Client',
    times: 'Hores de la comanda',
    time_created: 'Comanda',
    time_accepted: 'Acceptada',
    time_preparing: 'En preparació',
    time_served: 'Servida',
    time_rejected: 'Rebutjada',
    time_cancelled: 'Cancel·lada pel client',
    status_pending: 'Sense atendre',
    status_accepted: 'Acceptada',
    status_preparing: 'En preparació',
    status_served: 'Servida',
    status_rejected: 'Rebutjada',
    status_cancelled: 'Cancel·lada pel client',
    reason: 'Motiu',
    items: 'Productes',
    unitPrice: '{price} c/u',
    lineSpoken: '{quantity} × {product}, {unit} cadascun, total {total}',
    note: 'Nota del client',
    total: 'Total',
    payAtVenue: 'Pagament al local',
    internal: 'Ús intern · No vàlid com a factura',
    print: 'Imprimir la comanda',
    printOrder: 'Imprimir la comanda núm. {number}',
    openTicket: 'Veure el tiquet de la comanda núm. {number}',
    kitchenTitle: 'Comanda núm. {number}',
    kitchenNote: 'NOTA',
    kitchenOrderedAt: 'Comanda a les {time}'
  })
});

const TIMELINE = Object.freeze([
  ['created', 'createdAt'],
  ['accepted', 'acceptedAt'],
  ['preparing', 'preparingAt'],
  ['served', 'servedAt'],
  ['rejected', 'rejectedAt'],
  ['cancelled', 'cancelledAt']
]);

const defaultEscape = (value = '') => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const locale = (lang) => (lang === 'ca' ? 'ca-ES' : 'es-ES');

export function ticketTranslator(lang = 'es') {
  const dictionary = ORDER_TICKET_COPY[lang] || ORDER_TICKET_COPY.es;
  return (key, values = {}) => Object.entries(values)
    .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), dictionary[key] || ORDER_TICKET_COPY.es[key] || key);
}

export const formatTicketMoney = (cents, lang = 'es') => new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR' })
  .format((Number(cents) || 0) / 100);

export const formatTicketTime = (timestamp, lang = 'es') => (timestamp
  ? new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(timestamp))
  : '');

// «Cafetería Spirit - Montcada» → «Cafetería Spirit · Montcada».
export const formatBusinessName = (name) => String(name || 'Cafetería Spirit').trim().replace(/\s+[-–—]\s+/g, ' · ');

export function ticketPlace(tableLabel, t = ticketTranslator()) {
  const clean = String(tableLabel || '').trim();
  if (!clean || clean === PICKUP_TABLE_LABEL) return t('pickup');
  return /^(mesa|taula)\b/i.test(clean) ? clean : t('table', { table: clean });
}

// Precio unitario congelado a partir de la línea. null si los datos no
// cuadran (nunca debería pasar con el CHECK de order_items).
export function unitPriceCents(item) {
  const quantity = Number(item?.quantity);
  const total = Number(item?.lineTotalCents);
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(total)) return null;
  const unit = total / quantity;
  return Number.isInteger(unit) ? unit : null;
}

export const linesTotalCents = (order) => (order?.items || [])
  .reduce((sum, item) => sum + (Number(item.lineTotalCents) || 0), 0);

export function ticketTimeline(order) {
  return TIMELINE
    .filter(([, field]) => order?.[field])
    .map(([key, field]) => Object.freeze({ key, at: order[field] }));
}

// Contenido del diálogo del ticket. «Cerrar» va primero en el DOM (recibe el
// foco inicial) y después el ticket en orden de lectura.
export function renderOrderTicket(order, { lang = 'es', businessName, escapeHTML = defaultEscape, logoSrc = '/assets/spirit-logo-header.png' } = {}) {
  const t = ticketTranslator(lang);
  const money = (cents) => formatTicketMoney(cents, lang);
  return `<div class="ticket-sheet" data-order-ticket-view="${escapeHTML(order.id)}">
    <div class="ticket-sheet__bar"><button class="ticket-sheet__close" type="button" data-ticket-close>${t('close')}</button></div>
    <div class="ticket-sheet__body" data-ticket-body>${renderOrderTicketBody(order, { lang, businessName, escapeHTML, logoSrc, t, money })}</div>
    <div class="ticket-sheet__actions"><button class="ticket-sheet__print" type="button" data-ticket-print="${escapeHTML(order.id)}">${PRINTER_ICON}<span>${t('print')}</span></button></div>
  </div>`;
}

export function renderOrderTicketBody(order, { lang = 'es', businessName, escapeHTML = defaultEscape, logoSrc = '/assets/spirit-logo-header.png', t = ticketTranslator(lang), money = (cents) => formatTicketMoney(cents, lang) } = {}) {
  const place = ticketPlace(order.tableLabel, t);
  const timeline = ticketTimeline(order).map(({ key, at }) => `<div class="ticket__row"><dt>${t(`time_${key}`)}</dt><dd><time datetime="${escapeHTML(at)}">${formatTicketTime(at, lang)}</time></dd></div>`).join('');
  const lines = (order.items || []).map((item) => {
    const unit = unitPriceCents(item);
    const unitText = unit === null ? '' : money(unit);
    const spoken = t('lineSpoken', { quantity: item.quantity, product: item.productName, unit: unitText, total: money(item.lineTotalCents) });
    return `<li class="ticket__line">
        <span class="sr-only">${escapeHTML(spoken)}</span>
        <span class="ticket__qty" aria-hidden="true">${item.quantity} ×</span>
        <span class="ticket__product" aria-hidden="true">${escapeHTML(item.productName)}</span>
        <span class="ticket__unit" aria-hidden="true">${unitText ? t('unitPrice', { price: unitText }) : ''}</span>
        <span class="ticket__line-total" aria-hidden="true">${money(item.lineTotalCents)}</span>
      </li>`;
  }).join('');
  return `<article class="ticket ticket--${escapeHTML(order.status)}">
      <header class="ticket__brand">
        <img class="ticket__logo" src="${escapeHTML(logoSrc)}" alt="" width="70" height="90">
        <p class="ticket__business">${escapeHTML(formatBusinessName(businessName))}</p>
      </header>
      <hr class="ticket__rule">
      <h2 id="order-ticket-title" class="ticket__title"><span class="sr-only">${t('orderNumberSpoken', { number: order.number })} · ${escapeHTML(place)}</span><span class="ticket__number" aria-hidden="true">${t('orderNumber', { number: order.number })}</span><span class="ticket__place" aria-hidden="true">${escapeHTML(place)}</span></h2>
      <p class="ticket__status"><span class="sr-only">${t('status')}: </span>${t(`status_${order.status}`)}</p>
      <dl class="ticket__meta">
        <div class="ticket__row"><dt>${t('customer')}</dt><dd>${escapeHTML(order.customer)}</dd></div>
        ${timeline}
        ${order.rejectionReason ? `<div class="ticket__row ticket__row--reason"><dt>${t('reason')}</dt><dd>${escapeHTML(order.rejectionReason)}</dd></div>` : ''}
      </dl>
      <hr class="ticket__rule">
      <ul class="ticket__lines" aria-label="${t('items')}">${lines}</ul>
      ${order.note ? `<section class="ticket__note" aria-label="${t('note')}"><h3>${t('note')}</h3><p>${escapeHTML(order.note)}</p></section>` : ''}
      <hr class="ticket__rule">
      <p class="ticket__total"><span>${t('total')}</span><strong data-ticket-total>${money(order.totalCents)}</strong></p>
      <p class="ticket__pay">${t('payAtVenue')}</p>
      <p class="ticket__legal">${t('internal')}</p>
    </article>`;
}

// Comanda de cocina para imprimir (80 mm o A4): nº y mesa grandes, cantidades
// y productos en letra grande, nota resaltada; precios y total al final.
export function renderKitchenTicket(order, { lang = 'es', businessName, escapeHTML = defaultEscape } = {}) {
  const t = ticketTranslator(lang);
  const money = (cents) => formatTicketMoney(cents, lang);
  const place = ticketPlace(order.tableLabel, t);
  const lines = (order.items || []).map((item) => `<li><span class="kitchen-ticket__qty">${item.quantity} ×</span><span class="kitchen-ticket__product">${escapeHTML(item.productName)}</span></li>`).join('');
  const prices = (order.items || []).map((item) => `<li><span>${item.quantity} × ${escapeHTML(item.productName)}</span><span>${money(item.lineTotalCents)}</span></li>`).join('');
  return `<section class="kitchen-ticket" aria-label="${t('kitchenTitle', { number: order.number })}" data-kitchen-ticket="${escapeHTML(order.id)}">
    <p class="kitchen-ticket__business">${escapeHTML(formatBusinessName(businessName))}</p>
    <p class="kitchen-ticket__number">${t('orderNumber', { number: order.number })}</p>
    <p class="kitchen-ticket__place">${escapeHTML(place)}</p>
    <p class="kitchen-ticket__time">${t('kitchenOrderedAt', { time: formatTicketTime(order.createdAt, lang) })}</p>
    <hr class="kitchen-ticket__rule">
    <ul class="kitchen-ticket__lines">${lines}</ul>
    ${order.note ? `<p class="kitchen-ticket__note"><strong>${t('kitchenNote')}:</strong> ${escapeHTML(order.note)}</p>` : ''}
    <hr class="kitchen-ticket__rule">
    <ul class="kitchen-ticket__prices">${prices}</ul>
    <p class="kitchen-ticket__total"><span>${t('total')}</span><span>${money(order.totalCents)}</span></p>
    <p class="kitchen-ticket__legal">${t('payAtVenue')} · ${t('internal')}</p>
  </section>`;
}

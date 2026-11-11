import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapBusinessOrderRow } from '../services/business-order-rows.js';
import {
  ORDER_TICKET_COPY,
  formatBusinessName,
  linesTotalCents,
  renderKitchenTicket,
  renderOrderTicket,
  renderOrderTicketBody,
  ticketPlace,
  ticketTimeline,
  ticketTranslator,
  unitPriceCents
} from '../business/order-ticket.js';

// Fila tal como la devuelve list_business_orders (precios congelados de
// order_items: line_total_cents = unit_price_cents × quantity).
const row = (overrides = {}) => ({
  id: 'b3000000-0000-4000-8000-000000000001',
  order_number: 12,
  service_date: '2026-11-11',
  status: 'served',
  table_label: '4',
  total_cents: 1300,
  note: 'Sin azúcar <por favor>',
  rejection_reason: null,
  customer_masked: 'Ana G.',
  items: [
    { product_id: 'cafes-latte', product_name: 'Latte', quantity: 2, line_total_cents: 500 },
    { product_id: 'tostada', product_name: 'Tostada de aguacate', quantity: 1, line_total_cents: 800 }
  ],
  created_at: '2026-11-11T09:02:00Z',
  updated_at: '2026-11-11T09:20:00Z',
  accepted_at: '2026-11-11T09:04:00Z',
  preparing_at: '2026-11-11T09:06:00Z',
  served_at: '2026-11-11T09:15:00Z',
  rejected_at: null,
  cancelled_at: null,
  ...overrides
});
const order = (overrides) => mapBusinessOrderRow(row(overrides));
const options = { businessName: 'Cafetería Spirit - Montcada' };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('el unitario congelado se obtiene exacto de la línea', () => {
  assert.equal(unitPriceCents({ quantity: 2, lineTotalCents: 500 }), 250);
  assert.equal(unitPriceCents({ quantity: 3, lineTotalCents: 1050 }), 350);
  assert.equal(unitPriceCents({ quantity: 3, lineTotalCents: 1000 }), null, 'si no cuadra no inventa un precio');
  assert.equal(unitPriceCents({ quantity: 0, lineTotalCents: 0 }), null);
  assert.equal(unitPriceCents({}), null);
});

test('el ticket muestra precios congelados, unitarios, totales de línea y total', () => {
  const html = renderOrderTicket(order(), options);
  const plain = text(html);
  assert.match(plain, /2 × Latte 2,50\s€ c\/u 5,00\s€/);
  assert.match(plain, /1 × Tostada de aguacate 8,00\s€ c\/u 8,00\s€/);
  assert.match(html, /<strong data-ticket-total>13,00\s€<\/strong>/);
  assert.equal(linesTotalCents(order()), order().totalCents);
  // Frase completa para VoiceOver por línea.
  assert.match(html, /<span class="sr-only">2 × Latte, 2,50\s€ cada uno, total 5,00\s€<\/span>/);
  // Usa el nombre congelado de la línea, no la carta actual.
  const renamed = renderOrderTicket(order({ items: [{ product_id: 'cafes-latte', product_name: 'Latte (antiguo)', quantity: 1, line_total_cents: 240 }], total_cents: 240 }), options);
  assert.match(text(renamed), /1 × Latte \(antiguo\) 2,40\s€ c\/u 2,40\s€/);
});

test('cabecera: Cerrar primero, marca, nº y mesa grandes, cliente y horas', () => {
  const html = renderOrderTicket(order(), options);
  assert.ok(html.indexOf('data-ticket-close') < html.indexOf('ticket__brand'), 'Cerrar es lo primero del DOM');
  assert.ok(html.indexOf('ticket__brand') < html.indexOf('order-ticket-title'));
  assert.ok(html.indexOf('order-ticket-title') < html.indexOf('ticket__lines'));
  assert.ok(html.indexOf('ticket__lines') < html.indexOf('data-ticket-total'));
  assert.ok(html.indexOf('data-ticket-total') < html.indexOf('data-ticket-print'));
  assert.match(html, /<img class="ticket__logo" src="\/assets\/spirit-logo-header\.png" alt=""/);
  assert.match(html, /Cafetería Spirit · Montcada/);
  assert.match(html, /<h2 id="order-ticket-title" class="ticket__title"><span class="sr-only">Pedido nº 12 · Mesa 4<\/span><span class="ticket__number" aria-hidden="true">Nº 12<\/span><span class="ticket__place" aria-hidden="true">Mesa 4<\/span><\/h2>/);
  assert.match(text(html), /Cliente Ana G\./);
  assert.match(text(html), /Pedido 10:02 Aceptado 10:04 En preparación 10:06 Servido 10:15/);
  assert.match(text(html), /Pago en el local Uso interno · No válido como factura/);
  assert.match(html, /<button class="ticket-sheet__print" type="button" data-ticket-print="b3000000-0000-4000-8000-000000000001">/);
});

test('nota destacada y escapada; sin nota no hay bloque', () => {
  const html = renderOrderTicket(order(), options);
  assert.match(html, /<section class="ticket__note" aria-label="Nota del cliente"><h3>Nota del cliente<\/h3><p>Sin azúcar &lt;por favor&gt;<\/p><\/section>/);
  assert.doesNotMatch(renderOrderTicket(order({ note: null }), options), /ticket__note/);
});

test('estados: sólo las horas que existen y el motivo del rechazo', () => {
  const pending = order({ status: 'pending', accepted_at: null, preparing_at: null, served_at: null });
  assert.deepEqual(ticketTimeline(pending).map((entry) => entry.key), ['created']);
  assert.match(text(renderOrderTicket(pending, options)), /Sin atender/);

  const rejected = order({ status: 'rejected', accepted_at: null, preparing_at: null, served_at: null, rejected_at: '2026-11-11T09:05:00Z', rejection_reason: 'Cocina <cerrada>' });
  const html = renderOrderTicket(rejected, options);
  assert.deepEqual(ticketTimeline(rejected).map((entry) => entry.key), ['created', 'rejected']);
  assert.match(text(html), /Rechazado 10:05 Motivo Cocina &lt;cerrada&gt;/);
  assert.match(html, /Cocina &lt;cerrada&gt;/);
  assert.match(html, /class="ticket ticket--rejected"/);

  const cancelled = order({ status: 'cancelled', accepted_at: null, preparing_at: null, served_at: null, cancelled_at: '2026-11-11T09:03:00Z' });
  assert.match(text(renderOrderTicket(cancelled, options)), /Cancelado por el cliente 10:03/);
});

test('Barra frente a mesa y nombre del local', () => {
  const t = ticketTranslator('es');
  assert.equal(ticketPlace('Barra', t), 'Barra');
  assert.equal(ticketPlace('', t), 'Barra');
  assert.equal(ticketPlace('4', t), 'Mesa 4');
  assert.equal(ticketPlace('Mesa 4', t), 'Mesa 4');
  assert.equal(ticketPlace('Terraza 2', t), 'Mesa Terraza 2');
  assert.equal(formatBusinessName('Cafetería Spirit - Montcada'), 'Cafetería Spirit · Montcada');
  assert.equal(formatBusinessName(''), 'Cafetería Spirit');
  assert.match(renderOrderTicket(order({ table_label: 'Barra' }), options), /<span class="ticket__place" aria-hidden="true">Barra<\/span>/);
});

test('la comanda: nº y mesa grandes, productos, nota resaltada y precios al final', () => {
  const html = renderKitchenTicket(order(), options);
  assert.match(html, /<section class="kitchen-ticket" aria-label="Comanda del pedido nº 12"/);
  assert.match(html, /<p class="kitchen-ticket__number">Nº 12<\/p>/);
  assert.match(html, /<p class="kitchen-ticket__place">Mesa 4<\/p>/);
  assert.match(html, /<p class="kitchen-ticket__time">Pedido a las 10:02<\/p>/);
  assert.match(html, /<li><span class="kitchen-ticket__qty">2 ×<\/span><span class="kitchen-ticket__product">Latte<\/span><\/li>/);
  assert.match(html, /<p class="kitchen-ticket__note"><strong>NOTA:<\/strong> Sin azúcar &lt;por favor&gt;<\/p>/);
  // Los precios van después de productos y nota.
  assert.ok(html.indexOf('kitchen-ticket__lines') < html.indexOf('kitchen-ticket__note'));
  assert.ok(html.indexOf('kitchen-ticket__note') < html.indexOf('kitchen-ticket__prices'));
  assert.match(text(html), /Total 13,00\s€ Pago en el local · Uso interno · No válido como factura$/);
  // Sin imágenes ni colores en línea: blanco y negro lo decide el CSS.
  assert.doesNotMatch(html, /<img|style=/);
  assert.doesNotMatch(renderKitchenTicket(order({ note: null }), options), /kitchen-ticket__note/);
});

test('ORDER_TICKET_COPY tiene el catalán completo y listo', () => {
  assert.deepEqual(Object.keys(ORDER_TICKET_COPY.ca).sort(), Object.keys(ORDER_TICKET_COPY.es).sort());
  for (const [key, value] of Object.entries(ORDER_TICKET_COPY.ca)) assert.ok(value.trim(), `ca.${key}`);
  const html = renderOrderTicket(order(), { ...options, lang: 'ca' });
  assert.match(text(html), /Tancar/);
  assert.match(text(html), /Taula 4/);
  assert.match(text(html), /Pagament al local Ús intern · No vàlid com a factura/);
  assert.match(renderKitchenTicket(order(), { ...options, lang: 'ca' }), /Comanda a les 10:02/);
});

test('el cuerpo del ticket se puede repintar sin Cerrar ni Imprimir', () => {
  const body = renderOrderTicketBody(order(), options);
  assert.doesNotMatch(body, /data-ticket-close|data-ticket-print/);
  assert.match(body, /order-ticket-title/);
});

test('el panel: la cabecera abre el ticket y la comanda sólo en Nuevos y En preparación', async () => {
  const source = await readFile(new URL('../business/business-orders.js', import.meta.url), 'utf8');
  assert.match(source, /<button class="order-ticket__head" type="button" data-orders-action="ticket"/);
  assert.match(source, /const PRINTABLE_STATUSES = new Set\(\['pending', 'accepted', 'preparing'\]\);/);
  assert.match(source, /data-orders-action="print"[^`]*aria-label="\$\{escapeHTML\(ticketText\('printOrder'/);
  assert.match(source, /\{ initialFocus: '\[data-ticket-close\]' \}/);
  assert.match(source, /const TICKET_LANG = 'es';/);
  assert.doesNotMatch(source, /Ver ticket<\/button>/, 'no hay botón «Ver ticket» aparte');
});

test('CSS: 44 px, ticket en claro y oscuro, e impresión sólo de la comanda', async () => {
  const css = await readFile(new URL('../business/business.css', import.meta.url), 'utf8');
  const rule = (selector) => css.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.[\]"=()#>:*-]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';
  assert.match(rule('.order-tool'), /width: 44px; min-width: 44px; height: 44px; min-height: 44px/);
  assert.match(rule('.order-ticket__head'), /min-height: 44px/);
  assert.match(rule('.ticket-sheet__close'), /min-height: 44px/);
  assert.match(rule('.ticket'), /font-variant-numeric: tabular-nums/);
  assert.match(rule('.ticket__rule'), /dashed/);
  assert.match(rule('html[data-theme="dark"] .ticket'), /--ticket-paper: #2a2720/);
  assert.match(rule('#print-root'), /display: none/);
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /html\.is-printing-ticket body > :not\(#print-root\) \{ display: none !important; \}/);
  assert.match(print, /\.kitchen-ticket \* \{ color: #000 !important; background: transparent !important;/);
  assert.match(print, /\.kitchen-ticket \{ width: 100%; max-width: 72mm;/);
  assert.doesNotMatch(print, /@page \{[^}]*size/, 'sin tamaño de página fijo: 80 mm y A4');
});

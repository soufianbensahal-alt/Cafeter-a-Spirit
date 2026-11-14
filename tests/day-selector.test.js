import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatServiceDateLong, formatServiceDateShort, madridToday } from '../services/order-history.js';
import { isSuspiciousGuestDay, shouldShowGuestMonitor } from '../services/guest-monitor-rules.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fecha visible «vie, 13 nov 2026» y descripción larga, en Madrid', () => {
  assert.equal(formatServiceDateShort('2026-11-13'), 'vie, 13 nov 2026');
  assert.equal(formatServiceDateLong('2026-11-13'), 'viernes, 13 de noviembre de 2026');
  assert.equal(formatServiceDateShort('2026-09-01'), 'mar, 1 sept 2026');
  assert.equal(formatServiceDateShort('basura'), '');
  // 23:30 UTC del 13 = sábado 14 en Madrid.
  assert.equal(formatServiceDateShort(madridToday(Date.parse('2026-11-13T23:30:00Z'))), 'sáb, 14 nov 2026');
});

test('días a revisar: 20 o más invitados y menos de un 20 % con pedido', () => {
  assert.equal(isSuspiciousGuestDay({ guests: 20, guestsWithOrders: 3 }), true, '15 %');
  assert.equal(isSuspiciousGuestDay({ guests: 20, guestsWithOrders: 4 }), false, 'justo 20 %');
  assert.equal(isSuspiciousGuestDay({ guests: 19, guestsWithOrders: 0 }), false, '19 invitados');
  assert.equal(isSuspiciousGuestDay({ guests: 100, guestsWithOrders: 19 }), true, '19 %');
  assert.equal(isSuspiciousGuestDay({ guests: 0, guestsWithOrders: 0 }), false);
});

test('la tarjeta de invitados sólo se muestra con el interruptor activo o si hubo invitados', () => {
  const empty = Array.from({ length: 14 }, () => ({ guests: 0, guestsWithOrders: 0 }));
  assert.equal(shouldShowGuestMonitor({ guestOrderingEnabled: false, rows: empty }), false);
  assert.equal(shouldShowGuestMonitor({ guestOrderingEnabled: true, rows: empty }), true);
  assert.equal(shouldShowGuestMonitor({ guestOrderingEnabled: false, rows: [...empty.slice(1), { guests: 1, guestsWithOrders: 0 }] }), true);
  assert.equal(shouldShowGuestMonitor(), false);
});

test('el selector: un único control (input transparente) y la fecha visible decorativa', async () => {
  const panel = await read('business/business-orders.js');
  assert.match(panel, /<span class="orders-datebar__display" aria-hidden="true" data-history-display>/);
  assert.match(panel, /<label class="sr-only" for="orders-date">Fecha<\/label>/);
  assert.match(panel, /<input id="orders-date" class="orders-datebar__input" type="date" data-history-date[^>]*aria-describedby="orders-date-description">/);
  assert.match(panel, /<span id="orders-date-description" class="sr-only">\$\{escapeHTML\(formatServiceDateLong\(selected\)\)\}<\/span>/);
  assert.doesNotMatch(panel, /orders-datebar__display[^>]*(tabindex|<button)/);
  // Flechas siempre visibles; en el límite, aria-disabled y sin efecto.
  assert.match(panel, /aria-disabled="\$\{disabled\}"/);
  assert.match(panel, /target\.getAttribute\('aria-disabled'\) === 'true'\) return;/);
  // «Hoy» junto al título y sólo fuera de hoy; al volver, foco al título.
  assert.match(panel, /\$\{isToday \? '' : '<button class="orders-today"/);
  assert.match(panel, /appRoot\.querySelector\('\[data-orders-title\]'\)\?\.focus\(\);/);
  assert.match(panel, /typeof dateInput\.showPicker === 'function'/);
});

test('CSS: rejilla 44px · minmax(0, 1fr) · 44px y el input cubre la fecha sin desbordar', async () => {
  const css = await read('business/business.css');
  assert.match(css, /\.orders-datebar \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 44px;[^}]*gap: 10px;/);
  assert.match(css, /\.orders-datebar__field \{[^}]*min-width: 0;/);
  assert.match(css, /\.orders-datebar__display \{[^}]*pointer-events: none;/);
  assert.match(css, /\.orders-datebar__input \{[^}]*position: absolute; inset: 0; width: 100%; height: 100%; min-width: 0;[^}]*opacity: 0;/);
  assert.match(css, /\.orders-datebar__step \{ width: 44px; height: 44px;[^}]*border-radius: 50%;/);
  assert.match(css, /\.orders-datebar__step\[aria-disabled="true"\] \{ opacity: \.4;/);
});

function luminance(hex) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
const blend = (fg, alpha, bg) => `#${[1, 3, 5].map((index) => Math.round(parseInt(fg.slice(index, index + 2), 16) * alpha + parseInt(bg.slice(index, index + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test('franja del empleado: rol y «Vista cliente» por encima de 4.5:1 (con margen)', async () => {
  const css = await read('business/business.css');
  assert.match(css, /\.employee-strip span \{ color: #463f2f; font-size: 12px; font-weight: 700; \}/);
  assert.match(css, /\.employee-strip \.employee-status \{[^}]*color: #2f4a2d;/);
  const strip = blend('#fffdf8', 0.58, '#eecf62');
  const pill = blend('#496347', 0.12, strip);
  assert.ok(contrast('#463f2f', strip) >= 7, `rol ${contrast('#463f2f', strip).toFixed(2)}`);
  assert.ok(contrast('#2f4a2d', pill) >= 6.5, `estado ${contrast('#2f4a2d', pill).toFixed(2)}`);
  // Tema oscuro: mismos colores sobre la franja clara.
  assert.match(css, /html\[data-theme="dark"\] \.employee-strip span \{ color: #463f2f; \}/);
});

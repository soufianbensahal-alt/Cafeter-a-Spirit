import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canPrintKitchenTicket, isIOSDevice, isIOSStandalone, readPrintEnvironment } from '../services/print-route.js';
import { mapBusinessOrderRow } from '../services/business-order-rows.js';
import { renderOrderTicket } from '../business/order-ticket.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  // iPadOS pide la web de escritorio por defecto: UA de Mac.
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

test('iPhone instalado como app (navigator.standalone o display-mode): no imprime', () => {
  assert.equal(isIOSStandalone({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: true }), true);
  assert.equal(isIOSStandalone({ userAgent: UA.iphone, maxTouchPoints: 5, displayModeStandalone: true }), true);
  assert.equal(canPrintKitchenTicket({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: true }), false);
});

test('iPad instalado, también con UA de escritorio', () => {
  assert.equal(isIOSStandalone({ userAgent: UA.ipad, maxTouchPoints: 5, standalone: true }), true);
  assert.equal(isIOSDevice({ userAgent: UA.ipadDesktop, maxTouchPoints: 5 }), true);
  assert.equal(isIOSStandalone({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, displayModeStandalone: true }), true);
});

test('Safari no instalado en iPhone o iPad: imprime como ahora', () => {
  assert.equal(isIOSStandalone({ userAgent: UA.iphone, maxTouchPoints: 5 }), false);
  assert.equal(isIOSStandalone({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, standalone: false, displayModeStandalone: false }), false);
  assert.equal(canPrintKitchenTicket({ userAgent: UA.iphone, maxTouchPoints: 5 }), true);
});

test('Android (instalado o no) y escritorio: imprimen como ahora', () => {
  assert.equal(isIOSStandalone({ userAgent: UA.android, maxTouchPoints: 5, displayModeStandalone: true }), false);
  assert.equal(isIOSStandalone({ userAgent: UA.android, maxTouchPoints: 5 }), false);
  // Un Mac no es táctil: aunque la PWA esté instalada en macOS, imprime.
  assert.equal(isIOSDevice({ userAgent: UA.mac, maxTouchPoints: 0 }), false);
  assert.equal(isIOSStandalone({ userAgent: UA.mac, maxTouchPoints: 0, displayModeStandalone: true }), false);
  assert.equal(isIOSStandalone({ userAgent: UA.windows, maxTouchPoints: 0, displayModeStandalone: true }), false);
  assert.equal(canPrintKitchenTicket({ userAgent: UA.windows }), true);
  assert.equal(isIOSStandalone(), false);
});

test('readPrintEnvironment lee navigator y display-mode sin fallar', () => {
  const env = readPrintEnvironment({
    navigator: { userAgent: UA.iphone, maxTouchPoints: 5, standalone: true },
    matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' })
  });
  assert.deepEqual(env, { userAgent: UA.iphone, maxTouchPoints: 5, standalone: true, displayModeStandalone: true });
  assert.deepEqual(readPrintEnvironment({ navigator: {}, matchMedia: () => { throw new Error('sin soporte'); } }), { userAgent: '', maxTouchPoints: 0, standalone: false, displayModeStandalone: false });
});

test('sin impresión, el ticket se ve igual pero sin «Imprimir comanda»', () => {
  const order = mapBusinessOrderRow({
    id: 'o1', order_number: 3, status: 'pending', table_label: '4', total_cents: 500, note: 'Sin azúcar', customer_masked: 'Ana G.',
    items: [{ product_id: 'cafes-latte', product_name: 'Latte', quantity: 2, line_total_cents: 500 }], created_at: '2026-11-12T09:00:00Z'
  });
  const printable = renderOrderTicket(order, { businessName: 'Cafetería Spirit - Montcada' });
  const hidden = renderOrderTicket(order, { businessName: 'Cafetería Spirit - Montcada', printable: false });
  assert.match(printable, /data-ticket-print/);
  assert.doesNotMatch(hidden, /data-ticket-print|Imprimir comanda/);
  for (const marker of ['data-ticket-close', 'order-ticket-title', 'ticket__lines', 'data-ticket-total', 'Sin azúcar']) {
    assert.ok(hidden.includes(marker), `${marker} sigue en el ticket`);
  }
});

test('el panel decide una vez y oculta el icono de las tarjetas y el botón del ticket', async () => {
  const source = await readFile(new URL('../business/business-orders.js', import.meta.url), 'utf8');
  assert.match(source, /const printEnabled = canPrintKitchenTicket\(\);/);
  assert.match(source, /const printToolHTML = \(order\) => \(printEnabled && PRINTABLE_STATUSES\.has\(order\.status\)/);
  assert.match(source, /printable: printEnabled \}\);/);
  assert.match(source, /if \(!order \|\| !printEnabled\) return;/);
});

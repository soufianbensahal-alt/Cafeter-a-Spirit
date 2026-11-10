import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapBusinessOrderRow } from '../services/business-order-rows.js';

const panel = await readFile(new URL('../business/business-orders.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../business/business-view.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261111090000_add_business_order_panel.sql', import.meta.url), 'utf8');

test('mapea la fila del panel sin exponer datos personales', () => {
  const order = mapBusinessOrderRow({
    id: 'o1', order_number: 12, service_date: '2026-11-11', status: 'pending', table_label: 'Barra',
    total_cents: 440, note: null, rejection_reason: null, customer_masked: 'Marta S.',
    items: [{ product_id: 'cafes-latte', product_name: 'Latte', quantity: 2, line_total_cents: 440 }],
    created_at: '2026-11-11T10:00:00Z', updated_at: '2026-11-11T10:00:00Z'
  });
  assert.equal(order.number, 12);
  assert.equal(order.customer, 'Marta S.');
  assert.equal(order.note, '');
  assert.deepEqual(order.items, [{ productId: 'cafes-latte', productName: 'Latte', quantity: 2, lineTotalCents: 440 }]);
  assert.ok(Object.isFrozen(order) && Object.isFrozen(order.items[0]));
  assert.equal('customerId' in order, false);
});

test('rechazar abre el modal con el foco en el motivo, nunca en confirmar', () => {
  assert.match(panel, /modal\.open\(rejectDialog\(order\), \{ initialFocus: '#reject-reason' \}\)/);
  // «Volver» va antes que «Rechazar pedido» en el orden del documento.
  const dialog = panel.slice(panel.indexOf('const rejectDialog'), panel.indexOf('const openReject'));
  assert.ok(dialog.indexOf('data-orders-action="close-modal">Volver') < dialog.indexOf('Rechazar pedido</button>'));
});

test('las confirmaciones del panel enfocan la opción segura', () => {
  assert.match(panel, /initialFocus: '\[data-orders-action="close-modal"\]'/);
});

test('las tarjetas se sustituyen por completo en cada reconciliación (sin duplicados)', () => {
  assert.match(panel, /state\.orders = \[\.\.\.orders\]/);
  assert.match(panel, /state\.byId = new Map\(orders\.map/);
});

test('el panel se arranca tras el MFA y se detiene al cerrar o perder la sesión', () => {
  assert.match(view, /await loadHistory\(true\);\s*startOrdersPanel\(\);/);
  assert.equal((view.match(/stopOrdersPanel\(\);/g) || []).length >= 3, true);
});

test('la migración exige AAL2 en la rama de miembro y conserva la del cliente', () => {
  assert.equal((migration.match(/coalesce\(\(select auth\.jwt\(\) ->> 'aal'\), ''\) = 'aal2'/g) || []).length, 2);
  assert.match(migration, /customer_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.is_active_business_member\(v_user_id, p_business_id\)/);
  assert.doesNotMatch(migration, /push_subscriptions/);
});

test('el canal del equipo se une con el token AAL2 vigente, no con el de SIGNED_IN', async () => {
  const service = await readFile(new URL('../services/business-order-service.js', import.meta.url), 'utf8');
  const subscribe = service.slice(service.indexOf('export function subscribeToBusinessOrders'));
  assert.ok(subscribe.indexOf('supabase.realtime.setAuth(token)') > 0);
  assert.ok(subscribe.indexOf('supabase.realtime.setAuth(token)') < subscribe.indexOf('.channel('), 'setAuth antes de unirse');
  assert.match(subscribe, /if \(stopped\) return;/);
});

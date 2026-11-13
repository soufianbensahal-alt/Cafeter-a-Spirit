import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la RPC de vigilancia es sólo para owner/manager y cubre 14 días en Madrid', async () => {
  const sql = await read('supabase/migrations/20261113130000_add_guest_signup_monitor.sql');
  assert.match(sql, /private\.has_business_role\(v_user_id, p_business_id, array\['owner', 'manager'\]\)/);
  assert.match(sql, /generate_series\(0, 13\)/);
  assert.match(sql, /at time zone 'Europe\/Madrid'/);
  assert.match(sql, /revoke all on function public\.get_guest_signups_by_day\(uuid\) from public, anon;/);
});

test('el Panel muestra la tarjeta sólo a owner/manager y no rompe si falla', async () => {
  const panel = await read('business/business-orders.js');
  assert.match(panel, /canManagePilot \? getGuestSignupsByDay\(businessId\)\.catch\(\(\) => null\) : Promise\.resolve\(\[\]\)/);
  assert.match(panel, /\$\{canManagePilot \? guestSignupsHTML\(control\.guestSignups\) : ''\}/);
  assert.match(panel, /<h2 id="control-guests-title">Invitados \(últimos 14 días\)<\/h2>/);
  assert.match(panel, /<caption class="sr-only">Invitados nuevos por día<\/caption>/);
  assert.match(panel, /No se ha podido cargar la vigilancia de invitados\./);
  const service = await read('services/business-order-service.js');
  assert.match(service, /rpc\('get_guest_signups_by_day', \{ p_business_id: businessId \}\)/);
});

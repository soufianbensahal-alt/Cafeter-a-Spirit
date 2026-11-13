import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEGAL_CONTENT } from '../client/legal-content.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('los plazos de la limpieza coinciden con los del borrador de /privacidad', async () => {
  const sql = await read('supabase/migrations/20261113140000_add_data_retention.sql');
  const privacy = LEGAL_CONTENT.es.privacy.sections.find((section) => section.title.startsWith('4.')).items.join('\n');
  const pairs = [
    [/delete from public\.orders\s+where created_at < p_now - interval '12 months'/, 'Pedidos: 12 meses'],
    [/delete from private\.order_code_attempts\s+where attempted_at < p_now - interval '30 days'/, 'Intentos con el código del día y solicitudes de sello o canje caducadas: 30 días'],
    [/delete from public\.stamp_sessions\s+where expires_at < p_now - interval '30 days'/, 'solicitudes de sello o canje caducadas: 30 días'],
    [/delete from public\.reward_notifications\s+where status in \('sent', 'failed'\) and created_at < p_now - interval '90 days'/, 'correos de recompensa: 90 días'],
    [/delete from private\.security_alerts\s+where detected_at < p_now - interval '12 months'/, 'Alertas de seguridad del equipo: 12 meses']
  ];
  for (const [rule, text] of pairs) {
    assert.match(sql, rule);
    assert.ok(privacy.includes(text), text);
  }
  assert.match(sql, /and status not in \('pending', 'accepted', 'preparing'\)/, 'nunca pedidos en curso');
  assert.match(sql, /new\.note := null;\s+new\.guest_name := null;/, 'cuenta borrada: sin nota ni nombre');
  assert.ok(privacy.includes('se borran en ese momento la nota y el nombre'));
  assert.match(sql, /p_dry_run boolean default false/);
  assert.match(sql, /cron\.schedule\('purge-expired-data', '30 3 \* \* \*'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  formatStampCountdown,
  STAMP_REQUEST_DURATION_SECONDS
} from '../services/stamp-expiry-rules.js';

test('la duración compartida del QR es de 90 segundos', () => {
  assert.equal(STAMP_REQUEST_DURATION_SECONDS, 90);
  assert.equal(formatStampCountdown(90), '1 min 30 s');
  assert.equal(formatStampCountdown(59), '59 s');
});

test('la migración amplía la caducidad del servidor a 90 segundos', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260722132037_extend_stamp_request_expiry_to_90_seconds.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /interval '90 seconds'/);
  assert.doesNotMatch(sql, /interval '60 seconds'/);
});

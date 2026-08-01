import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  CUSTOMER_LOGIN_PATH,
  emailConfirmationResultUrl,
  readEmailConfirmationRoute
} from '../services/email-confirmation-route.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('la ruta de verificación acepta solo token_hash con type=email', () => {
  const valid = readEmailConfirmationRoute({
    pathname: '/auth/confirm',
    search: '?token_hash=secure-hash&type=email'
  });
  const wrongType = readEmailConfirmationRoute({
    pathname: '/auth/confirm',
    search: '?token_hash=secure-hash&type=recovery'
  });
  const missing = readEmailConfirmationRoute({ pathname: '/auth/confirm', search: '' });

  assert.deepEqual(valid, {
    active: true,
    shouldVerify: true,
    status: 'processing',
    tokenHash: 'secure-hash',
    type: 'email'
  });
  assert.equal(wrongType.shouldVerify, false);
  assert.equal(wrongType.status, 'invalid');
  assert.equal(missing.shouldVerify, false);
  assert.equal(missing.status, 'invalid');
});

test('los resultados usan URLs públicas sin ningún token', () => {
  assert.equal(emailConfirmationResultUrl('confirmed'), '/email-confirmed');
  assert.equal(emailConfirmationResultUrl('invalid'), '/email-confirmed?status=invalid');
  assert.equal(emailConfirmationResultUrl('network'), '/email-confirmed?status=network');
  assert.equal(CUSTOMER_LOGIN_PATH, '/login');
  for (const status of ['confirmed', 'invalid', 'network']) {
    assert.doesNotMatch(emailConfirmationResultUrl(status), /token|hash/i);
  }
});

test('la aplicación limpia la URL, evita Auth global y ofrece acceso manual', async () => {
  const [app, supabaseClient] = await Promise.all([
    read('../app.js'),
    read('../services/supabase-client.js')
  ]);

  assert.match(app, /window\.history\.replaceState\(\{\}, '', `\$\{emailConfirmationResultUrl\('invalid'\)\}&pending=1`\)/);
  assert.match(app, /if \(emailConfirmationRoute\.active\) \{\s*initializeEmailConfirmation\(\)/);
  assert.match(app, /if \(!emailConfirmationRoute\.active\) try \{/);
  assert.match(app, /data-action="email-confirmation-login"/);
  assert.match(app, /window\.location\.assign\(CUSTOMER_LOGIN_PATH\)/);
  assert.match(supabaseClient, /persistSession: false/);
  assert.match(supabaseClient, /detectSessionInUrl: false/);
});

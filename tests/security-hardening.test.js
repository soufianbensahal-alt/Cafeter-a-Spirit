import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PASSWORD_MIN_LENGTH, passwordMeetsPolicy } from '../services/password-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('la política local y del cliente exige una contraseña robusta', async () => {
  const [config, app] = await Promise.all([
    read('../supabase/config.toml'),
    read('../app.js')
  ]);
  assert.equal(PASSWORD_MIN_LENGTH, 12);
  assert.equal(passwordMeetsPolicy('Spirit-2026-Segura!'), true);
  assert.equal(passwordMeetsPolicy('solo-minusculas-2026'), false);
  assert.match(config, /minimum_password_length = 12/);
  assert.match(config, /password_requirements = "lower_upper_letters_digits_symbols"/);
  assert.match(config, /secure_password_change = true/);
  assert.match(app, /passwordMeetsPolicy/);
});

test('Turnstile y MFA quedan preparados sin exponer secretos en el bundle', async () => {
  const [config, build, captcha, mfa, env] = await Promise.all([
    read('../supabase/config.toml'),
    read('../scripts/build.mjs'),
    read('../services/captcha-service.js'),
    read('../services/mfa-service.js'),
    read('../.env.example')
  ]);
  assert.match(config, /\[auth\.captcha\][\s\S]*enabled = true[\s\S]*provider = "turnstile"/);
  assert.match(config, /secret = "env\(SUPABASE_AUTH_CAPTCHA_SECRET\)"/);
  assert.match(config, /\[auth\.mfa\.totp\][\s\S]*enroll_enabled = true[\s\S]*verify_enabled = true/);
  assert.match(build, /__TURNSTILE_SITE_KEY__/);
  assert.match(captcha, /challenges\.cloudflare\.com\/turnstile/);
  assert.match(mfa, /auth\.mfa\.(?:enroll|challenge|verify)/);
  assert.doesNotMatch(build, /SUPABASE_AUTH_CAPTCHA_SECRET/);
  assert.match(env, /SUPABASE_AUTH_CAPTCHA_SECRET=/);
});

test('MFA se exige también en SQL y los rate limits adquieren locks transaccionales', async () => {
  const migration = await read('../supabase/migrations/20260805183309_phase_1_security_hardening.sql');
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'\) = 'aal2'/);
  assert.match(migration, /stamp_sessions_atomic_creation_limit/);
  assert.match(migration, /stamp_validation_attempts_atomic_limit/);
  assert.ok((migration.match(/pg_advisory_xact_lock/g) || []).length >= 2);
  assert.match(migration, /create table public\.privacy_consents/);
  assert.match(migration, /create table private\.security_alerts/);
  assert.match(migration, /reward_notifications_alert_final_failure/);
});

test('las cabeceras defensivas incluyen CSP sin permitir scripts inline', async () => {
  const vercel = JSON.parse(await read('../vercel.json'));
  const globalHeaders = vercel.headers.find(({ source }) => source === '/(.*)')?.headers || [];
  const headers = Object.fromEntries(globalHeaders.map(({ key, value }) => [key, value]));
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /script-src[^;]*'unsafe-inline'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.ok(headers['Permissions-Policy']);
});

test('los errores del observador Auth ya no se descartan silenciosamente', async () => {
  const auth = await read('../services/auth-service.js');
  assert.match(auth, /catch\(onError\)/);
  assert.match(auth, /reportSecurityError\('password-recovery-signout'/);
  assert.doesNotMatch(auth, /catch\(\(\) => \{\}\)/);
});

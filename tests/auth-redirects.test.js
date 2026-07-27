import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Supabase utiliza el dominio público y permite las dos rutas de retorno', async () => {
  const config = await read('../supabase/config.toml');

  assert.match(config, /site_url = "https:\/\/www\.spiritcoffee\.es"/);
  assert.match(config, /"https:\/\/www\.spiritcoffee\.es\/reset-password"/);
  assert.match(config, /"https:\/\/www\.spiritcoffee\.es\/auth\/callback"/);
  assert.match(config, /"https:\/\/www\.spiritcoffee\.es\/\*\*"/);
});

test('Google y recuperación construyen redirectTo desde el origen desplegado', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://www.spiritcoffee.es' } };
  const siteOrigin = await import(`../services/site-origin.js?test=${Date.now()}`);

  try {
    assert.equal(siteOrigin.getSiteOrigin(), 'https://www.spiritcoffee.es');
    assert.equal(siteOrigin.getGoogleCallbackUrl(), 'https://www.spiritcoffee.es/auth/callback');
    assert.equal(siteOrigin.getPasswordResetUrl(), 'https://www.spiritcoffee.es/reset-password');
    assert.equal(siteOrigin.getEmailConfirmationUrl(), 'https://www.spiritcoffee.es/');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('el flujo real entrega las URLs dinámicas a las funciones de Auth', async () => {
  const customerService = await read('../services/customer-service.js');
  const authService = await read('../services/auth-service.js');

  assert.match(customerService, /redirectTo: getEmailConfirmationUrl\(\)/);
  assert.match(customerService, /signInWithOAuth\(\s*provider,\s*getGoogleCallbackUrl\(\)/);
  assert.match(customerService, /sendPasswordReset\(\s*email,\s*getPasswordResetUrl\(\)/);
  assert.match(authService, /options: \{ redirectTo, skipBrowserRedirect: false \}/);
  assert.match(authService, /emailRedirectTo: redirectTo/);
  assert.match(authService, /\{ redirectTo \}/);
});

test('Vercel reescribe ambas rutas hacia la SPA', async () => {
  const vercelConfig = JSON.parse(await read('../vercel.json'));
  const rewrites = new Map(vercelConfig.rewrites.map(({ source, destination }) => [source, destination]));

  assert.equal(rewrites.get('/reset-password'), '/index.html');
  assert.equal(rewrites.get('/auth/callback'), '/index.html');
});

test('el dominio antiguo no permanece en archivos funcionales o de configuración', async () => {
  const deprecatedHost = new RegExp(`${['cafeteria', 'spirit'].join('-')}\\.vercel\\.app`);
  const files = [
    '../services/site-origin.js',
    '../services/customer-service.js',
    '../services/auth-service.js',
    '../supabase/config.toml',
    '../supabase/functions/send-quick-access-reminders/index.ts'
  ];

  for (const file of files) {
    assert.doesNotMatch(await read(file), deprecatedHost);
  }
});

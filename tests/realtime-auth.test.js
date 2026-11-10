import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { keepRealtimeTokenCurrent, REALTIME_TOKEN_EVENTS } from '../services/realtime-auth.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeClient({ failSetAuth = false } = {}) {
  let listener = null;
  let unsubscribed = false;
  const tokens = [];
  return {
    tokens,
    emit: (event, session) => listener(event, session),
    get unsubscribed() { return unsubscribed; },
    auth: {
      onAuthStateChange: (callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      }
    },
    realtime: {
      setAuth: async (token) => {
        if (failSetAuth) throw new Error('socket');
        tokens.push(token);
      }
    }
  };
}

test('MFA_CHALLENGE_VERIFIED, TOKEN_REFRESHED y SIGNED_IN entregan el token vigente a Realtime', async () => {
  assert.deepEqual([...REALTIME_TOKEN_EVENTS].sort(), ['MFA_CHALLENGE_VERIFIED', 'SIGNED_IN', 'TOKEN_REFRESHED']);
  const client = fakeClient();
  keepRealtimeTokenCurrent(client);
  client.emit('SIGNED_IN', { access_token: 'aal1' });
  client.emit('MFA_CHALLENGE_VERIFIED', { access_token: 'aal2' });
  client.emit('TOKEN_REFRESHED', { access_token: 'aal2-renovado' });
  await flush();
  assert.deepEqual(client.tokens, ['aal1', 'aal2', 'aal2-renovado']);
});

test('otros eventos o sesiones sin token no tocan Realtime', async () => {
  const client = fakeClient();
  keepRealtimeTokenCurrent(client);
  client.emit('INITIAL_SESSION', { access_token: 'x' });
  client.emit('USER_UPDATED', { access_token: 'y' });
  client.emit('SIGNED_OUT', null);
  client.emit('TOKEN_REFRESHED', null);
  await flush();
  assert.deepEqual(client.tokens, []);
});

test('el listener no bloquea ni lanza si setAuth falla, y se puede retirar', async () => {
  const client = fakeClient({ failSetAuth: true });
  const stop = keepRealtimeTokenCurrent(client);
  assert.equal(client.emit('TOKEN_REFRESHED', { access_token: 'z' }), undefined);
  await flush();
  stop();
  assert.equal(client.unsubscribed, true);
});

async function bundleClient(hooks) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../services/supabase-client.js', import.meta.url))],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    define: {
      __SUPABASE_URL__: JSON.stringify('https://example.invalid'),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify('sb_publishable_test'),
      __SPIRIT_E2E_HOOKS__: JSON.stringify(hooks)
    }
  });
  return result.outputFiles[0].text;
}

test('el bundle de producción no contiene el gancho de E2E', async () => {
  assert.doesNotMatch(await bundleClient(false), /__spiritE2E/);
  assert.match(await bundleClient(true), /__spiritE2E/);
});

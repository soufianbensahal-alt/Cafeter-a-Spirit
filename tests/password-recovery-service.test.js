import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';

const {
  createPasswordRecoveryCompleter
} = await import('../services/auth-service.js');

const createAuthClient = (auth) => () => ({ auth });

test('verifica el token en servidor antes de actualizar la contraseña', async () => {
  const calls = [];
  const complete = createPasswordRecoveryCompleter(createAuthClient({
    verifyOtp: async (payload) => {
      calls.push(['verifyOtp', payload]);
      return { data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } }, error: null };
    },
    updateUser: async (payload) => {
      calls.push(['updateUser', payload]);
      return { data: { user: { id: 'user-1' } }, error: null };
    },
    signOut: async (payload) => {
      calls.push(['signOut', payload]);
      return { error: null };
    }
  }));

  await complete('one-time-token-hash', 'a-secure-password');

  assert.deepEqual(calls, [
    ['verifyOtp', { token_hash: 'one-time-token-hash', type: 'recovery' }],
    ['updateUser', { password: 'a-secure-password' }],
    ['signOut', { scope: 'local' }]
  ]);
});

test('dos pestañas concurrentes solo pueden consumir una vez el mismo token', async () => {
  let tokenUsed = false;
  let updates = 0;
  const createClient = () => ({
    auth: {
      verifyOtp: async () => {
        await Promise.resolve();
        if (tokenUsed) {
          return {
            data: { session: null, user: null },
            error: { code: 'otp_expired', message: 'Token has expired or is invalid' }
          };
        }
        tokenUsed = true;
        return {
          data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
          error: null
        };
      },
      updateUser: async () => {
        updates += 1;
        return { data: { user: { id: 'user-1' } }, error: null };
      },
      signOut: async () => ({ error: null })
    }
  });
  const complete = createPasswordRecoveryCompleter(createClient);

  const results = await Promise.allSettled([
    complete('shared-token-hash', 'first-password'),
    complete('shared-token-hash', 'second-password')
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'recovery_link_invalid');
  assert.equal(updates, 1);
});

test('un token inválido nunca llega a updateUser', async () => {
  let updated = false;
  const complete = createPasswordRecoveryCompleter(createAuthClient({
    verifyOtp: async () => ({
      data: { session: null, user: null },
      error: { code: 'otp_expired', message: 'Token expired' }
    }),
    updateUser: async () => {
      updated = true;
      return { data: { user: null }, error: null };
    },
    signOut: async () => ({ error: null })
  }));

  await assert.rejects(
    complete('expired-token-hash', 'unused-password'),
    ({ code }) => code === 'recovery_link_invalid'
  );
  assert.equal(updated, false);
});

test('si Auth rechaza la contraseña después de verificar, exige un enlace nuevo', async () => {
  let signedOut = false;
  const complete = createPasswordRecoveryCompleter(createAuthClient({
    verifyOtp: async () => ({
      data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
      error: null
    }),
    updateUser: async () => ({
      data: { user: null },
      error: { code: 'weak_password', message: 'Password is too weak' }
    }),
    signOut: async () => {
      signedOut = true;
      return { error: null };
    }
  }));

  await assert.rejects(
    complete('consumed-token-hash', 'rejected-password'),
    ({ code }) => code === 'recovery_link_consumed'
  );
  assert.equal(signedOut, true);
});

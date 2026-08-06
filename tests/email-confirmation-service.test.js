import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';

const {
  createEmailConfirmationVerifier
} = await import('../services/auth-service.js');

const createAuthClient = (auth) => () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    ...auth
  }
});

test('confirma con verifyOtp y elimina la sesión temporal antes de resolver', async () => {
  const calls = [];
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async (payload) => {
      calls.push(['verifyOtp', payload]);
      return {
        data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
        error: null
      };
    },
    signOut: async (payload) => {
      calls.push(['signOut', payload]);
      return { error: null };
    }
  }));

  const user = await verify('one-time-token-hash');

  assert.equal(user.id, 'user-1');
  assert.deepEqual(calls, [
    ['verifyOtp', { token_hash: 'one-time-token-hash', type: 'email' }],
    ['signOut', { scope: 'local' }]
  ]);
});

test('un enlace reutilizado o caducado no crea ni conserva una sesión', async () => {
  let signedOut = false;
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async () => ({
      data: { session: null, user: null },
      error: { code: 'otp_expired', message: 'Token has expired or is invalid' }
    }),
    signOut: async () => {
      signedOut = true;
      return { error: null };
    }
  }));

  await assert.rejects(
    verify('expired-token-hash'),
    ({ code }) => code === 'email_confirmation_invalid'
  );
  assert.equal(signedOut, false);
});

test('dos pestañas solo confirman una vez y ambas terminan sin sesión temporal', async () => {
  let tokenUsed = false;
  let temporarySessions = 0;
  const createClient = () => ({
    auth: {
      verifyOtp: async () => {
        await Promise.resolve();
        if (tokenUsed) {
          return {
            data: { session: null, user: null },
            error: { code: 'otp_expired', message: 'Token already used' }
          };
        }
        tokenUsed = true;
        temporarySessions += 1;
        return {
          data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
          error: null
        };
      },
      signOut: async () => {
        temporarySessions -= 1;
        return { error: null };
      },
      getSession: async () => ({ data: { session: null }, error: null })
    }
  });
  const verify = createEmailConfirmationVerifier(createClient);

  const results = await Promise.allSettled([
    verify('shared-token-hash'),
    verify('shared-token-hash')
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'email_confirmation_invalid');
  assert.equal(temporarySessions, 0);
});

test('parámetros ausentes se rechazan antes de llamar a Supabase', async () => {
  let verified = false;
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async () => {
      verified = true;
      return { data: {}, error: null };
    },
    signOut: async () => ({ error: null })
  }));

  await assert.rejects(
    verify(''),
    ({ code }) => code === 'email_confirmation_invalid'
  );
  assert.equal(verified, false);
});

test('un fallo de red se diferencia de un token inválido', async () => {
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async () => {
      throw new TypeError('Failed to fetch');
    },
    signOut: async () => ({ error: null })
  }));

  await assert.rejects(verify('valid-looking-token'), ({ code }) => code === 'network_error');
});

test('si no puede cerrarse la sesión temporal nunca informa de acceso confirmado', async () => {
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async () => ({
      data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
      error: null
    }),
    signOut: async () => ({
      error: { code: 'request_failed', message: 'Logout request failed' }
    })
  }));

  await assert.rejects(
    verify('one-time-token-hash'),
    ({ code }) => code === 'email_confirmation_cleanup_failed'
  );
});

test('si la sesión temporal continúa activa nunca informa de acceso confirmado', async () => {
  const verify = createEmailConfirmationVerifier(createAuthClient({
    verifyOtp: async () => ({
      data: { session: { access_token: 'temporary' }, user: { id: 'user-1' } },
      error: null
    }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({
      data: { session: { access_token: 'temporary' } },
      error: null
    })
  }));

  await assert.rejects(
    verify('one-time-token-hash'),
    ({ code }) => code === 'email_confirmation_cleanup_failed'
  );
});

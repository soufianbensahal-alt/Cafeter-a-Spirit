import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';

const { customerSignUpResult } = await import('../services/customer-service.js');

test('el alta con confirmación obligatoria conserva la sesión nula', async () => {
  let contextLoaded = false;
  const result = await customerSignUpResult(
    { user: { id: 'pending-user' }, session: null },
    async () => {
      contextLoaded = true;
      return {};
    }
  );

  assert.deepEqual(result, { confirmationRequired: true, context: null });
  assert.equal(contextLoaded, false);
});

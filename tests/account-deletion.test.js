import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clearSpiritApplicationStorage } from '../services/session-persistence.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';
const accountDeletionModule = import('../services/account-deletion-service.js');

const memoryStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
};

test('el cliente invoca delete-account con su token y sin enviar user_id', async () => {
  const { createAccountDeletionRequester } = await accountDeletionModule;
  let invocation;
  const requester = createAccountDeletionRequester(() => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'customer-jwt' } },
        error: null
      })
    },
    functions: {
      invoke: async (...args) => {
        invocation = args;
        return { data: { success: true }, error: null };
      }
    }
  }));

  assert.equal(await requester(), true);
  assert.equal(invocation[0], 'delete-account');
  assert.deepEqual(invocation[1], {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-jwt' }
  });
  assert.equal('body' in invocation[1], false);
});

test('una sesión ausente detiene la eliminación antes de invocar la función', async () => {
  const {
    AccountDeletionError,
    createAccountDeletionRequester
  } = await accountDeletionModule;
  let invoked = false;
  const requester = createAccountDeletionRequester(() => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null })
    },
    functions: {
      invoke: async () => {
        invoked = true;
        return { data: null, error: null };
      }
    }
  }));

  await assert.rejects(requester, (error) => (
    error instanceof AccountDeletionError
    && error.code === 'not_authenticated'
    && error.status === 401
  ));
  assert.equal(invoked, false);
});

test('un 401 remoto se presenta como sesión no válida sin cerrar la cuenta local', async () => {
  const {
    AccountDeletionError,
    createAccountDeletionRequester
  } = await accountDeletionModule;
  const requester = createAccountDeletionRequester(() => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'expired-jwt' } },
        error: null
      })
    },
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          context: new Response(
            JSON.stringify({ error: 'not_authenticated' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        }
      })
    }
  }));

  await assert.rejects(requester, (error) => (
    error instanceof AccountDeletionError
    && error.code === 'not_authenticated'
    && error.status === 401
  ));
});

test('la limpieza posterior elimina solo datos de Spirit y tokens Auth', () => {
  const local = memoryStorage({
    'spirit-language': 'ca',
    'spirit-theme': 'dark',
    'sb-project-auth-token': 'secret',
    unrelated: 'preserve'
  });
  const session = memoryStorage({
    'spirit-seen': '1',
    'sb-project-auth-token-code-verifier': 'secret',
    another: 'preserve'
  });

  clearSpiritApplicationStorage(local, session);

  assert.equal(local.getItem('spirit-language'), null);
  assert.equal(local.getItem('sb-project-auth-token'), null);
  assert.equal(session.getItem('spirit-seen'), null);
  assert.equal(session.getItem('sb-project-auth-token-code-verifier'), null);
  assert.equal(local.getItem('unrelated'), 'preserve');
  assert.equal(session.getItem('another'), 'preserve');
});

test('la interfaz exige ELIMINAR, bloquea dobles clics y conserva el modal en error', async () => {
  const app = await read('app.js');

  assert.match(app, /dangerZone: 'Zona peligrosa'/);
  assert.match(app, /deleteAccountConfirmation: 'ELIMINAR'/);
  assert.match(app, /data-delete-account-submit disabled/);
  assert.match(app, /value!==t\('deleteAccountConfirmation'\)/);
  assert.match(app, /if \(state\.accountDeleting\) return/);
  assert.match(app, /Eliminando cuenta…/);
  assert.match(app, /form\.closest\('\[data-delete-account-modal\]'\)\?\.removeAttribute/);
  assert.match(app, /Tu cuenta ha sido eliminada correctamente\./);
});

test('la Edge Function obtiene la identidad del JWT y borra solo ese usuario', async () => {
  const edgeFunction = await read('supabase/functions/delete-account/index.ts');

  assert.match(edgeFunction, /authClient\.auth\.getUser\(accessToken\)/);
  assert.match(edgeFunction, /adminClient\.auth\.admin\.deleteUser\(\s*authentication\.user\.id/);
  assert.match(edgeFunction, /not_authenticated/);
  assert.doesNotMatch(edgeFunction, /request\.json\(\)/);
  assert.doesNotMatch(edgeFunction, /user_id/);
});

test('la migración elimina datos cliente y anonimiza auditoría de empleados', async () => {
  const migration = await read(
    'supabase/migrations/20260729171931_harden_account_deletion_cascades.sql'
  );

  assert.match(migration, /customer_cards_customer_id_fkey[\s\S]*on delete cascade/);
  assert.match(migration, /stamp_sessions_customer_card_id_fkey[\s\S]*on delete cascade/);
  assert.match(migration, /stamp_transactions_customer_card_id_fkey[\s\S]*on delete cascade/);
  assert.match(migration, /stamp_transactions_employee_id_fkey[\s\S]*on delete set null/);
  assert.match(migration, /on delete set null \(employee_id\)/);
});

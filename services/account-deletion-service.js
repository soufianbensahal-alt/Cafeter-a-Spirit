import { requireSupabase } from './supabase-client.js';

export class AccountDeletionError extends Error {
  constructor(code, message, { status = 0, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AccountDeletionError';
    this.code = code;
    this.status = status;
  }
}

const normalizeDeletionError = (error) => {
  if (error instanceof AccountDeletionError) return error;
  const networkFailure = error?.name === 'TypeError'
    || /fetch|network/i.test(error?.message || '');
  return new AccountDeletionError(
    networkFailure ? 'network_error' : 'account_deletion_failed',
    networkFailure
      ? 'No se ha podido conectar con Spirit.'
      : 'No se ha podido eliminar la cuenta.',
    { status: Number(error?.context?.status || error?.status || 0), cause: error }
  );
};

const readFunctionError = async (error) => {
  const status = Number(error?.context?.status || error?.status || 0);
  let remoteCode = '';
  try {
    const response = error?.context;
    if (typeof response?.clone === 'function') {
      const payload = await response.clone().json();
      remoteCode = String(payload?.error || payload?.code || '');
    }
  } catch {}

  if (status === 401 || /unauthorized|not_authenticated/i.test(remoteCode)) {
    return new AccountDeletionError(
      'not_authenticated',
      'La sesión ya no es válida.',
      { status: 401, cause: error }
    );
  }

  return normalizeDeletionError(error);
};

export const createAccountDeletionRequester = (
  getClient = requireSupabase
) => async () => {
  const client = getClient();

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new AccountDeletionError(
        'not_authenticated',
        'No existe una sesión activa.',
        { status: 401 }
      );
    }

    const { data, error } = await client.functions.invoke('delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (error) throw await readFunctionError(error);
    if (data?.success !== true) {
      throw new AccountDeletionError(
        data?.error || 'invalid_response',
        'La respuesta de eliminación no es válida.'
      );
    }

    return true;
  } catch (error) {
    throw normalizeDeletionError(error);
  }
};

export const deleteCustomerAccount = createAccountDeletionRequester();

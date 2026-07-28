import {
  createIsolatedSupabaseClient,
  requireSupabase
} from './supabase-client.js';

export class AuthServiceError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

const isMissingSession = (error) => error?.name === 'AuthSessionMissingError'
  || error?.code === 'session_not_found'
  || /auth session missing/i.test(error?.message || '');

const authError = (error, fallbackCode = 'auth_error') => {
  if (error instanceof AuthServiceError) return error;
  if (error?.name === 'TypeError' || /fetch|network/i.test(error?.message || '')) {
    return new AuthServiceError('network_error', 'No se ha podido conectar con Spirit. Revisa tu conexión.', error);
  }
  return new AuthServiceError(error?.code || fallbackCode, error?.message || 'No se ha podido completar la autenticación.', error);
};

export async function signInWithEmail(email, password) {
  try {
    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password
    });
    if (error) throw error;
    if (!data.user) throw new AuthServiceError('invalid_session', 'No se ha podido validar la sesión.');
    return data;
  } catch (error) {
    throw authError(error, 'sign_in_failed');
  }
}

export async function signInWithOAuth(provider, redirectTo) {
  if (provider !== 'google') {
    throw new AuthServiceError('unsupported_provider', 'Proveedor de acceso no compatible.');
  }
  try {
    const { data, error } = await requireSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: false }
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw authError(error, 'oauth_sign_in_failed');
  }
}

export async function signUpWithEmail({ email, password, displayName, redirectTo }) {
  try {
    const { data, error } = await requireSupabase().auth.signUp({
      email: String(email || '').trim().toLowerCase(),
      password,
      options: {
        data: { display_name: String(displayName || '').trim() },
        emailRedirectTo: redirectTo
      }
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw authError(error, 'sign_up_failed');
  }
}

export async function getCurrentUser() {
  try {
    const { data, error } = await requireSupabase().auth.getUser();
    if (error && isMissingSession(error)) return null;
    if (error) throw error;
    return data.user || null;
  } catch (error) {
    if (isMissingSession(error)) return null;
    throw authError(error, 'session_check_failed');
  }
}

export async function signOut() {
  try {
    const { error } = await requireSupabase().auth.signOut();
    if (error && !isMissingSession(error)) throw error;
  } catch (error) {
    if (!isMissingSession(error)) throw authError(error, 'sign_out_failed');
  }
}

export async function signOutCurrentSession() {
  try {
    const { error } = await requireSupabase().auth.signOut({ scope: 'local' });
    if (error && !isMissingSession(error)) throw error;
  } catch (error) {
    if (!isMissingSession(error)) throw authError(error, 'sign_out_failed');
  }
}

export async function sendPasswordReset(email, redirectTo) {
  try {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(
      String(email || '').trim().toLowerCase(),
      { redirectTo }
    );
    if (error) throw error;
  } catch (error) {
    throw authError(error, 'password_reset_failed');
  }
}

export async function updatePassword(password) {
  try {
    const { data, error } = await requireSupabase().auth.updateUser({ password });
    if (error) throw error;
    return data.user;
  } catch (error) {
    throw authError(error, 'password_update_failed');
  }
}

const invalidRecoveryCodes = new Set([
  'access_denied',
  'bad_jwt',
  'flow_state_expired',
  'flow_state_not_found',
  'invalid_grant',
  'otp_expired',
  'session_not_found',
  'token_not_found'
]);

const recoveryError = (error) => {
  const normalized = authError(error, 'password_recovery_failed');
  if (
    invalidRecoveryCodes.has(normalized.code)
    || /expired|invalid|already been used|token/i.test(normalized.message)
  ) {
    return new AuthServiceError(
      'recovery_link_invalid',
      'El enlace de recuperación ha caducado o ya se ha utilizado.',
      error
    );
  }
  return normalized;
};

export const createPasswordRecoveryCompleter = (
  createRecoveryClient = createIsolatedSupabaseClient
) => async (tokenHash, password) => {
  const cleanTokenHash = String(tokenHash || '').trim();
  if (!cleanTokenHash) {
    throw new AuthServiceError(
      'recovery_link_invalid',
      'El enlace de recuperación ha caducado o ya se ha utilizado.'
    );
  }

  const recoveryClient = createRecoveryClient();
  let recoverySessionCreated = false;
  let verificationSucceeded = false;

  try {
    const { data: verification, error: verificationError } = await recoveryClient.auth.verifyOtp({
      token_hash: cleanTokenHash,
      type: 'recovery'
    });
    if (verificationError) throw verificationError;
    if (!verification?.session || !verification?.user) {
      throw new AuthServiceError(
        'recovery_link_invalid',
        'El enlace de recuperación ha caducado o ya se ha utilizado.'
      );
    }

    recoverySessionCreated = true;
    verificationSucceeded = true;
    const { data, error } = await recoveryClient.auth.updateUser({ password });
    if (error) throw error;
    if (!data?.user) {
      throw new AuthServiceError(
        'password_update_failed',
        'No se ha podido actualizar la contraseña.'
      );
    }
    return data.user;
  } catch (error) {
    if (verificationSucceeded) {
      throw new AuthServiceError(
        'recovery_link_consumed',
        'El enlace se ha verificado, pero no se ha podido actualizar la contraseña. Solicita uno nuevo.',
        error
      );
    }
    throw recoveryError(error);
  } finally {
    if (recoverySessionCreated) {
      try {
        await recoveryClient.auth.signOut({ scope: 'local' });
      } catch {}
    }
  }
};

export const completePasswordRecovery = createPasswordRecoveryCompleter();

export async function reauthenticateAndUpdatePassword(email, currentPassword, nextPassword) {
  await signInWithEmail(email, currentPassword);
  return updatePassword(nextPassword);
}

export function subscribeToAuthChanges(handler) {
  const { data } = requireSupabase().auth.onAuthStateChange((event, session) => {
    queueMicrotask(() => {
      Promise.resolve(handler(event, session?.user || null)).catch(() => {});
    });
  });
  return () => data.subscription.unsubscribe();
}

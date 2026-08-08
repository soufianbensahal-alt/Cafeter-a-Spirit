import { requireSupabase } from './supabase-client.js';
export {
  createPrivilegedSessionMonitor,
  PRIVILEGED_SESSION_ACTIVITY_KEY,
  PRIVILEGED_SESSION_INACTIVITY_MS,
  PRIVILEGED_SESSION_MAX_DURATION_MS,
  PRIVILEGED_SESSION_TOUCH_INTERVAL_MS
} from './privileged-session-policy.js';

export class PrivilegedSessionError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PrivilegedSessionError';
    this.code = code;
  }
}

const firstRow = (data) => Array.isArray(data) ? data[0] : data;

const sessionError = (error, fallbackCode = 'privileged_session_error') => {
  if (error instanceof PrivilegedSessionError) return error;
  if (error?.name === 'TypeError' || /fetch|network/i.test(error?.message || '')) {
    return new PrivilegedSessionError(
      'network_error',
      'No se ha podido comprobar la sesión segura. Revisa tu conexión.',
      error
    );
  }
  return new PrivilegedSessionError(
    error?.code || fallbackCode,
    error?.message || 'No se ha podido comprobar la sesión segura.',
    error
  );
};

const normalizedSession = (data) => {
  const row = firstRow(data);
  if (!row || row.status !== 'active' || !row.expires_at) {
    const code = row?.status || 'invalid_response';
    const message = code === 'expired'
      ? 'La sesión del modo cafetería ha caducado por tiempo o inactividad.'
      : 'Vuelve a verificar tu identidad para acceder al modo cafetería.';
    throw new PrivilegedSessionError(code, message);
  }
  return Object.freeze({
    status: row.status,
    expiresAt: row.expires_at,
    inactivityTimeoutMs: Number(row.inactivity_timeout_seconds || 1800) * 1000
  });
};

async function runSessionRpc(name, businessId) {
  try {
    const { data, error } = await requireSupabase().rpc(name, {
      p_business_id: businessId
    });
    if (error) throw error;
    return normalizedSession(data);
  } catch (error) {
    throw sessionError(error);
  }
}

export function startPrivilegedBusinessSession(businessId) {
  return runSessionRpc('start_privileged_business_session', businessId);
}

export function touchPrivilegedBusinessSession(businessId) {
  return runSessionRpc('touch_privileged_business_session', businessId);
}

export async function endPrivilegedBusinessSession(businessId) {
  try {
    const { data, error } = await requireSupabase().rpc('end_privileged_business_session', {
      p_business_id: businessId
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    throw sessionError(error, 'privileged_session_end_failed');
  }
}

// Red de «Pedir sin cuenta»: sesión anónima de Supabase, disponibilidad del
// modo invitado. Sin conversión en cuenta: quien quiera sellos se registra
// desde el inicio de la app.
import { requireSupabase, supabaseConfiguration } from './supabase-client.js';
import { guestOrderingAvailable } from './guest-rules.js';

export class GuestServiceError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = 'GuestServiceError';
    this.code = code;
  }
}

const toGuestError = (error, fallback) => {
  if (error instanceof GuestServiceError) return error;
  const message = String(error?.message || '');
  if (error?.name === 'TypeError' || /fetch|network|load failed/i.test(message)) return new GuestServiceError('network_error', error);
  if (error?.code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(message)) return new GuestServiceError('guest_disabled', error);
  if (/captcha/i.test(message)) return new GuestServiceError('captcha_failed', error);
  return new GuestServiceError(error?.code || fallback, error);
};

// Interruptor del local (sin sesión, rol anon).
async function localGuestStatus() {
  const { data, error } = await requireSupabase().rpc('get_guest_ordering_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.available === true;
}

// ¿Admite Supabase Auth inicios anónimos? Endpoint público de ajustes de Auth.
async function anonymousSignInsEnabled(fetchImpl = globalThis.fetch) {
  const { url, publishableKey } = supabaseConfiguration;
  const response = await fetchImpl(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey } });
  if (!response.ok) throw new Error(`auth_settings_${response.status}`);
  const settings = await response.json();
  return settings?.external?.anonymous_users === true;
}

// ¿Se puede pedir sin cuenta ahora? Las dos condiciones a la vez; si falla
// cualquiera de las consultas no se ofrece el modo invitado.
export async function getGuestOrderingStatus() {
  try {
    const [statusAvailable, anonymousEnabled] = await Promise.all([localGuestStatus(), anonymousSignInsEnabled()]);
    return guestOrderingAvailable({ statusAvailable, anonymousEnabled });
  } catch {
    return false;
  }
}

export async function signInAsGuest({ captchaToken } = {}) {
  try {
    const { data, error } = await requireSupabase().auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
    if (error) throw error;
    if (!data?.user?.is_anonymous) throw new GuestServiceError('guest_start_failed');
    return data.user;
  } catch (error) {
    throw toGuestError(error, 'guest_start_failed');
  }
}

// Red de «Pedir sin cuenta»: sesión anónima de Supabase, disponibilidad del
// modo invitado y conversión en cuenta normal (misma fila, mismos pedidos).
import { requireSupabase, supabaseConfiguration } from './supabase-client.js';
import { guestConversionMetadata, guestOrderingAvailable } from './guest-rules.js';

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
  if (error?.code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) return new GuestServiceError('email_exists', error);
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

// Paso 1: vincula el correo (Supabase envía la plantilla «email_change»).
export async function startGuestConversion({ email, firstName, lastName, consent }) {
  try {
    const { data, error } = await requireSupabase().auth.updateUser({
      email: String(email || '').trim().toLowerCase(),
      data: guestConversionMetadata({ firstName, lastName, consent })
    });
    if (error) throw error;
    return data.user;
  } catch (error) {
    throw toGuestError(error, 'guest_conversion_failed');
  }
}

// Al abrir el enlace: verifica el cambio de correo en la sesión principal. La
// cuenta deja de ser anónima y conserva su id (y, por tanto, sus pedidos).
export async function confirmGuestConversion(tokenHash) {
  try {
    const { data, error } = await requireSupabase().auth.verifyOtp({ token_hash: String(tokenHash || '').trim(), type: 'email_change' });
    if (error) throw error;
    if (!data?.user) throw new GuestServiceError('guest_conversion_invalid');
    return data.user;
  } catch (error) {
    throw toGuestError(error, 'guest_conversion_invalid');
  }
}

// Paso 2: la contraseña, ya con el correo verificado.
export async function setConvertedAccountPassword(password) {
  try {
    const { data, error } = await requireSupabase().auth.updateUser({ password });
    if (error) throw error;
    return data.user;
  } catch (error) {
    throw toGuestError(error, 'guest_password_failed');
  }
}

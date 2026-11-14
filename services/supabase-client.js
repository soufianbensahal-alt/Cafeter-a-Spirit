import { createClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './session-persistence.js';
import { keepRealtimeTokenCurrent } from './realtime-auth.js';

const supabaseUrl = __SUPABASE_URL__;
const supabasePublishableKey = __SUPABASE_PUBLISHABLE_KEY__;
const isEmailConfirmationVerificationRoute = typeof window !== 'undefined'
  && /^\/auth\/confirm\/?$/.test(window.location.pathname);

export const supabaseConfiguration = Object.freeze({
  url: supabaseUrl,
  // Clave publicable (pública por diseño): para endpoints públicos de Auth.
  publishableKey: supabasePublishableKey,
  configured: Boolean(supabaseUrl && supabasePublishableKey),
  missing: [
    !supabaseUrl && 'SUPABASE_URL',
    !supabasePublishableKey && 'SUPABASE_PUBLISHABLE_KEY'
  ].filter(Boolean)
});

export const supabase = supabaseConfiguration.configured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: !isEmailConfirmationVerificationRoute,
        storage: supabaseAuthStorage
      }
    })
  : null;

if (supabase) keepRealtimeTokenCurrent(supabase);

// Solo en builds de E2E (SPIRIT_E2E_HOOKS=1): permite forzar la renovación de
// la sesión desde Playwright. En producción la constante es false y esbuild
// elimina este bloque del bundle.
// typeof: los tests de Node importan este módulo sin pasar por esbuild. Debe
// ir en línea dentro del if para que esbuild pliegue la constante y elimine el bloque.
if (typeof __SPIRIT_E2E_HOOKS__ !== 'undefined' && __SPIRIT_E2E_HOOKS__ && supabase && typeof window !== 'undefined') {
  window.__spiritE2E = Object.freeze({
    refreshSession: async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const claims = JSON.parse(atob(data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { aal: claims.aal, expiresAt: data.session.expires_at };
    },
    realtimeTokenIsCurrent: async () => {
      const { data } = await supabase.auth.getSession();
      return supabase.realtime.accessTokenValue === data.session?.access_token;
    }
  });
}

export function requireSupabase() {
  if (!supabase) {
    const error = new Error(`Falta configurar: ${supabaseConfiguration.missing.join(', ')}`);
    error.name = 'SupabaseConfigurationError';
    throw error;
  }
  return supabase;
}

export function createIsolatedSupabaseClient() {
  if (!supabaseConfiguration.configured) {
    requireSupabase();
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

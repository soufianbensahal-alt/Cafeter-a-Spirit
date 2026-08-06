import { createClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './session-persistence.js';

const supabaseUrl = __SUPABASE_URL__;
const supabasePublishableKey = __SUPABASE_PUBLISHABLE_KEY__;
const isEmailConfirmationVerificationRoute = typeof window !== 'undefined'
  && /^\/auth\/confirm\/?$/.test(window.location.pathname);

export const supabaseConfiguration = Object.freeze({
  url: supabaseUrl,
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

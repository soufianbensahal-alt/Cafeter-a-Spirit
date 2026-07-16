import { createClient } from '@supabase/supabase-js';

const supabaseUrl = __SUPABASE_URL__;
const supabasePublishableKey = __SUPABASE_PUBLISHABLE_KEY__;

export const supabaseConfiguration = Object.freeze({
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
        detectSessionInUrl: true
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

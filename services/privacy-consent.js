// Reconsentimiento de la política de privacidad: lectura y registro.
import { requireSupabase } from './supabase-client.js';

export { needsReconsent } from './privacy-consent-rules.js';

// Última versión aceptada por el usuario actual (RLS: sólo las suyas).
export async function getLatestAcceptedPolicyVersion() {
  const { data, error } = await requireSupabase()
    .from('privacy_consents')
    .select('policy_version')
    .order('policy_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.policy_version || null;
}

export async function acceptPrivacyPolicy(version) {
  const { data, error } = await requireSupabase().rpc('accept_privacy_policy', { p_version: version });
  if (error) throw error;
  if (data !== 'ok') throw new Error(String(data || 'consent_failed'));
}

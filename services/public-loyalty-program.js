// Programa de sellos activo, sin sesión (rol anon): sólo stamps_required y
// reward_description, vía get_public_loyalty_program. Para la promoción de
// registro; si falla o tarda, null y el texto va sin número.
import { requireSupabase } from './supabase-client.js';
import { promoStampsRequired } from '../client/signup-promo.js';

export const PUBLIC_PROGRAM_TIMEOUT_MS = 4000;

export async function getPublicLoyaltyProgram({ timeoutMs = PUBLIC_PROGRAM_TIMEOUT_MS } = {}) {
  let timer = 0;
  try {
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ data: null, error: new Error('timeout') }), timeoutMs); });
    const { data, error } = await Promise.race([requireSupabase().rpc('get_public_loyalty_program'), timeout]);
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const stampsRequired = promoStampsRequired(row?.stamps_required);
    return stampsRequired ? { stampsRequired } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

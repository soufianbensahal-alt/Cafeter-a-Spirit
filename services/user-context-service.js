import { requireSupabase } from './supabase-client.js';
import { getCurrentUser } from './auth-service.js';
import { deriveUserContexts } from './user-context-rules.js';

export { deriveUserContexts } from './user-context-rules.js';

export async function getUserContexts(authenticatedUser) {
  const user = authenticatedUser || await getCurrentUser();
  if (!user) return null;
  const supabase = requireSupabase();
  const [profileResult, cardsResult, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    supabase.from('customer_cards').select('id, current_stamps, available_rewards, updated_at, program:loyalty_programs(id, name, stamps_required, reward_description, active)').eq('customer_id', user.id),
    supabase.from('business_members').select('id, role, active, business:businesses(id, name, active)').eq('user_id', user.id)
  ]);
  const error = profileResult.error || cardsResult.error || membershipsResult.error;
  if (error) throw error;
  return deriveUserContexts({
    user,
    profile: profileResult.data,
    customerCards: cardsResult.data || [],
    businessMemberships: membershipsResult.data || []
  });
}

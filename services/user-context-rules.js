const EMPLOYEE_ROLES = new Set(['owner', 'manager', 'employee']);

export function deriveUserContexts({ user, profile, customerCards = [], businessMemberships = [] }) {
  const activeMemberships = businessMemberships.filter((membership) => {
    const business = Array.isArray(membership.business) ? membership.business[0] : membership.business;
    return membership.active && business?.active && EMPLOYEE_ROLES.has(membership.role);
  });
  const providerName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim();
  const displayName = String(profile?.display_name || providerName).trim();
  const emailPrefix = user?.email?.split('@')[0] || '';
  return Object.freeze({
    userId: user?.id || '',
    email: user?.email || '',
    displayName: displayName || emailPrefix || 'Cliente Spirit',
    needsProfileCompletion: !providerName && (!displayName || displayName === emailPrefix),
    isCustomer: customerCards.length > 0,
    customerCards: Object.freeze(customerCards),
    hasBusinessAccess: activeMemberships.length > 0,
    allBusinessMemberships: Object.freeze(businessMemberships),
    businessMemberships: Object.freeze(activeMemberships),
    routes: Object.freeze({ customer: '/', business: '/cafeteria' })
  });
}

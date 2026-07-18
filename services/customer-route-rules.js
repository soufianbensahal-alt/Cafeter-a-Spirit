export function initialCustomerScreen({ passwordRecovery = false, oauthCallback = false } = {}) {
  if (passwordRecovery) return 'login';
  if (oauthCallback) return 'authLoading';
  return 'intro';
}

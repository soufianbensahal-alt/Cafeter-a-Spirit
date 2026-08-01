export function initialCustomerScreen({ passwordRecovery = false } = {}) {
  if (passwordRecovery) return 'login';
  return 'intro';
}

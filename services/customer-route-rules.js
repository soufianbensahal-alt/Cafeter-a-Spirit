export function initialCustomerScreen({
  passwordRecovery = false,
  emailConfirmation = false,
  login = false
} = {}) {
  if (emailConfirmation) return 'emailConfirmation';
  if (passwordRecovery) return 'login';
  if (login) return 'login';
  return 'intro';
}

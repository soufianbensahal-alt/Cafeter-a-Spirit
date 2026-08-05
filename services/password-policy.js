export const PASSWORD_MIN_LENGTH = 12;

export const passwordMeetsPolicy = (password) => (
  String(password || '').length >= PASSWORD_MIN_LENGTH
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[^A-Za-z0-9]/.test(password)
);

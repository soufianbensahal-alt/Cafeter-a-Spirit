export const EMAIL_CONFIRMATION_VERIFY_PATH = '/auth/confirm';
export const EMAIL_CONFIRMATION_RESULT_PATH = '/email-confirmed';
export const CUSTOMER_LOGIN_PATH = '/login';

const normalizedPath = (pathname = '/') => {
  const clean = String(pathname || '/').replace(/\/+$/, '');
  return clean || '/';
};

export function readEmailConfirmationRoute(location = window.location) {
  const pathname = normalizedPath(location.pathname);
  const query = new URLSearchParams(location.search || '');
  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));

  if (pathname === EMAIL_CONFIRMATION_VERIFY_PATH) {
    const tokenHash = String(query.get('token_hash') || '').trim();
    const type = String(query.get('type') || '').trim();
    const implicitType = String(hash.get('type') || '').trim();
    const implicitCallback = Boolean(hash.get('access_token'))
      && Boolean(hash.get('refresh_token'))
      && implicitType === 'signup';
    const shouldVerify = Boolean(tokenHash) && type === 'email';
    return Object.freeze({
      active: true,
      shouldVerify,
      shouldConsumeSession: implicitCallback,
      status: shouldVerify || implicitCallback ? 'processing' : 'invalid',
      tokenHash,
      type
    });
  }

  if (pathname === EMAIL_CONFIRMATION_RESULT_PATH) {
    const requestedStatus = query.get('status');
    return Object.freeze({
      active: true,
      shouldVerify: false,
      shouldConsumeSession: false,
      status: requestedStatus === 'invalid' || requestedStatus === 'network'
        ? requestedStatus
        : 'confirmed',
      tokenHash: '',
      type: ''
    });
  }

  return Object.freeze({
    active: false,
    shouldVerify: false,
    shouldConsumeSession: false,
    status: '',
    tokenHash: '',
    type: ''
  });
}

export const emailConfirmationResultUrl = (status) => (
  status === 'confirmed'
    ? EMAIL_CONFIRMATION_RESULT_PATH
    : `${EMAIL_CONFIRMATION_RESULT_PATH}?status=${status === 'network' ? 'network' : 'invalid'}`
);

export const isCustomerLoginRoute = (pathname = window.location.pathname) => (
  normalizedPath(pathname) === CUSTOMER_LOGIN_PATH
);

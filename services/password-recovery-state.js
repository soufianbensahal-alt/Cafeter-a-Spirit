export const PASSWORD_RECOVERY_PENDING_KEY = 'spirit-password-recovery-pending';
export const PASSWORD_RECOVERY_TOKEN_KEY = 'spirit-password-recovery-token';

const safeGet = (storage, key) => {
  try { return storage?.getItem(key) ?? null; }
  catch { return null; }
};

const safeSet = (storage, key, value) => {
  try { storage?.setItem(key, value); }
  catch {}
};

const safeRemove = (storage, key) => {
  try { storage?.removeItem(key); }
  catch {}
};

export function hasPasswordRecoverySignal(location = globalThis.location) {
  const pathname = String(location?.pathname || '');
  const query = new URLSearchParams(String(location?.search || ''));
  const hash = new URLSearchParams(String(location?.hash || '').replace(/^#/, ''));

  return /^\/reset-password\/?$/.test(pathname)
    || query.get('auth') === 'recovery'
    || (query.get('type') === 'recovery' && Boolean(query.get('token_hash')))
    || hash.get('type') === 'recovery';
}

export function createPasswordRecoveryState(
  storage = globalThis.sessionStorage,
  location = globalThis.location
) {
  const query = () => new URLSearchParams(String(location?.search || ''));
  const tokenFromLocation = () => {
    const parameters = query();
    return parameters.get('type') === 'recovery'
      ? String(parameters.get('token_hash') || '').trim()
      : '';
  };
  const hasSignal = () => hasPasswordRecoverySignal(location);
  const isPending = () => hasSignal()
    || safeGet(storage, PASSWORD_RECOVERY_PENDING_KEY) === 'true';
  const getTokenHash = () => tokenFromLocation()
    || safeGet(storage, PASSWORD_RECOVERY_TOKEN_KEY)
    || '';
  const markPending = () => {
    safeSet(storage, PASSWORD_RECOVERY_PENDING_KEY, 'true');
    const tokenHash = tokenFromLocation();
    if (tokenHash) safeSet(storage, PASSWORD_RECOVERY_TOKEN_KEY, tokenHash);
    return true;
  };
  const clearPending = () => {
    safeRemove(storage, PASSWORD_RECOVERY_PENDING_KEY);
    return false;
  };
  const clear = () => {
    clearPending();
    safeRemove(storage, PASSWORD_RECOVERY_TOKEN_KEY);
  };

  if (hasSignal()) markPending();

  return {
    clear,
    clearPending,
    getTokenHash,
    hasSignal,
    isPending,
    markPending
  };
}

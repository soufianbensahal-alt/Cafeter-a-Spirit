export const PASSWORD_RECOVERY_PENDING_KEY = 'spirit-password-recovery-pending';

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
    || hash.get('type') === 'recovery';
}

export function createPasswordRecoveryState(
  storage = globalThis.localStorage,
  location = globalThis.location
) {
  const hasSignal = () => hasPasswordRecoverySignal(location);
  const isPending = () => hasSignal()
    || safeGet(storage, PASSWORD_RECOVERY_PENDING_KEY) === 'true';
  const markPending = () => {
    safeSet(storage, PASSWORD_RECOVERY_PENDING_KEY, 'true');
    return true;
  };
  const clearPending = () => {
    safeRemove(storage, PASSWORD_RECOVERY_PENDING_KEY);
    return false;
  };

  if (hasSignal()) markPending();

  return { hasSignal, isPending, markPending, clearPending };
}

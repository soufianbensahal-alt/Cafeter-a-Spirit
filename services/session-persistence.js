export const SESSION_PERSISTENCE_KEY = 'spirit-keep-session';

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

const storageKeys = (storage) => {
  try {
    return Array.from({ length: storage?.length || 0 }, (_, index) => storage.key(index)).filter(Boolean);
  } catch {
    return [];
  }
};

const isSupabaseAuthKey = (key) => key.startsWith('sb-') && key.includes('-auth-token');

export function createSessionPersistenceController(persistentStorage, temporaryStorage) {
  const knownAuthKeys = new Set();

  const isEnabled = () => safeGet(persistentStorage, SESSION_PERSISTENCE_KEY) !== 'false';

  const authKeys = () => new Set([
    ...knownAuthKeys,
    ...storageKeys(persistentStorage).filter(isSupabaseAuthKey),
    ...storageKeys(temporaryStorage).filter(isSupabaseAuthKey)
  ]);

  const storage = {
    getItem(key) {
      knownAuthKeys.add(key);
      return safeGet(isEnabled() ? persistentStorage : temporaryStorage, key);
    },
    setItem(key, value) {
      knownAuthKeys.add(key);
      const target = isEnabled() ? persistentStorage : temporaryStorage;
      const other = isEnabled() ? temporaryStorage : persistentStorage;
      safeSet(target, key, value);
      safeRemove(other, key);
    },
    removeItem(key) {
      knownAuthKeys.add(key);
      safeRemove(persistentStorage, key);
      safeRemove(temporaryStorage, key);
    }
  };

  const setEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);
    const values = [...authKeys()].map((key) => ({
      key,
      value: safeGet(persistentStorage, key) ?? safeGet(temporaryStorage, key)
    }));
    safeSet(persistentStorage, SESSION_PERSISTENCE_KEY, String(nextEnabled));

    const target = nextEnabled ? persistentStorage : temporaryStorage;
    const other = nextEnabled ? temporaryStorage : persistentStorage;
    values.forEach(({ key, value }) => {
      if (value !== null) safeSet(target, key, value);
      safeRemove(other, key);
    });

    return isEnabled();
  };

  return { isEnabled, setEnabled, storage };
}

const browserStorage = (name) => {
  try { return globalThis[name] || null; }
  catch { return null; }
};

const sessionPersistence = createSessionPersistenceController(
  browserStorage('localStorage'),
  browserStorage('sessionStorage')
);

export const supabaseAuthStorage = sessionPersistence.storage;
export const isSessionPersistenceEnabled = sessionPersistence.isEnabled;
export const setSessionPersistence = sessionPersistence.setEnabled;

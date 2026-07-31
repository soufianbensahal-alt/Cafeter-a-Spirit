export const THEME_STORAGE_KEY = 'spirit-theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

export const normalizeThemePreference = (value) => (
  THEME_PREFERENCES.includes(value) ? value : 'system'
);

const safeRead = (storage) => {
  try {
    return storage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

const browserStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const safeWrite = (storage, preference) => {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The effective theme still changes when storage is unavailable.
  }
};

export const readThemePreference = (storage) => (
  normalizeThemePreference(safeRead(storage ?? browserStorage()))
);

export const resolveThemePreference = (
  preference,
  matchMediaImpl = globalThis.matchMedia
) => {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== 'system') return normalized;
  if (typeof matchMediaImpl !== 'function') return 'light';

  try {
    return matchMediaImpl('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const createThemePreferenceController = ({
  storage,
  documentElement = globalThis.document?.documentElement,
  themeColorElement = globalThis.document?.querySelector?.('#theme-color'),
  matchMediaImpl = globalThis.matchMedia,
  onChange = () => {}
} = {}) => {
  const preferenceStorage = storage ?? browserStorage();
  let preference = readThemePreference(preferenceStorage);
  let effectiveTheme = resolveThemePreference(preference, matchMediaImpl);
  let mediaQuery = null;
  let mediaQueryListener = null;

  const applyEffectiveTheme = (theme) => {
    effectiveTheme = theme === 'dark' ? 'dark' : 'light';
    if (documentElement?.dataset) documentElement.dataset.theme = effectiveTheme;
    themeColorElement?.setAttribute?.(
      'content',
      effectiveTheme === 'dark' ? '#171612' : '#eecf62'
    );
    onChange({ preference, effectiveTheme });
  };

  const stopSystemListener = () => {
    if (!mediaQuery || !mediaQueryListener) return;
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaQueryListener);
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(mediaQueryListener);
    }
    mediaQuery = null;
    mediaQueryListener = null;
  };

  const startSystemListener = () => {
    if (typeof matchMediaImpl !== 'function') return;
    try {
      mediaQuery = matchMediaImpl('(prefers-color-scheme: dark)');
    } catch {
      mediaQuery = null;
      return;
    }

    mediaQueryListener = (event) => {
      if (preference === 'system') applyEffectiveTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', mediaQueryListener);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(mediaQueryListener);
    }
  };

  const apply = (nextPreference, { persist = false } = {}) => {
    preference = normalizeThemePreference(nextPreference);
    stopSystemListener();
    applyEffectiveTheme(resolveThemePreference(preference, matchMediaImpl));
    if (preference === 'system') startSystemListener();
    if (persist) safeWrite(preferenceStorage, preference);
    return effectiveTheme;
  };

  return {
    apply,
    destroy: stopSystemListener,
    getEffectiveTheme: () => effectiveTheme,
    getPreference: () => preference
  };
};

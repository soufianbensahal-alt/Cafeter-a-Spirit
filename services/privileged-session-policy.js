export const PRIVILEGED_SESSION_MAX_DURATION_MS = 8 * 60 * 60 * 1000;
export const PRIVILEGED_SESSION_INACTIVITY_MS = 30 * 60 * 1000;
export const PRIVILEGED_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const PRIVILEGED_SESSION_ACTIVITY_KEY = 'spirit-business-last-activity';

const safeReadTime = (storage, key) => {
  try {
    const value = Number(storage?.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const safeWriteTime = (storage, key, value) => {
  try { storage?.setItem(key, String(value)); } catch {}
};

const safeRemove = (storage, key) => {
  try { storage?.removeItem(key); } catch {}
};

export function createPrivilegedSessionMonitor({
  expiresAt,
  inactivityTimeoutMs = PRIVILEGED_SESSION_INACTIVITY_MS,
  touch,
  onExpired,
  onError = () => {},
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  documentTarget = globalThis.document,
  now = Date.now,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  intervalMs = 15_000,
  activityKey = PRIVILEGED_SESSION_ACTIVITY_KEY
}) {
  let stopped = false;
  let touching = false;
  let lastTouchAt = 0;
  let timer = null;
  const absoluteExpiry = new Date(expiresAt).getTime();

  const markActivity = () => safeWriteTime(storage, activityKey, now());
  const lastActivity = () => safeReadTime(storage, activityKey);

  const onStorage = (event) => {
    if (event.key === activityKey && event.newValue) void check();
  };
  const onVisibility = () => {
    if (documentTarget?.visibilityState === 'visible') {
      markActivity();
      void check();
    }
  };
  const activityEvents = ['pointerdown', 'keydown', 'touchstart'];
  const addListeners = () => {
    activityEvents.forEach((name) => eventTarget?.addEventListener?.(name, markActivity, { passive: true }));
    eventTarget?.addEventListener?.('storage', onStorage);
    documentTarget?.addEventListener?.('visibilitychange', onVisibility);
  };
  const removeListeners = () => {
    activityEvents.forEach((name) => eventTarget?.removeEventListener?.(name, markActivity));
    eventTarget?.removeEventListener?.('storage', onStorage);
    documentTarget?.removeEventListener?.('visibilitychange', onVisibility);
  };

  const expire = async (reason) => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearIntervalFn(timer);
    removeListeners();
    safeRemove(storage, activityKey);
    await onExpired(reason);
  };

  async function check() {
    if (stopped || touching) return;
    const current = now();
    if (!Number.isFinite(absoluteExpiry) || current >= absoluteExpiry) {
      await expire('max_duration');
      return;
    }
    const activityAt = lastActivity();
    if (!activityAt || current - activityAt >= inactivityTimeoutMs) {
      await expire('inactivity');
      return;
    }
    if (current - lastTouchAt < PRIVILEGED_SESSION_TOUCH_INTERVAL_MS) return;

    touching = true;
    try {
      const session = await touch();
      lastTouchAt = current;
      if (session.status !== 'active') await expire('server_expired');
    } catch (error) {
      if (['expired', 'not_started', 'not_authorized'].includes(error?.code)) {
        await expire('server_expired');
      } else {
        onError(error);
      }
    } finally {
      touching = false;
    }
  }

  markActivity();
  lastTouchAt = now();
  addListeners();
  timer = setIntervalFn(() => void check(), intervalMs);

  return Object.freeze({
    check,
    markActivity,
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearIntervalFn(timer);
      removeListeners();
    }
  });
}

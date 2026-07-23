import { requireSupabase, supabaseConfiguration } from './supabase-client.js';

const CONFIG_PATH = '/functions/v1/send-quick-access-reminders';

export class PushNotificationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PushNotificationError';
    this.code = code;
  }
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

const ensureSupported = () => {
  if (!window.isSecureContext
    || !('Notification' in window)
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)) {
    throw new PushNotificationError(
      isIOS() && !isStandalone() ? 'ios_install_required' : 'push_unsupported'
    );
  }
};

const base64UrlToUint8Array = (value) => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

const getVapidPublicKey = async () => {
  if (!supabaseConfiguration.configured) {
    throw new PushNotificationError('push_configuration_error');
  }
  const response = await fetch(`${supabaseConfiguration.url}${CONFIG_PATH}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new PushNotificationError('push_configuration_error');
  const payload = await response.json();
  if (!payload?.publicKey) throw new PushNotificationError('push_configuration_error');
  return payload.publicKey;
};

const serializeSubscription = (subscription) => {
  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new PushNotificationError('push_subscription_error');
  }
  return {
    endpoint: payload.endpoint,
    p256dh: payload.keys.p256dh,
    authKey: payload.keys.auth
  };
};

const registerSubscription = async (subscription, language) => {
  const serialized = serializeSubscription(subscription);
  const { error } = await requireSupabase().rpc('register_own_push_subscription', {
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.p256dh,
    p_auth_key: serialized.authKey,
    p_language: language === 'ca' ? 'ca' : 'es'
  });
  if (error) throw new PushNotificationError('push_subscription_error', error.message);
};

const getBrowserSubscription = async () => {
  ensureSupported();
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

export async function getPushNotificationState() {
  try {
    const subscription = await getBrowserSubscription();
    return Notification.permission === 'granted' && Boolean(subscription);
  } catch {
    return false;
  }
}

export async function enablePushNotifications(language = 'es') {
  ensureSupported();

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushNotificationError('push_permission_denied');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await getVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey)
    });
  }

  await registerSubscription(subscription, language);
  return true;
}

export async function synchronizePushLanguage(language = 'es') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const subscription = await getBrowserSubscription();
  if (!subscription) return false;
  await registerSubscription(subscription, language);
  return true;
}

export async function disablePushNotifications() {
  let subscription;
  try {
    subscription = await getBrowserSubscription();
  } catch {
    return false;
  }
  if (!subscription) return false;

  const { endpoint } = serializeSubscription(subscription);
  const { error } = await requireSupabase()
    .rpc('unregister_own_push_subscription', { p_endpoint: endpoint });
  if (error) throw new PushNotificationError('push_subscription_error', error.message);

  await subscription.unsubscribe();
  return false;
}

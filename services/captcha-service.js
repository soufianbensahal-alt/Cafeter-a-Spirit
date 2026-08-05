const turnstileSiteKey = typeof __TURNSTILE_SITE_KEY__ === 'string'
  ? __TURNSTILE_SITE_KEY__.trim()
  : '';

let loaderPromise = null;

export const captchaConfiguration = Object.freeze({
  provider: 'turnstile',
  configured: Boolean(turnstileSiteKey)
});

const loadTurnstile = () => {
  if (!captchaConfiguration.configured) return Promise.resolve(null);
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-spirit-turnstile]');
    const script = existing || document.createElement('script');
    script.dataset.spiritTurnstile = '1';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(globalThis.turnstile), { once: true });
    script.addEventListener('error', () => reject(new Error('captcha_unavailable')), { once: true });
    if (!existing) document.head.append(script);
  });
  return loaderPromise;
};

export async function mountCaptcha(container) {
  if (!captchaConfiguration.configured || !container || container.dataset.captchaMounted) return;
  container.dataset.captchaMounted = '1';
  const turnstile = await loadTurnstile();
  if (!turnstile || !container.isConnected) return;
  turnstile.render(container, {
    sitekey: turnstileSiteKey,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    size: 'flexible',
    callback: (token) => { container.dataset.captchaToken = token; },
    'expired-callback': () => { delete container.dataset.captchaToken; },
    'error-callback': () => { delete container.dataset.captchaToken; }
  });
}

export function readCaptchaToken(form) {
  if (!captchaConfiguration.configured) return undefined;
  return form?.querySelector('[data-captcha]')?.dataset.captchaToken || '';
}

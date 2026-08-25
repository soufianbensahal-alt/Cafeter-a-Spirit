const isBusinessRoute = /^\/cafeteria\/?$/.test(window.location.pathname);
const passwordRecoveryPendingKey = 'spirit-password-recovery-pending';

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const hasRecoverySignal = /^\/reset-password\/?$/.test(window.location.pathname)
      || query.get('auth') === 'recovery'
      || hash.get('type') === 'recovery';
    const isRecoveryPending = (() => {
      try {
        return sessionStorage.getItem(passwordRecoveryPendingKey) === 'true';
      } catch {
        return false;
      }
    })();
    const isAuthReturn = /^\/auth\/callback\/?$/.test(window.location.pathname)
      || /^\/auth\/confirm\/?$/.test(window.location.pathname)
      || /^\/email-confirmed\/?$/.test(window.location.pathname)
      || hasRecoverySignal
      || isRecoveryPending;
    if (refreshing || isAuthReturn) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        await registration.update();
        const worker = registration.active || registration.waiting || registration.installing;
        worker?.postMessage({ type: 'WARM_SHELL', app: isBusinessRoute ? 'business' : 'customer' });
      })
      .catch(() => {});
  });
}

if (isBusinessRoute) {
  import('./business/business-view.js');
} else {
  import('./app.js');
}

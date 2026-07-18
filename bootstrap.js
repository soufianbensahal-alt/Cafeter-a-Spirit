const isBusinessRoute = /^\/cafeteria\/?$/.test(window.location.pathname);

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const isAuthReturn = /^\/(auth\/callback|reset-password)\/?$/.test(window.location.pathname);
    if (refreshing || isAuthReturn) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

if (isBusinessRoute) {
  import('/business/business-view.js');
} else {
  import('/app.js');
}

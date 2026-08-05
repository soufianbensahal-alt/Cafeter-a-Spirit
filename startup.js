(() => {
  const isBusinessRoute = /^\/cafeteria\/?$/.test(location.pathname);
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('spirit-theme'); } catch {}
  const preference = ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system';
  const systemIsDark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;
  const startsWithSplash = !isBusinessRoute && !/^\/reset-password\/?$/.test(location.pathname);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('splash-active', startsWithSplash);
  document.querySelector('#theme-color').content = startsWithSplash
    ? '#eecf62'
    : theme === 'dark' ? '#171612' : '#eecf62';

  if (isBusinessRoute) {
    document.title = 'SPIRIT · Modo cafetería';
    document.querySelector('#apple-app-title').content = 'SPIRIT Equipo';
  }

  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = isBusinessRoute ? '/business/manifest.webmanifest' : '/manifest.webmanifest';
  document.head.append(manifest);
})();

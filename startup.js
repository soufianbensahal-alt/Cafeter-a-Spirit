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
  // Tema elegido a mano: el navegador no debe oscurecer ni aclarar por su cuenta.
  const colorScheme = document.querySelector('#color-scheme');
  if (colorScheme) colorScheme.content = preference === 'light' ? 'only light' : preference === 'dark' ? 'dark' : 'light dark';
  document.documentElement.classList.toggle('splash-active', startsWithSplash);
  document.querySelector('#theme-color').content = startsWithSplash
    ? '#eecf62'
    : theme === 'dark' ? '#171612' : '#eecf62';

  if (isBusinessRoute) {
    document.title = 'SPIRIT · Modo cafetería';
    document.querySelector('#apple-app-title').content = 'SPIRIT Equipo';
    // El panel sigue al tema del sistema también con la app abierta: el tema
    // de la página y el color de las barras del sistema (theme-color).
    if (preference === 'system' && typeof matchMedia === 'function') {
      const media = matchMedia('(prefers-color-scheme: dark)');
      const follow = (event) => {
        const next = event.matches ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        document.querySelector('#theme-color').content = next === 'dark' ? '#171612' : '#eecf62';
      };
      if (typeof media.addEventListener === 'function') media.addEventListener('change', follow);
      else if (typeof media.addListener === 'function') media.addListener(follow);
    }
  }

  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = isBusinessRoute ? '/business/manifest.webmanifest' : '/manifest.webmanifest';
  document.head.append(manifest);

  const routeStyles = document.createElement('link');
  routeStyles.rel = 'stylesheet';
  routeStyles.href = isBusinessRoute ? '/business/business.css' : '/styles.css';
  routeStyles.dataset.spiritStyles = isBusinessRoute ? 'business' : 'customer';
  document.head.append(routeStyles);

  // «Instalar app» (Android): el navegador puede ofrecerlo antes de que cargue
  // la app; se guarda el evento para el aviso propio (services/install-prompt.js).
  window.__spiritInstallPrompt = null;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__spiritInstallPrompt = event;
  });
})();

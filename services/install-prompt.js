// Aviso propio «Instalar app» (Android: beforeinstallprompt). Discreto y
// descartable: al cerrarlo no vuelve en 30 días; con la app instalada o sin
// el evento del navegador (iPhone, navegadores sin soporte) no se muestra.
//
// startup.js guarda el evento en window.__spiritInstallPrompt por si llega
// antes de que cargue la app.

export const INSTALL_DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldOfferInstall({ hasPrompt, installed, dismissedAt, now = Date.now(), days = INSTALL_DISMISS_DAYS }) {
  if (!hasPrompt || installed) return false;
  const dismissed = Number(dismissedAt) || 0;
  return !dismissed || now - dismissed >= days * DAY_MS;
}

const safeRead = (storage, key) => {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
};
const safeWrite = (storage, key, value) => {
  try { storage?.setItem(key, value); } catch { /* sin almacenamiento */ }
};

export function createInstallPrompt({
  win = globalThis.window,
  storage = (() => { try { return globalThis.localStorage; } catch { return null; } })(),
  storageKey = 'spirit-install-dismissed-at',
  isInstalled = () => false,
  now = () => Date.now(),
  onChange = () => {}
} = {}) {
  let deferred = win?.__spiritInstallPrompt || null;
  let installed = false;

  const handlePrompt = (event) => {
    event.preventDefault?.();
    deferred = event;
    onChange();
  };
  const handleInstalled = () => {
    installed = true;
    deferred = null;
    if (win) win.__spiritInstallPrompt = null;
    onChange();
  };
  win?.addEventListener?.('beforeinstallprompt', handlePrompt);
  win?.addEventListener?.('appinstalled', handleInstalled);

  const visible = () => shouldOfferInstall({
    hasPrompt: Boolean(deferred),
    installed: installed || isInstalled(),
    dismissedAt: safeRead(storage, storageKey),
    now: now()
  });

  return {
    visible,
    // Debe llamarse desde el toque en «Instalar» (el navegador exige un gesto).
    async install() {
      const event = deferred;
      if (!event) return 'unavailable';
      deferred = null;
      if (win) win.__spiritInstallPrompt = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        // Si lo rechaza en el diálogo del sistema, no se vuelve a insistir.
        if (choice?.outcome !== 'accepted') safeWrite(storage, storageKey, String(now()));
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'unavailable';
      } finally {
        onChange();
      }
    },
    dismiss() {
      safeWrite(storage, storageKey, String(now()));
      onChange();
    },
    destroy() {
      win?.removeEventListener?.('beforeinstallprompt', handlePrompt);
      win?.removeEventListener?.('appinstalled', handleInstalled);
    }
  };
}

// Franja del aviso (cliente y panel). Texto plano, sin datos del usuario.
export function renderInstallBanner({ id = 'install-banner', title, copy, action, dismissLabel, closeIcon = '×' }) {
  return `<aside class="install-banner" aria-labelledby="${id}-title" data-install-banner>
    <div class="install-banner__text"><p id="${id}-title" class="install-banner__title">${title}</p><p class="install-banner__copy">${copy}</p></div>
    <button class="install-banner__action" type="button" data-install-action="install">${action}</button>
    <button class="install-banner__dismiss" type="button" data-install-action="dismiss" aria-label="${dismissLabel}">${closeIcon}</button>
  </aside>`;
}

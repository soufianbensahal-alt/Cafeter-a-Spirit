// «Instala Spirit»: estado de la instalación (beforeinstallprompt/appinstalled),
// regla de la hoja automática y render de la hoja con las instrucciones de
// cada plataforma (services/install-platform.js). Cliente y Panel.
//
// startup.js guarda el evento en window.__spiritInstallPrompt por si llega
// antes de que cargue la app.

export const INSTALL_DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Pantallas donde la hoja puede salir sola. Nunca en el login, el carrito, el
// seguimiento ni encima de otro diálogo.
export const INSTALL_AUTO_SCREENS = Object.freeze(['home', 'menu']);
// Clave de «primera visita»: se marca al terminar la intro/onboarding.
export const INSTALL_FIRST_VISIT_KEY = 'spirit-install-first-visit';
export const INSTALL_SHOWN_KEY = 'spirit-install-dismissed-at';

/**
 * Hoja automática: solo tras la primera visita (onboarding), en inicio o en
 * la carta, sin otro diálogo y como mucho una vez cada 30 días.
 */
export function shouldAutoShowInstall({ offer, firstVisit, screen, modalOpen, lastShownAt, now = Date.now(), days = INSTALL_DISMISS_DAYS }) {
  if (!offer || !firstVisit || modalOpen) return false;
  if (!INSTALL_AUTO_SCREENS.includes(screen)) return false;
  const shown = Number(lastShownAt) || 0;
  return !shown || now - shown >= days * DAY_MS;
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
  storageKey = INSTALL_SHOWN_KEY,
  isInstalled = () => false,
  now = () => Date.now(),
  onChange = () => {},
  onInstalled = () => {}
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
    onInstalled();
    onChange();
  };
  win?.addEventListener?.('beforeinstallprompt', handlePrompt);
  win?.addEventListener?.('appinstalled', handleInstalled);

  return {
    hasNativePrompt: () => Boolean(deferred),
    installed: () => installed || Boolean(isInstalled()),
    lastShownAt: () => safeRead(storage, storageKey),
    // Al mostrarla (o cerrarla) empieza el plazo de 30 días.
    markShown() { safeWrite(storage, storageKey, String(now())); },
    // Debe llamarse desde el toque en «Instalar app» (el navegador exige un gesto).
    async install() {
      const event = deferred;
      if (!event) return 'unavailable';
      deferred = null;
      if (win) win.__spiritInstallPrompt = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        safeWrite(storage, storageKey, String(now()));
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'unavailable';
      } finally {
        onChange();
      }
    },
    destroy() {
      win?.removeEventListener?.('beforeinstallprompt', handlePrompt);
      win?.removeEventListener?.('appinstalled', handleInstalled);
    }
  };
}

const escapeAttr = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

// «Abrir en Chrome» desde un navegador interno de Android.
export function chromeIntentUrl(href) {
  try {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) return '';
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
  } catch {
    return '';
  }
}

// Icono «Compartir» de iOS (cuadro con flecha hacia arriba).
export const SHARE_ICON = '<svg class="install-sheet__share" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2"/></svg>';
export const PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7.5v6M9.5 11l2.5 2.5 2.5-2.5M10.5 18h3"/></svg>';

function sheetBody({ platform, t, url }) {
  if (platform.kind === 'android-native') {
    return `<button class="primary-button install-sheet__primary" type="button" data-install-action="native" data-install-focus>${t('installNative')}</button>`;
  }
  if (platform.kind === 'android-menu') {
    return `<p class="install-sheet__steps-one">${t('installAndroidMenu')}</p>`;
  }
  if (platform.kind === 'ios') {
    const steps = [`${t('installIosStep1')} ${SHARE_ICON}`, t('installIosStep2'), t('installIosStep3'), t('installIosStep4')];
    const hint = platform.device === 'ipad' ? t('installIosHintIpad') : t('installIosHintIphone');
    return `<ol class="install-sheet__steps">${steps.map((step) => `<li><span>${step}</span></li>`).join('')}</ol>
      <p class="install-sheet__hint">${hint}</p>
      <p class="install-sheet__hint install-sheet__hint--soft">${t('installIosFallback')}</p>`;
  }
  const copyButton = (primary) => `<button class="${primary ? 'primary-button install-sheet__primary' : 'install-sheet__secondary'}" type="button" data-install-action="copy"${primary ? ' data-install-focus' : ''}>${t('installCopyLink')}</button>`;
  if (platform.kind === 'ios-safari-only') {
    return `<p class="install-sheet__steps-one">${t('installIosOld')}</p>${copyButton(true)}`;
  }
  if (platform.kind === 'in-app') {
    const app = platform.inApp || 'esta app';
    const deApp = /^[aeiouh]/i.test(app) ? `d’${app}` : `de ${app}`;
    const android = platform.device === 'android';
    const intent = android ? chromeIntentUrl(url) : '';
    const open = intent
      ? `<a class="primary-button install-sheet__primary" href="${escapeAttr(intent)}" data-install-focus>${t('installOpenChrome')}</a>`
      : '';
    return `<p class="install-sheet__steps-one"><strong>${t('installInAppBlocked', { app, deApp })}</strong> ${t('installInAppOpen', { browser: android ? 'Chrome' : 'Safari' })}</p>
      <div class="install-sheet__actions">${open}${copyButton(!open)}</div>`;
  }
  return '';
}

/**
 * Contenido de la hoja (va dentro de accessibleDialogMarkup). Textos propios,
 * sin datos del usuario.
 * @param {{ platform: { kind: string, device: string, inApp: string | null }, translate: (key: string, values?: Record<string, string>) => string, url?: string, auto?: boolean, id?: string, title?: string, benefit?: string }} options
 */
export function renderInstallSheet({ platform, translate: t, url = '', auto = false, id = 'install-sheet', title, benefit }) {
  const later = auto ? `<button class="install-sheet__later" type="button" data-install-action="later">${t('installLater')}</button>` : '';
  return `<div class="install-sheet" data-install-sheet data-install-kind="${escapeAttr(platform.kind)}" data-install-device="${escapeAttr(platform.device)}"${auto ? ' data-install-auto' : ''}>
    <div class="install-sheet__grab" data-sheet-drag aria-hidden="true"><span></span></div>
    <div class="sheet-head install-sheet__head" data-sheet-drag>
      <img class="install-sheet__icon" src="/assets/icons/spirit-192.png" alt="" width="52" height="52">
      <div class="install-sheet__titles"><h2 id="${id}-title">${title || t('installTitle')}</h2><p id="${id}-copy" class="install-sheet__benefit">${benefit || t('installBenefit')}</p></div>
      <button class="sheet-close" type="button" data-install-action="close" aria-label="${t('installClose')}">×</button>
    </div>
    <div class="install-sheet__body">${sheetBody({ platform, t, url })}</div>
    ${later}
  </div>`;
}

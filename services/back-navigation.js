// Botón/gesto «atrás» de Android (y de cualquier navegador) en la PWA.
//
// Modelo: el historial refleja la profundidad de la app. Cada entrada propia
// lleva history.state.spiritDepth. Hay una entrada por pantalla hija, pestaña
// secundaria o diálogo abierto. Solo con la app instalada (display-mode
// standalone) hay además una «guarda» bajo ellas: en una pestaña normal,
// atrás desde la raíz sale de la página como siempre. Al pulsar atrás el navegador quita la
// entrada de arriba (popstate) y la app deshace ese nivel: cierra el diálogo,
// vuelve a la pantalla anterior o, en la raíz, avisa «Pulsa atrás otra vez
// para salir» y vuelve a poner la guarda.
//
// Las entradas se añaden dentro de la acción del usuario (con activación), así
// que Chrome no las salta. La guarda que se repone tras el aviso se añade sin
// activación: Chrome la salta en la siguiente pulsación y la PWA se cierra,
// que es justo el «doble atrás para salir». Si el usuario toca la pantalla
// entre medias, la guarda vuelve a contar y el aviso se repite.

export const EXIT_HINT_MS = 2000;

export function createBackNavigation({ win = globalThis.window, getDepth, onBack, guardRoot = () => true }) {
  if (typeof getDepth !== 'function' || typeof onBack !== 'function') throw new TypeError('getDepth y onBack son obligatorios.');
  const history = win.history;
  let depth = 0;
  // Saltos propios (history.go) cuyo popstate hay que ignorar.
  let pending = 0;
  let started = false;
  let handlingBack = false;
  // URL que tenía la app al saltar atrás por su cuenta: la entrada de abajo
  // puede guardar una anterior (/login, /privacidad…) y se restaura.
  let intendedUrl = null;

  const currentUrl = () => `${win.location.pathname}${win.location.search}${win.location.hash}`;

  function sync() {
    if (!started || pending || handlingBack) return;
    const want = Math.max(0, Math.floor(Number(getDepth()) || 0)) + (guardRoot() ? 1 : 0);
    if (want > depth) {
      const url = currentUrl();
      while (depth < want) {
        depth += 1;
        history.pushState({ spiritDepth: depth }, '', url);
      }
    } else if (want < depth) {
      const steps = depth - want;
      depth = want;
      pending += 1;
      intendedUrl = currentUrl();
      history.go(-steps);
    }
  }

  function handlePop(event) {
    const reached = Number(event.state?.spiritDepth) || 0;
    if (pending) {
      pending -= 1;
      depth = reached;
      if (!pending && intendedUrl && currentUrl() !== intendedUrl) history.replaceState({ spiritDepth: depth }, '', intendedUrl);
      if (!pending) intendedUrl = null;
      sync();
      return;
    }
    const previous = depth;
    depth = reached;
    // Hacia delante (flecha «adelante» del navegador): no hay nada que rehacer.
    if (reached >= previous) {
      sync();
      return;
    }
    handlingBack = true;
    let result;
    try {
      // Una pulsación deshace un nivel aunque el navegador haya saltado varias
      // entradas; el resto lo recoloca sync().
      result = onBack({ atRoot: reached === 0 });
    } finally {
      handlingBack = false;
    }
    // Segunda pulsación en la raíz dentro del plazo: se deja salir (sin
    // reponer la guarda). Si no hay nada antes, la siguiente pulsación cierra.
    if (result === 'exit') {
      history.back();
      return;
    }
    sync();
  }

  return {
    start() {
      if (started) return;
      started = true;
      // La app decide la posición de scroll de cada pantalla (la carta
      // recupera la suya): el navegador no debe restaurarla por su cuenta al
      // volver atrás, o pisa la de la app.
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      history.replaceState({ spiritDepth: 0 }, '', currentUrl());
      depth = 0;
      win.addEventListener('popstate', handlePop);
      sync();
    },
    sync,
    // Cambia la URL visible sin tocar la profundidad (sustituye a
    // history.replaceState({}, '', url), que borraría spiritDepth).
    replaceUrl(url) {
      history.replaceState({ ...(history.state || {}), spiritDepth: started ? depth : 0 }, '', url);
    },
    depth: () => depth,
    isStarted: () => started
  };
}

// Aviso «Pulsa atrás otra vez para salir»: true si es la primera pulsación
// (hay que avisar); false si llega dentro del plazo (se deja salir).
// ¿PWA instalada? (Android: display-mode; iPhone: navigator.standalone.)
export function isInstalledApp(win = globalThis.window) {
  try {
    if (win?.navigator?.standalone === true) return true;
    return ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => win?.matchMedia?.(`(display-mode: ${mode})`).matches);
  } catch {
    return false;
  }
}

export function createExitHint({ now = () => Date.now(), windowMs = EXIT_HINT_MS } = {}) {
  let last = -Infinity;
  return {
    shouldWarn() {
      const at = now();
      const warn = at - last > windowMs;
      last = at;
      return warn;
    }
  };
}

// ---------------------------------------------------------------------------
// Profundidad de cada pantalla del cliente (0 = raíz). Debe coincidir con lo
// que hace su botón «volver» de la app: la pantalla padre tiene un nivel menos.
// ---------------------------------------------------------------------------
const CUSTOMER_TABS = Object.freeze(['rewards', 'history', 'profile']);

export function customerScreenDepth(screen, ctx = {}, seen = new Set()) {
  if (seen.has(screen)) return 0;
  seen.add(screen);
  const { isGuest = false, ordersBackTarget = 'menu', orderBackTarget = 'menu', legalReturn = null } = ctx;
  const depthOf = (other) => customerScreenDepth(other, ctx, seen);
  switch (screen) {
    case 'menu': return isGuest ? 0 : 1;
    case 'rewards':
    case 'history':
    case 'profile':
      return 1;
    case 'cart': return depthOf('menu') + 1;
    case 'orders': return depthOf(ordersBackTarget === 'home' ? 'home' : 'menu') + 1;
    case 'orderTracking': return depthOf(orderBackTarget === 'orders' ? 'orders' : 'menu') + 1;
    case 'legal': return (legalReturn?.screen && legalReturn.screen !== 'legal' ? depthOf(legalReturn.screen) : 0) + 1;
    default: return 0;
  }
}

export const isCustomerTab = (screen) => CUSTOMER_TABS.includes(screen);

// Panel: Pedidos es la raíz; otra pestaña, el escáner, la vista previa del
// sello, el resultado y un día pasado del historial suman un nivel cada uno.
export function panelDepth({ view = 'home', tab = 'orders', historyOpen = false } = {}) {
  if (!['home', 'scanner', 'preview', 'success'].includes(view)) return 0;
  let depth = tab === 'orders' ? 0 : 1;
  if (view !== 'home') depth += 1;
  if (view === 'home' && tab === 'orders' && historyOpen) depth += 1;
  return depth;
}

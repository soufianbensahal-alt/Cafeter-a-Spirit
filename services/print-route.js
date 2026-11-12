// ¿Se puede imprimir desde este dispositivo? En la PWA instalada de iOS
// (iPhone/iPad en modo standalone) window.print() no abre la hoja de
// impresión, y la comanda se imprime desde el PC de la barra: allí se oculta
// «Imprimir comanda». Puro y testeable (tests/print-route.test.js).

// iPadOS se presenta con UA de Mac de escritorio: se distingue por la pantalla
// táctil (un Mac no tiene maxTouchPoints > 1).
export function isIOSDevice({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return true;
  return /\bMacintosh\b/.test(userAgent) && Number(maxTouchPoints) > 1;
}

export function isIOSStandalone({ userAgent = '', maxTouchPoints = 0, standalone = false, displayModeStandalone = false } = {}) {
  return isIOSDevice({ userAgent, maxTouchPoints }) && (standalone === true || displayModeStandalone === true);
}

export function readPrintEnvironment(win = globalThis) {
  const navigator = win.navigator || {};
  let displayModeStandalone = false;
  try { displayModeStandalone = Boolean(win.matchMedia?.('(display-mode: standalone)').matches); } catch { /* sin matchMedia */ }
  return {
    userAgent: String(navigator.userAgent || ''),
    maxTouchPoints: Number(navigator.maxTouchPoints || 0),
    standalone: navigator.standalone === true,
    displayModeStandalone
  };
}

export const canPrintKitchenTicket = (environment = readPrintEnvironment()) => !isIOSStandalone(environment);

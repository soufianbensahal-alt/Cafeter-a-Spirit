// Bloqueo del scroll de la página mientras hay un diálogo abierto. Única
// fuente de verdad de html.modal-open: cada diálogo bloquea con su propia
// clave y lo libera al cerrarse; la clase solo está puesta mientras quede al
// menos uno. releaseScrollLockIfIdle() es la red de seguridad: si ya no hay
// ningún diálogo en el documento (cerrado por atrás, un repintado, un cambio
// de pantalla, un cierre de sesión o un error), libera todo.
//
// splash-active (la pantalla de bienvenida) se trata igual: sin la pantalla
// de bienvenida en el documento, la clase no puede quedarse puesta.

export const SCROLL_LOCK_CLASS = 'modal-open';
const DIALOG_SELECTOR = '[data-sheet-backdrop]';

const holders = new Set();

const root = (doc) => doc?.documentElement;

function apply(doc = globalThis.document) {
  const classes = root(doc)?.classList;
  if (!classes) return;
  if (holders.size > 0) classes.add(SCROLL_LOCK_CLASS);
  else classes.remove(SCROLL_LOCK_CLASS);
}

export function lockScroll(owner, doc = globalThis.document) {
  holders.add(owner);
  apply(doc);
}

export function unlockScroll(owner, doc = globalThis.document) {
  holders.delete(owner);
  apply(doc);
}

export const scrollLockCount = () => holders.size;

// Devuelve true si tuvo que liberar algo.
export function releaseScrollLockIfIdle(doc = globalThis.document) {
  if (!doc) return false;
  let released = false;
  if (!doc.querySelector(DIALOG_SELECTOR) && (holders.size || root(doc)?.classList.contains(SCROLL_LOCK_CLASS))) {
    holders.clear();
    root(doc)?.classList.remove(SCROLL_LOCK_CLASS);
    released = true;
  }
  if (!doc.querySelector('.intro-screen') && root(doc)?.classList.contains('splash-active')) {
    root(doc).classList.remove('splash-active');
    doc.body?.classList.remove('splash-active');
    released = true;
  }
  return released;
}

// Para tests.
export function resetScrollLock(doc = globalThis.document) {
  holders.clear();
  apply(doc);
}

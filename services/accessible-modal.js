const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const focusableElements = (dialog) => [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
  .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

// Foco inicial: el primer campo editable y, si no hay, el primer control.
// querySelector con una lista de selectores devuelve el primero en orden del
// documento, que solía ser el botón «Cerrar» de la cabecera. Las confirmaciones
// destructivas deben colocar la opción segura antes que la de confirmar.
export const INITIAL_FIELD_SELECTOR = 'input:not([type="file"]):not([type="hidden"]):not([readonly]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
export const INITIAL_CONTROL_SELECTOR = 'button:not([disabled]), a[href]';

export function defaultInitialFocus(dialog) {
  return dialog?.querySelector(INITIAL_FIELD_SELECTOR)
    || dialog?.querySelector(INITIAL_CONTROL_SELECTOR)
    || null;
}

// Safari/WebKit no enfoca los botones al tocarlos o pulsarlos con el ratón, así
// que document.activeElement es <body> al abrir el modal. Un único listener de
// click a nivel de módulo (compartido por todos los controladores) recuerda el
// último control activado para devolverle el foco al cerrar.
export const ACTIVATABLE_SELECTOR = 'button, a[href], [tabindex]:not([tabindex="-1"])';
const trackedDocuments = new WeakSet();
let lastActivated = null;

const rememberActivation = (event) => {
  lastActivated = event.target?.closest?.(ACTIVATABLE_SELECTOR) || null;
};

export function installActivationTracker(doc = globalThis.document) {
  if (!doc || trackedDocuments.has(doc)) return false;
  doc.addEventListener('click', rememberActivation, true);
  trackedDocuments.add(doc);
  return true;
}

export const lastActivatedControl = () => lastActivated;

export function focusOrigin(doc = globalThis.document) {
  const active = doc?.activeElement;
  return active && active !== doc.body ? active : lastActivated;
}

const canReceiveFocus = (element) => Boolean(
  element
  && element.isConnected
  && !element.disabled
  && typeof element.focus === 'function'
);

// Destino del foco al cerrar: el elemento que abrió el modal o, si ya no está
// en el DOM o está deshabilitado, el h1 de la pantalla actual (o su main).
export function resolveFocusRestoreTarget(previous, appRoot) {
  if (canReceiveFocus(previous) && previous !== previous.ownerDocument?.body) return previous;
  const fallback = appRoot?.querySelector?.('h1') || appRoot?.querySelector?.('main');
  if (!fallback) return null;
  if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
  return fallback;
}

export function accessibleDialogMarkup({ content, labelledBy, describedBy = '', className = '' }) {
  if (!labelledBy) throw new TypeError('El modal accesible necesita labelledBy.');
  const description = describedBy ? ` aria-describedby="${describedBy}"` : '';
  return `<div class="modal-backdrop" data-sheet-backdrop><div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}"${description} tabindex="-1">${content}</div></div>`;
}

export function createAccessibleModalController({ appRoot, modalRoot, canClose, onClose } = {}) {
  if (!appRoot || !modalRoot) throw new TypeError('El controlador necesita appRoot y modalRoot.');
  installActivationTracker(document);
  let previousFocus = null;
  let previousAriaHidden = null;
  const currentBackdrop = () => modalRoot.querySelector('[data-sheet-backdrop]');
  const currentDialog = () => currentBackdrop()?.querySelector('[role="dialog"]');

  const restoreBackground = () => {
    document.documentElement.classList.remove('modal-open');
    appRoot.inert = false;
    if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
    else appRoot.setAttribute('aria-hidden', previousAriaHidden);
    previousAriaHidden = null;
  };

  const close = ({ force = false, restoreFocus = true, reason = 'programmatic' } = {}) => {
    const backdrop = currentBackdrop();
    if (!backdrop) return false;
    if (!force && canClose && canClose({ backdrop, reason }) === false) return false;
    backdrop.remove();
    restoreBackground();
    onClose?.({ backdrop, reason });
    if (restoreFocus) resolveFocusRestoreTarget(previousFocus, appRoot)?.focus();
    previousFocus = null;
    return true;
  };

  const handleKeydown = (event) => {
    const dialog = currentDialog();
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ reason: 'escape' });
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = focusableElements(dialog);
    if (!elements.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  modalRoot.addEventListener('click', (event) => {
    const backdrop = event.target.closest?.('[data-sheet-backdrop]');
    if (backdrop && event.target === backdrop) close({ reason: 'backdrop' });
  });
  document.addEventListener('keydown', handleKeydown, true);

  const open = (markup, { initialFocus } = {}) => {
    const replacing = Boolean(currentBackdrop());
    if (!replacing) {
      previousFocus = focusOrigin(document);
      previousAriaHidden = appRoot.getAttribute('aria-hidden');
    } else {
      const retainedFocus = previousFocus;
      const retainedAriaHidden = previousAriaHidden;
      close({ force: true, restoreFocus: false, reason: 'replace' });
      previousFocus = retainedFocus;
      previousAriaHidden = retainedAriaHidden;
    }
    modalRoot.innerHTML = markup;
    document.documentElement.classList.add('modal-open');
    appRoot.inert = true;
    appRoot.setAttribute('aria-hidden', 'true');
    const dialog = currentDialog();
    const target = initialFocus
      ? dialog?.querySelector(initialFocus)
      : defaultInitialFocus(dialog);
    (target || dialog)?.focus();
    return dialog;
  };

  return { open, close, currentDialog, isOpen: () => Boolean(currentBackdrop()) };
}

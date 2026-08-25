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

export function accessibleDialogMarkup({ content, labelledBy, describedBy = '', className = '' }) {
  if (!labelledBy) throw new TypeError('El modal accesible necesita labelledBy.');
  const description = describedBy ? ` aria-describedby="${describedBy}"` : '';
  return `<div class="modal-backdrop" data-sheet-backdrop><div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}"${description} tabindex="-1">${content}</div></div>`;
}

export function createAccessibleModalController({ appRoot, modalRoot, canClose, onClose } = {}) {
  if (!appRoot || !modalRoot) throw new TypeError('El controlador necesita appRoot y modalRoot.');
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
    if (restoreFocus && previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
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
      previousFocus = document.activeElement;
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
      : dialog?.querySelector('input:not([type="file"]), button, select, textarea, a[href]');
    (target || dialog)?.focus();
    return dialog;
  };

  return { open, close, currentDialog, isOpen: () => Boolean(currentBackdrop()) };
}

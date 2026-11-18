// Cerrar una hoja inferior deslizándola hacia abajo desde su asa o su
// cabecera ([data-sheet-drag]). El contenido sigue desplazándose con normalidad:
// solo arrastran esas zonas. La regla es pura (tests/install-sheet.test.js).

export const SWIPE_CLOSE_PX = 80;
const FLICK_PX = 32;
const FLICK_SPEED = 0.6; // px/ms

export function shouldCloseOnSwipe({ deltaY, elapsedMs }) {
  if (!(deltaY > 0)) return false;
  if (deltaY >= SWIPE_CLOSE_PX) return true;
  return deltaY >= FLICK_PX && deltaY / Math.max(1, elapsedMs) >= FLICK_SPEED;
}

/**
 * @param {HTMLElement} dialog
 * @param {{ onClose: () => void, now?: () => number }} options
 * @returns {() => void} desvincular
 */
export function bindSheetSwipe(dialog, { onClose, now = () => performance.now() }) {
  if (!dialog || dialog.dataset.swipeBound) return () => {};
  dialog.dataset.swipeBound = '1';
  let start = null;

  const reset = () => {
    dialog.style.transform = '';
    dialog.style.transition = '';
    dialog.classList.remove('is-dragging');
    start = null;
  };
  const down = (event) => {
    if (event.button > 0 || !event.target.closest?.('[data-sheet-drag]')) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    start = { y: event.clientY, at: now(), id: event.pointerId };
    dialog.classList.add('is-dragging');
    try { dialog.setPointerCapture?.(event.pointerId); } catch { /* sin captura */ }
  };
  const move = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const deltaY = Math.max(0, event.clientY - start.y);
    dialog.style.transition = 'none';
    dialog.style.transform = `translateY(${deltaY}px)`;
  };
  const up = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const deltaY = event.clientY - start.y;
    const close = shouldCloseOnSwipe({ deltaY, elapsedMs: now() - start.at });
    reset();
    if (close) onClose();
  };
  dialog.addEventListener('pointerdown', down);
  dialog.addEventListener('pointermove', move);
  dialog.addEventListener('pointerup', up);
  dialog.addEventListener('pointercancel', reset);
  return () => {
    dialog.removeEventListener('pointerdown', down);
    dialog.removeEventListener('pointermove', move);
    dialog.removeEventListener('pointerup', up);
    dialog.removeEventListener('pointercancel', reset);
    delete dialog.dataset.swipeBound;
  };
}

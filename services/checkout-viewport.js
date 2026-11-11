// Reglas puras para la confirmación con el teclado del iPhone abierto. Sin DOM:
// se prueban en tests/checkout-layout.test.js.
//
// iOS no reduce el viewport de layout al abrir el teclado: lo tapa. El
// diálogo se ajusta a window.visualViewport (alto y desplazamiento) para que
// cabecera, campo y pie queden en la parte visible.

// Diferencia mínima entre el layout y el viewport visible para considerar que
// hay un teclado (las barras de Safari mueven unos 80 px sin teclado).
export const KEYBOARD_THRESHOLD_PX = 120;
// Con el teclado abierto y menos alto visible que esto, el total del pie se
// oculta para que el campo enfocado tenga sitio. «Enviar pedido» se mantiene.
export const COMPACT_MAX_HEIGHT_PX = 560;

export function checkoutViewportLayout({ layoutHeight, viewportHeight, offsetTop = 0 }) {
  const layout = Math.max(0, Math.round(Number(layoutHeight) || 0));
  const visible = Number(viewportHeight) > 0 ? Math.round(Number(viewportHeight)) : layout;
  const height = Math.min(layout || visible, visible);
  const keyboardOpen = layout - height > KEYBOARD_THRESHOLD_PX;
  return Object.freeze({
    height,
    top: Math.max(0, Math.round(Number(offsetTop) || 0)),
    keyboardOpen,
    compact: keyboardOpen && height < COMPACT_MAX_HEIGHT_PX
  });
}

// Desplazamiento que necesita el cuerpo desplazable para que el objetivo
// (el campo con su etiqueta) quede entero entre la cabecera y el pie. Si no
// cabe entero, prioriza el control enfocado: alinea su parte superior.
export function scrollDeltaToReveal({ containerTop, containerBottom, targetTop, targetBottom, focusTop = targetTop, margin = 12 }) {
  const available = containerBottom - containerTop - margin * 2;
  if (targetBottom - targetTop > available) return focusTop - (containerTop + margin);
  if (targetTop < containerTop + margin) return targetTop - (containerTop + margin);
  if (targetBottom > containerBottom - margin) return targetBottom - (containerBottom - margin);
  return 0;
}

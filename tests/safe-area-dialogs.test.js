import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Con apple-mobile-web-app-status-bar-style black-translucent, iOS difumina lo
// que queda bajo la barra de estado: ningún diálogo puede empezar dentro de
// env(safe-area-inset-top). El E2E e2e/safe-area.spec.js lo mide en WebKit.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const rule = (css, selector) => css.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.[\]"=()#>:*-]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';
const SAFE_TOP = /--modal-top: max\((\d+)px, calc\(env\(safe-area-inset-top\) \+ (\d+)px\)\)/;

test('la PWA usa la barra translúcida que obliga a respetar la franja', async () => {
  const html = await read('index.html');
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /viewport-fit=cover/);
});

test('cliente: el fondo de los diálogos reserva safe-area-inset-top y el alto se limita a lo que queda', async () => {
  const css = await read('styles.css');
  assert.match(rule(css, '.modal-backdrop'), SAFE_TOP);
  assert.match(rule(css, '.modal-backdrop'), /padding: var\(--modal-top\) 20px var\(--modal-bottom\)/);
  assert.match(rule(css, '.modal--form'), /max-height: calc\(100svh - var\(--modal-top, 20px\) - var\(--modal-bottom, 20px\)\)/);
  // Móvil.
  const mobile = css.slice(css.indexOf('@media (max-width: 699px)'));
  assert.match(mobile, /--modal-top: max\(12px, calc\(env\(safe-area-inset-top\) \+ 12px\)\);\s*--modal-bottom: max\(12px, env\(safe-area-inset-bottom\)\);\s*padding-top: var\(--modal-top\);/);
  // Confirmación del pedido, con y sin teclado.
  assert.match(rule(css, '.modal--checkout'), /max-height: calc\(var\(--viewport-height, 100svh\) - var\(--modal-top, 20px\) - var\(--modal-bottom, 20px\)\)/);
  assert.match(rule(css, '.modal-backdrop--keyboard'), /--modal-top: max\(8px, calc\(env\(safe-area-inset-top\) \+ 8px\)\)/);
  assert.match(rule(css, '.modal-backdrop--keyboard'), /padding: var\(--modal-top\)/);
  assert.match(rule(css, '.modal--keyboard'), /max-height: calc\(var\(--viewport-height, 100svh\) - var\(--modal-top, 8px\) - var\(--modal-bottom, 8px\)\)/);
  assert.doesNotMatch(css, /max-height: calc\(100svh - 40px\)/);
});

test('/cafeteria: diálogos y ticket fuera de la franja', async () => {
  const css = await read('business/business.css');
  const backdrop = rule(css, 'body.business-mode .modal-backdrop');
  assert.match(backdrop, SAFE_TOP);
  assert.match(backdrop, /padding: var\(--modal-top\) max\(20px, env\(safe-area-inset-right\)\) var\(--modal-bottom\)/);
  assert.match(rule(css, 'body.business-mode .modal'), /max-height: calc\(100svh - var\(--modal-top, 20px\) - var\(--modal-bottom, 20px\)\)/);
  assert.doesNotMatch(css, /max-height: calc\(100svh - 40px\)/);
});

test('cabeceras y barras fijas ya respetan la franja', async () => {
  const styles = await read('styles.css');
  const business = await read('business/business.css');
  assert.match(rule(styles, '.menu-sticky'), /padding: max\(12px, env\(safe-area-inset-top\)\)/);
  assert.match(rule(styles, '.screen'), /padding: max\(24px, env\(safe-area-inset-top\)\)/);
  assert.match(rule(styles, '.intro-skip'), /top: max\(20px, env\(safe-area-inset-top\)\)/);
  assert.match(business, /\.business-app \{[^}]*padding: max\(20px, env\(safe-area-inset-top\)\)/);
});

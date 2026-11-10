import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { accessibleDialogMarkup, defaultInitialFocus } from '../services/accessible-modal.js';
import { renderCancelOrderContent, renderCheckoutContent } from '../client/order-view.js';
import { ORDER_COPY } from '../client/order-copy.js';
import { emptyCart } from '../services/cart-rules.js';

// Mini DOM de solo lectura: lista los elementos en orden del documento y
// resuelve los selectores que usa defaultInitialFocus. Basta para comprobar
// qué control recibiría el foco en el marcado real de cada modal.
function parseElements(html) {
  return [...html.matchAll(/<(input|select|textarea|button|a)\b([^>]*)>([^<]*)/g)].map(([, tag, attrs, text]) => ({
    tag,
    attrs,
    text: text.trim(),
    has: (name) => new RegExp(`(^|\\s)${name}(=|\\s|$)`).test(attrs),
    attr: (name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null
  }));
}

function fakeDialog(html) {
  const elements = parseElements(html);
  const isField = (el) => (el.tag === 'input' && !['file', 'hidden'].includes(el.attr('type')) && !el.has('readonly') && !el.has('disabled'))
    || (['select', 'textarea'].includes(el.tag) && !el.has('disabled'));
  const isControl = (el) => (el.tag === 'button' && !el.has('disabled')) || (el.tag === 'a' && el.has('href'));
  return {
    querySelector(selector) {
      if (selector.startsWith('input:not([type="file"])')) return elements.find(isField) || null;
      if (selector.startsWith('button:not([disabled])')) return elements.find(isControl) || null;
      throw new Error(`selector no soportado: ${selector}`);
    }
  };
}

const describeTarget = (el) => el && (el.attr('id') ? `#${el.attr('id')}` : el.attr('data-action') ? `[data-action=${el.attr('data-action')}]` : el.text);
const focusTarget = (html) => describeTarget(defaultInitialFocus(fakeDialog(html)));

// Modales definidos en app.js, extraídos tal cual y evaluados con dobles.
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
function extractFunction(source, name) {
  const start = source.search(new RegExp(`function ${name}\\(`));
  assert.ok(start >= 0, `no se encuentra ${name}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} sin cerrar`);
}
const modalNames = ['personalSheet', 'appearanceSheet', 'languageSheet', 'passwordSheet', 'deleteAccountSheet', 'stampRequestSheet'];
const context = vm.createContext({
  state: { profile: { firstName: 'Ana', lastName: 'Pi', email: 'a@b.c' }, themePreference: 'system', lang: 'es', accountDeletionError: '', stampRequest: { type: 'stamp', qrDataUrl: 'data:', shortCode: '123456' } },
  t: (key) => key,
  escapeHTML: (value = '') => String(value),
  PASSWORD_MIN_LENGTH: 12,
  formatStampCountdown: () => '1:30',
  STAMP_REQUEST_DURATION_SECONDS: 90,
  sheet: (content, className, labelledBy, describedBy = '') => accessibleDialogMarkup({ content, className, labelledBy, describedBy })
});
vm.runInContext(modalNames.map((name) => extractFunction(app, name)).join('\n'), context);
const tr = (key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), ORDER_COPY.es[key] || key);

test('cada modal enfoca el primer campo editable o, si no hay, el primer control', () => {
  assert.equal(focusTarget(context.personalSheet()), '#profile-first');
  assert.equal(focusTarget(context.passwordSheet()), '#current-password');
  assert.equal(focusTarget(context.appearanceSheet()), '[data-action=close-sheet]');
  assert.equal(focusTarget(context.languageSheet()), '[data-action=close-sheet]');
  assert.equal(focusTarget(context.stampRequestSheet()), '[data-action=close-stamp-request]');
  context.state.stampRequest = { ...context.state.stampRequest, expired: true };
  assert.equal(focusTarget(context.stampRequestSheet()), '[data-action=close-stamp-request]');
  assert.equal(focusTarget(renderCheckoutContent({ cart: emptyCart(), products: new Map(), translate: tr, lang: 'es' })), '#checkout-code');
});

test('ninguna confirmación destructiva enfoca el botón de confirmar', () => {
  const deletion = defaultInitialFocus(fakeDialog(context.deleteAccountSheet()));
  assert.equal(describeTarget(deletion), '#delete-account-confirmation', 'eliminar cuenta enfoca el campo ELIMINAR');
  assert.ok(!deletion.has('data-delete-account-submit'));
  assert.match(context.deleteAccountSheet(), /data-delete-account-submit disabled/, 'el botón destructivo empieza deshabilitado');

  const cancel = defaultInitialFocus(fakeDialog(renderCancelOrderContent({ translate: tr })));
  assert.equal(describeTarget(cancel), '[data-action=close-sheet]', 'cancelar pedido enfoca «No, mantenerlo»');
  assert.equal(cancel.text, 'No, mantenerlo');
});

test('los campos de solo lectura, ocultos o deshabilitados no reciben el foco inicial', () => {
  const html = '<button data-action="close-sheet">×</button><input type="hidden" name="x"><input id="ro" readonly><input id="off" disabled><input id="ok">';
  assert.equal(focusTarget(html), '#ok');
  assert.equal(focusTarget('<button disabled>Confirmar</button><button data-action="keep">Mantener</button>'), '[data-action=keep]');
});

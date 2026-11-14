import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROMO_DEFAULT_SLOTS,
  PROMO_TIMING,
  SIGNUP_PROMO_COPY,
  promoCupDelay,
  promoDurationMs,
  promoSlots,
  promoStampsRequired,
  renderSignupPromo
} from '../client/signup-promo.js';
import { GUEST_COPY } from '../client/guest-copy.js';
import { ORDER_COPY } from '../client/order-copy.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const translator = (lang) => (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), SIGNUP_PROMO_COPY[lang][key] || key);
const es = translator('es');
const ca = translator('ca');

test('textos aprobados en castellano y catalán, con las mismas claves', async () => {
  assert.deepEqual(Object.keys(SIGNUP_PROMO_COPY.ca).sort(), Object.keys(SIGNUP_PROMO_COPY.es).sort());
  assert.deepEqual(SIGNUP_PROMO_COPY.es, {
    signupPromoTitle: 'Crea tu cuenta y llévate un café gratis',
    signupPromoStamp: 'Suma un sello en cada consumición.',
    signupPromoRewardCount: 'Con {n} sellos, tu próximo café es gratis.',
    signupPromoReward: 'Completa tu tarjeta y tu próximo café es gratis.',
    signupPromoTracking: 'Sigue tus pedidos desde el móvil.',
    signupPromoAction: 'Crear mi cuenta',
    signupPromoGuestNote: 'Conservarás tus pedidos de hoy.'
  });
  assert.deepEqual(SIGNUP_PROMO_COPY.ca, {
    signupPromoTitle: 'Crea el teu compte i emporta’t un cafè gratis',
    signupPromoStamp: 'Suma un segell a cada consumició.',
    signupPromoRewardCount: 'Amb {n} segells, el teu pròxim cafè és gratis.',
    signupPromoReward: 'Completa la targeta i el teu pròxim cafè és gratis.',
    signupPromoTracking: 'Segueix les teves comandes des del mòbil.',
    signupPromoAction: 'Crear el meu compte',
    signupPromoGuestNote: 'Conservaràs les comandes d’avui.'
  });
  // Sin pisar claves existentes.
  const app = await read('app.js');
  const existing = [...app.slice(app.indexOf('const copy = {'), app.indexOf('Object.assign(copy.es')).matchAll(/(\w+): '/g)].map((match) => match[1]);
  for (const key of Object.keys(SIGNUP_PROMO_COPY.es)) {
    assert.ok(!existing.includes(key) && !(key in GUEST_COPY.es) && !(key in ORDER_COPY.es), key);
  }
});

test('número de sellos: sólo un entero razonable; si no, texto sin número', () => {
  assert.equal(promoStampsRequired(10), 10);
  assert.equal(promoStampsRequired('8'), 8);
  for (const value of [null, undefined, 0, -3, 2.5, 'diez', 51, NaN]) assert.equal(promoStampsRequired(value), null, String(value));
  const withCount = renderSignupPromo({ translate: es, variant: 'hero', stampsRequired: 10 });
  assert.match(withCount, /Con 10 sellos, tu próximo café es gratis\./);
  assert.doesNotMatch(withCount, /Completa tu tarjeta/);
  const without = renderSignupPromo({ translate: es, variant: 'hero', stampsRequired: null });
  assert.match(without, /Completa tu tarjeta y tu próximo café es gratis\./);
  assert.doesNotMatch(without, /\d+ sellos/);
  assert.match(renderSignupPromo({ translate: ca, variant: 'hero', stampsRequired: 10 }), /Amb 10 segells, el teu pròxim cafè és gratis\./);
  assert.match(renderSignupPromo({ translate: ca, variant: 'hero' }), /Completa la targeta i el teu pròxim cafè és gratis\./);
});

test('hero: título h2, tres ventajas, tarjeta decorativa oculta y botón al registro', () => {
  const html = renderSignupPromo({ translate: es, variant: 'hero', id: 'signup-promo', action: 'signup-promo-start', stampsRequired: 10 });
  assert.match(html, /^<section class="signup-promo signup-promo--hero" aria-labelledby="signup-promo-title" data-signup-promo>/);
  assert.match(html, /<h2 id="signup-promo-title" class="signup-promo__title">Crea tu cuenta y llévate un café gratis<\/h2>/);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.match(html, /<div class="signup-promo__card" aria-hidden="true" data-promo-card style="--slots:10">/);
  assert.equal((html.match(/class="signup-promo__slot"/g) || []).length, 10);
  assert.equal((html.match(/signup-promo__slot--reward/g) || []).length, 1);
  assert.match(html, /<button class="primary-button signup-promo__action" type="button" data-action="signup-promo-start">Crear mi cuenta<\/button>/);
  // Orden de lectura: título, ventajas y botón.
  assert.ok(html.indexOf('<h2') < html.indexOf('<ul') && html.indexOf('<ul') < html.indexOf('<button'));
  // Todas las huellas y la taza son decorativas.
  for (const svg of html.match(/<svg[^>]*>/g)) assert.match(svg, /aria-hidden="true" focusable="false"/);
  // En la pestaña de registro, sin botón.
  assert.doesNotMatch(renderSignupPromo({ translate: es, variant: 'hero', showAction: false }), /<button/);
});

test('mini tarjeta: los sellos reales si caben; si no, 6 decorativos', () => {
  assert.equal(promoSlots(10), 10);
  assert.equal(promoSlots(4), 4);
  assert.equal(promoSlots(12), 12);
  for (const value of [null, 3, 13, 40]) assert.equal(promoSlots(value), PROMO_DEFAULT_SLOTS);
  // Pendiente de datos: huecos vacíos, sin animar.
  const pending = renderSignupPromo({ translate: es, variant: 'hero', motion: 'pending' });
  assert.doesNotMatch(pending, /signup-promo--animate/);
  assert.doesNotMatch(pending.slice(pending.indexOf('data-promo-card'), pending.indexOf('</div>')), /<svg/);
});

test('animación: una vez, continuando si se repinta, y estado final después', () => {
  const animated = renderSignupPromo({ translate: es, variant: 'hero', stampsRequired: 10, motion: 'animate', elapsed: 412.6 });
  assert.match(animated, /class="signup-promo signup-promo--hero signup-promo--animate"[^>]*style="--promo-elapsed:413ms"/);
  assert.match(animated, /style="--i:0"/);
  assert.match(animated, /style="--i:9"/);
  const finished = renderSignupPromo({ translate: es, variant: 'hero', stampsRequired: 10, motion: 'static' });
  assert.doesNotMatch(finished, /signup-promo--animate|--promo-elapsed/);
  assert.match(finished, /signup-promo__cup/);
  // Línea de tiempo: huellas cada 90 ms, luego la taza y el brillo.
  assert.equal(PROMO_TIMING.step, 90);
  assert.equal(promoCupDelay(10), 250 + 10 * 90 + 120);
  assert.equal(promoDurationMs(10), promoCupDelay(10) + 460 + 900);
});

test('el CSS sigue la misma línea de tiempo y respeta el movimiento reducido', async () => {
  const css = await read('styles.css');
  assert.match(css, /animation-delay: calc\(250ms \+ var\(--i\) \* 90ms - var\(--promo-elapsed, 0ms\)\)/);
  assert.match(css, /animation-delay: calc\(370ms \+ var\(--slots\) \* 90ms - var\(--promo-elapsed, 0ms\)\)/);
  assert.match(css, /animation-delay: calc\(830ms \+ var\(--slots\) \* 90ms - var\(--promo-elapsed, 0ms\)\)/);
  assert.equal(promoCupDelay(0), 370);
  assert.equal(promoCupDelay(0) + PROMO_TIMING.cup, 830);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n {2}\.signup-promo--animate \*,\n {2}\.signup-promo--animate \*::after \{ animation: none !important; \}/);
  // Sin bucles.
  const promoCss = css.slice(css.indexOf('/* Promoción de registro'), css.indexOf('/* Páginas legales'));
  assert.doesNotMatch(promoCss, /infinite/);
});

test('compact (invitado): misma promoción con la nota de sus pedidos', () => {
  const html = renderSignupPromo({ translate: es, variant: 'compact', id: 'guest-prompt-menu', stampsRequired: 10 });
  assert.match(html, /^<aside class="signup-promo signup-promo--compact" aria-labelledby="guest-prompt-menu-title" data-signup-promo>/);
  assert.match(html, /Con 10 sellos, tu próximo café es gratis\./);
  assert.match(html, /Conservarás tus pedidos de hoy\./);
  assert.match(html, /data-action="guest-create-account">Crear mi cuenta</);
  assert.doesNotMatch(html, /data-promo-card|signup-promo--animate/);
});

test('app.js: la promoción va encima de «¿Solo quieres pedir?» y sustituye a la captación anterior', async () => {
  const app = await read('app.js');
  assert.match(app, /\$\{form\}\$\{signupPromo\}\$\{guestEntry\}\$\{legalFooter\(\)\}/);
  assert.match(app, /showAction: state\.authMode === 'signin'/);
  assert.match(app, /const signupPromo = loginSignupPromo\(\);/);
  assert.match(app, /if\(action==='signup-promo-start'\)\{ state\.authMode='signup';[^\n]*#signup-first-name/);
  assert.doesNotMatch(app, /renderGuestPrompt/);
  // Al llegar el número de sellos no se repinta el login (no borra lo escrito).
  const load = app.slice(app.indexOf('async function loadPublicProgram'), app.indexOf('\n}\n', app.indexOf('async function loadPublicProgram')));
  assert.match(load, /template\.innerHTML = \(hero \? loginSignupPromo\(\) : guestPrompt\(id\)\)\.trim\(\);/);
  assert.match(load, /if \(button && slot\) slot\.replaceWith\(button\);/);
  assert.doesNotMatch(load, /render(PreservingFocus)?\(\)/);
  const guestView = await read('client/guest-view.js');
  assert.doesNotMatch(guestView, /export function renderGuestPrompt/);
  // El servicio pide sólo el programa público, sin sesión.
  const service = await read('services/public-loyalty-program.js');
  assert.match(service, /rpc\('get_public_loyalty_program'\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MENU_CATEGORIES } from '../data/menu.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la carta nativa contiene las 15 categorías del menú original', () => {
  assert.deepEqual(MENU_CATEGORIES.map(({ name }) => name), [
    'Cafés',
    'Bebidas',
    'Smoothies',
    'Batidos',
    'Protein',
    'Bowls',
    'Tostadas',
    'Molletes',
    'Benedict',
    'Pancakes',
    'Creps',
    'Creps saladas',
    'Bocadillos',
    'Omelette',
    'Extras'
  ]);
  assert.ok(MENU_CATEGORIES.flatMap(({ products }) => products).length > 100);
});

test('la carta conserva productos, precios y suplementos representativos', () => {
  const byId = Object.fromEntries(MENU_CATEGORIES.map((category) => [category.id, category]));

  assert.deepEqual(
    byId.tostadas.products.find(({ name }) => name === 'Salmón'),
    { name: 'Salmón', description: 'con queso crema, aguacate y salmón ahumado', price: '12,15 €' }
  );
  assert.equal(byId.benedict.products.find(({ name }) => name === 'Salmón y Aguacate').price, '14,95 €');
  assert.equal(byId.tostadas.products.find(({ name }) => name === 'Aguacate').priceNote, '+2 € queso brie');
  assert.ok(byId.cafes.notes.includes('Bebida de avena +0,30 €'));
  assert.ok(byId.creps.notes.some((note) => note.includes('Toppings +1,50 €')));
});

test('Carta abre internamente y elimina por completo el enlace de Canva', async () => {
  const app = await read('app.js');

  assert.doesNotMatch(app, /canva\.com\/design\/DAFuLPRj4h0/i);
  assert.match(app, /\{name: 'Carta', subtitle: 'viewMenu', icon: 'card', action: 'open-menu'\}/);
  assert.match(app, /data-action="close-menu"/);
  assert.match(app, /\{intro,onboarding,login,authLoading,home,menu,rewards,history,profile\}/);
});

test('la carta implementa búsqueda, agrupación, categorías y scroll-spy', async () => {
  const app = await read('app.js');

  assert.match(app, /data-menu-search/);
  assert.match(app, /normalizeMenuText/);
  assert.match(app, /menuNoResults/);
  assert.match(app, /menu-result-group/);
  assert.match(app, /data-menu-category/);
  assert.match(app, /data-menu-section/);
  assert.match(app, /syncMenuFromScroll/);
  assert.match(app, /menuScroller\.scrollTo\(\{ top: Math\.max\(0, top\), behavior: 'smooth' \}\)/);
  assert.match(app, /menuScroller\.addEventListener\('scroll', menuScrollHandler/);
  assert.match(app, /categories\.scrollLeft[\s\S]*categories\.scrollTo\(\{ left: Math\.max\(0, left\), behavior: 'smooth' \}\)/);
  assert.doesNotMatch(app, /scrollIntoView/);
  assert.match(app, /reachedBottom[\s\S]*sections\.at\(-1\)\.dataset\.menuSection/);
  assert.match(app, /menu-to-top--visible/);
});

test('la cabecera queda fija y solo el listado utiliza scroll vertical', async () => {
  const styles = await read('styles.css');

  assert.match(styles, /\.menu-screen\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  assert.match(styles, /\.menu-sticky\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(styles, /\.menu-content\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.menu-content\s*\{[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-y;/s);
  assert.doesNotMatch(styles, /\.menu-screen\s*\{[^}]*overflow-y:\s*(?:auto|scroll)/s);
});

test('los precios de la carta comparten columna y conservan su legibilidad', async () => {
  const styles = await read('styles.css');

  assert.match(styles, /\.menu-product\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\) 94px;/s);
  assert.match(styles, /\.menu-product__price\s*\{[^}]*text-align:\s*right;/s);
  assert.match(styles, /\.menu-product__main h3\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

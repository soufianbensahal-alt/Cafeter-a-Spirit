import assert from 'node:assert/strict';
import test from 'node:test';
import { MENU_CATALOG, MENU_CATEGORIES, getMenuCategories } from '../data/menu.js';

test('el catálogo bilingüe conserva categorías, precios e identificadores estables', () => {
  const spanish = getMenuCategories('es');
  const catalan = getMenuCategories('ca');

  assert.equal(spanish.length, MENU_CATEGORIES.length);
  assert.equal(catalan.length, MENU_CATEGORIES.length);
  assert.deepEqual(spanish.map(({ id }) => id), catalan.map(({ id }) => id));

  for (let categoryIndex = 0; categoryIndex < spanish.length; categoryIndex += 1) {
    assert.deepEqual(
      spanish[categoryIndex].products.map(({ id, price }) => ({ id, price })),
      catalan[categoryIndex].products.map(({ id, price }) => ({ id, price }))
    );
  }
});

test('los identificadores normalizados no se duplican', () => {
  const ids = MENU_CATALOG.es.flatMap(({ products }) => products.map(({ id }) => id));
  assert.equal(new Set(ids).size, ids.length);
});

test('un idioma desconocido usa el catálogo castellano', () => {
  assert.equal(getMenuCategories('en'), MENU_CATALOG.es);
});

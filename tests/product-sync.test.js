import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { MENU_CATALOG } from '../data/menu.js';
import {
  PRODUCT_SYNC_MARKER,
  buildProductRows,
  buildProductSyncSql,
  parsePriceCents
} from '../scripts/sync-products.mjs';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

test('los precios del catálogo se convierten a céntimos sin decimales flotantes', () => {
  assert.equal(parsePriceCents('6,00 €'), 600);
  assert.equal(parsePriceCents('2,20 €'), 220);
  assert.equal(parsePriceCents('17,05 €'), 1705);
  assert.equal(parsePriceCents(''), null);
  assert.throws(() => parsePriceCents('6.00€'), /formato/);
});

test('los productos usan los identificadores estables del catálogo bilingüe', () => {
  const { rows, skipped } = buildProductRows();
  const catalogIds = MENU_CATALOG.es.flatMap(({ products }) => products.map(({ id }) => id));

  assert.deepEqual([...rows.map(({ id }) => id), ...skipped].sort(), [...catalogIds].sort());
  assert.ok(rows.every(({ priceCents }) => Number.isInteger(priceCents) && priceCents > 0));
  assert.ok(rows.every(({ nameEs, nameCa }) => nameEs && nameCa));
  assert.deepEqual(skipped, ['bebidas-cervezas-artesanas']);
});

test('el SQL generado escapa comillas y no toca is_available', () => {
  const sql = buildProductSyncSql({
    rows: [{ id: 'x-a', categoryId: 'x', nameEs: "D'Or", nameCa: "D'Or", priceCents: 100, sortOrder: 0 }],
    skipped: []
  });
  assert.match(sql, /'D''Or'/);
  assert.doesNotMatch(sql, /is_available/);
});

test('la última migración de productos coincide con el catálogo actual', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  let latest = null;
  for (const name of files) {
    const content = await readFile(new URL(name, migrationsDir), 'utf8');
    if (content.startsWith(PRODUCT_SYNC_MARKER)) latest = content;
  }
  assert.ok(latest, 'no existe ninguna migración generada por sync-products');
  assert.equal(
    latest,
    buildProductSyncSql(buildProductRows()),
    'el catálogo cambió: genera una migración nueva con scripts/sync-products.mjs'
  );
});

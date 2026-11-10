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

// Precios: la carta muestra los de data/menu.js y el carrito/create_order los
// de public.products. Este test enumera cada desajuste para que no puedan
// divergir sin que nadie se entere.
const SEED_ROW = /\(v_business_id, '((?:[^']|'')+)', '[^']*', '(?:[^']|'')*', '(?:[^']|'')*', (\d+), \d+\)/g;

async function latestSeedPrices() {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  let latest = null;
  for (const name of files) {
    const content = await readFile(new URL(name, migrationsDir), 'utf8');
    if (content.startsWith(PRODUCT_SYNC_MARKER)) latest = content;
  }
  assert.ok(latest, 'no existe ninguna migración generada por sync-products');
  return new Map([...latest.matchAll(SEED_ROW)].map(([, id, cents]) => [id.replaceAll("''", "'"), Number(cents)]));
}

test('cada precio de data/menu.js coincide con la semilla de public.products', async () => {
  const seed = await latestSeedPrices();
  const mismatches = [];
  for (const category of MENU_CATALOG.es) {
    for (const product of category.products) {
      const catalogCents = parsePriceCents(product.price);
      if (catalogCents === null) continue;
      if (!seed.has(product.id)) mismatches.push(`${product.id}: falta en la semilla (carta ${product.price})`);
      else if (seed.get(product.id) !== catalogCents) mismatches.push(`${product.id}: carta ${catalogCents} ≠ semilla ${seed.get(product.id)}`);
    }
  }
  assert.ok(seed.size > 100, 'la semilla se ha leído correctamente');
  assert.deepEqual(mismatches, [], 'precios desincronizados: ejecuta scripts/sync-products.mjs y crea una migración nueva');
});

test('cada precio de data/menu.js coincide con lo que genera sync-products', () => {
  const generated = new Map(buildProductRows().rows.map((row) => [row.id, row.priceCents]));
  for (const category of MENU_CATALOG.es) {
    for (const product of category.products) {
      const catalogCents = parsePriceCents(product.price);
      if (catalogCents !== null) assert.equal(generated.get(product.id), catalogCents, product.id);
    }
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (name) => new URL(`../${name}`, import.meta.url);

test('el escáner usa canvas y jsQR sin depender de BarcodeDetector', async () => {
  const source = await readFile(projectFile('business/business-view.js'), 'utf8');

  assert.match(source, /import jsQR from 'jsqr'/);
  assert.match(source, /scanContext\.drawImage/);
  assert.match(source, /scanContext\.getImageData/);
  assert.match(source, /jsQR\(frame\.data/);
  assert.doesNotMatch(source, /BarcodeDetector/);
});

test('el escáner conserva reintento, selector y alternativa manual', async () => {
  const source = await readFile(projectFile('business/business-view.js'), 'utf8');

  assert.match(source, /data-business-action="retry-camera"/);
  assert.match(source, /data-camera-select/);
  assert.match(source, /Introducir código manualmente/);
});

test('la vista del escáner renderiza una sola cabecera', async () => {
  const source = await readFile(projectFile('business/business-view.js'), 'utf8');
  const occurrences = source.match(/<header class="scanner-header">/g) || [];

  assert.equal(occurrences.length, 1);
});

test('la confirmación comparte ancho, eje y espaciado uniforme', async () => {
  const css = await readFile(projectFile('business/business.css'), 'utf8');

  assert.match(css, /\.business-preview \{[^}]*width: 100%[^}]*display: grid[^}]*gap: 16px/s);
  assert.match(css, /\.business-preview > \.business-primary, \.business-preview > \.business-secondary \{ width: 100%; margin: 0; \}/);
  assert.match(css, /\.customer-card \{ width: 100%; margin: 0;/);
  assert.match(css, /overflow-wrap: anywhere/);
});

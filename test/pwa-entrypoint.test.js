import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (name) => new URL(`../${name}`, import.meta.url);

test('la página carga un único punto de entrada', async () => {
  const html = await readFile(projectFile('index.html'), 'utf8');

  assert.match(html, /src="\/bootstrap\.js"/);
  assert.doesNotMatch(html, /src="(?:\/)?app\.js"/);
  assert.doesNotMatch(html, /src="\/business\/business-view\.js"/);
});

test('el bootstrap separa cliente y cafetería', async () => {
  const bootstrap = await readFile(projectFile('bootstrap.js'), 'utf8');

  assert.match(bootstrap, /if \(isBusinessRoute\)/);
  assert.match(bootstrap, /import\('\/business\/business-view\.js'\)/);
  assert.match(bootstrap, /else \{\s*import\('\/app\.js'\)/);
});

test('la caché PWA prioriza la versión de red', async () => {
  const worker = await readFile(projectFile('sw.js'), 'utf8');

  assert.match(worker, /spirit-shell-v14/);
  assert.match(worker, /fetch\(event\.request, \{ cache: 'no-store' \}\)/);
});

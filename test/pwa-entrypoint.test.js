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
  assert.match(bootstrap, /import\('\.\/business\/business-view\.js'\)/);
  assert.match(bootstrap, /else \{\s*import\('\.\/app\.js'\)/);
});

test('la caché PWA prioriza la versión de red', async () => {
  const worker = await readFile(projectFile('sw.js'), 'utf8');

  assert.match(worker, /CACHE_VERSION = 'v28'/);
  assert.match(worker, /customer: `\$\{CACHE_PREFIX\}customer-\$\{CACHE_VERSION\}`/);
  assert.match(worker, /business: `\$\{CACHE_PREFIX\}business-\$\{CACHE_VERSION\}`/);
  assert.match(worker, /'\/startup\.js'/);
  assert.match(worker, /WARM_SHELL/);
  assert.match(worker, /fetch\(event\.request, \{ cache: 'no-store' \}\)/);
});

test('el build publica JS y CSS versionados por contenido', async () => {
  const [html, startup] = await Promise.all([
    readFile(projectFile('dist/index.html'), 'utf8'),
    readFile(projectFile('dist/startup.js'), 'utf8')
  ]);

  assert.match(html, /\/assets\/js\/bootstrap-[A-Z0-9]+\.js/);
  assert.match(html, /\/assets\/css\/base-[a-f0-9]+\.css/);
  assert.match(startup, /\/assets\/css\/customer-[a-f0-9]+\.css/);
  assert.match(startup, /\/assets\/css\/business-[a-f0-9]+\.css/);
});

test('cliente y empleados se instalan como PWAs independientes', async () => {
  const [html, startup, customerManifest, businessManifest] = await Promise.all([
    readFile(projectFile('index.html'), 'utf8'),
    readFile(projectFile('startup.js'), 'utf8'),
    readFile(projectFile('manifest.webmanifest'), 'utf8').then(JSON.parse),
    readFile(projectFile('business/manifest.webmanifest'), 'utf8').then(JSON.parse)
  ]);

  assert.equal(customerManifest.id, '/');
  assert.equal(customerManifest.start_url, '/');
  assert.equal(businessManifest.id, '/cafeteria');
  assert.equal(businessManifest.start_url, '/cafeteria');
  assert.equal(businessManifest.scope, '/cafeteria');
  assert.notEqual(customerManifest.id, businessManifest.id);
  assert.match(html, /src="\/startup\.js"/);
  assert.match(startup, /isBusinessRoute \? '\/business\/manifest\.webmanifest' : '\/manifest\.webmanifest'/);
});

test('la aplicación conserva rutas absolutas para estilos y recursos', async () => {
  const [html, startup, app, styles] = await Promise.all([
    readFile(projectFile('index.html'), 'utf8'),
    readFile(projectFile('startup.js'), 'utf8'),
    readFile(projectFile('app.js'), 'utf8'),
    readFile(projectFile('styles.css'), 'utf8')
  ]);

  assert.match(html, /href="\/base\.css"/);
  assert.match(startup, /isBusinessRoute \? '\/business\/business\.css' : '\/styles\.css'/);
  assert.match(startup, /'\/manifest\.webmanifest'/);
  assert.doesNotMatch(html, /(?:src|href)="assets\//);
  assert.doesNotMatch(app, /(?:src=|image:)['"]assets\//);
  assert.doesNotMatch(styles, /url\(['"]?assets\//);
});

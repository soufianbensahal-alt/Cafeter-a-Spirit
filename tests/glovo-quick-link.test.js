import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Glovo aparece en accesos rápidos con el enlace solicitado', async () => {
  const app = await read('app.js');

  assert.match(app, /name: 'Glovo'/);
  assert.match(app, /image: '\/assets\/glovo-logo\.svg'/);
  assert.match(app, /https:\/\/glovoapp\.com\/es\/es\/montcada-i-reixach\/stores\/spirit-and-coffee-montacadaireixach/);
});

test('el logo de Glovo forma parte del shell offline de la PWA', async () => {
  const [logo, worker] = await Promise.all([
    read('assets/glovo-logo.svg'),
    read('sw.js')
  ]);

  assert.match(logo, /<svg/);
  assert.match(logo, /#00a082/);
  assert.match(worker, /\/assets\/glovo-logo\.svg/);
});

test('el logo de Glovo aprovecha el contenedor sin deformarse', async () => {
  const styles = await read('styles.css');

  assert.match(styles, /\.quick-card__icon--glovo img\s*\{\s*width:\s*46px;\s*height:\s*auto;\s*max-height:\s*40px;\s*padding:\s*0;/);
  assert.match(styles, /html\[data-theme="dark"\] \.quick-card__icon--glovo\s*\{\s*background:\s*#fdc500;/);
});

test('la cuadrícula de accesos mantiene filas equilibradas en cada breakpoint', async () => {
  const styles = await read('styles.css');
  const tabletStart = styles.indexOf('@media (min-width: 700px) and (max-width: 1023px)');
  const desktopStart = styles.indexOf('@media (min-width: 1024px)');

  assert.notEqual(tabletStart, -1, 'las reglas de tablet deben terminar antes de escritorio');
  assert.notEqual(desktopStart, -1, 'deben existir reglas específicas para escritorio');

  const tabletRules = styles.slice(tabletStart, desktopStart);
  const desktopRules = styles.slice(desktopStart);

  assert.match(tabletRules, /grid-template-columns:\s*repeat\(6,/);
  assert.match(tabletRules, /nth-last-child\(2\):nth-child\(3n \+ 1\)/);
  assert.match(desktopRules, /grid-template-columns:\s*repeat\(8,/);
  assert.doesNotMatch(desktopRules, /nth-last-child\(2\):nth-child\(3n \+ 1\)/);
});

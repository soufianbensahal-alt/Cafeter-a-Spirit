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

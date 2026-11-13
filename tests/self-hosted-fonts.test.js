import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url));
const FONT_FILES = [
  'dm-sans-latin.woff2',
  'dm-sans-latin-ext.woff2',
  'dm-serif-display-latin.woff2',
  'dm-serif-display-latin-ext.woff2',
  'dm-serif-display-italic-latin.woff2',
  'dm-serif-display-italic-latin-ext.woff2'
];

test('las fuentes se sirven desde la propia web con font-display: swap', async () => {
  const css = String(await read('base.css'));
  const faces = css.match(/@font-face \{[^}]+\}/g) || [];
  assert.equal(faces.length, 12, 'DM Sans 400–700 y DM Serif Display normal y cursiva, latino y latino extendido');
  for (const face of faces) {
    assert.match(face, /font-display: swap/);
    assert.match(face, /src: url\('\/assets\/fonts\/[a-z-]+\.woff2'\) format\('woff2'\)/);
  }
  for (const weight of ['400', '500', '600', '700']) {
    assert.ok(faces.some((face) => face.includes("'DM Sans'") && face.includes(`font-weight: ${weight};`)), `DM Sans ${weight}`);
  }
  assert.ok(faces.some((face) => face.includes("'DM Serif Display'") && face.includes('font-style: italic')));
});

test('los archivos woff2 existen y son woff2 válidos', async () => {
  for (const file of FONT_FILES) {
    const data = await read(`assets/fonts/${file}`);
    assert.equal(data.subarray(0, 4).toString('latin1'), 'wOF2', file);
  }
});

test('sin Google Fonts: ni en el HTML ni en la CSP; las fuentes van en la caché offline', async () => {
  const [html, vercel, build] = await Promise.all([read('index.html'), read('vercel.json'), read('scripts/build.mjs')].map((promise) => promise.then(String)));
  for (const source of [html, vercel]) assert.doesNotMatch(source, /fonts\.(googleapis|gstatic)\.com/);
  assert.match(vercel, /font-src 'self';/);
  assert.match(vercel, /style-src 'self' 'unsafe-inline';/);
  assert.match(html, /<link rel="preload" href="\/assets\/fonts\/dm-sans-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
  for (const file of FONT_FILES) assert.ok(build.includes(`'/assets/fonts/${file}'`), file);
});

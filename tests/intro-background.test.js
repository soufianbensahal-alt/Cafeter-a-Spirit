import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('la intro cubre el viewport dinámico y todas las safe areas con el amarillo Spirit', async () => {
  const styles = await read('../styles.css');

  assert.match(styles, /html\.splash-active body[\s\S]*?background:\s*#eecf62/i);
  assert.match(styles, /\.intro-screen[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/i);
  assert.match(styles, /\.intro-screen[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/i);
  assert.match(styles, /\.intro-screen[^}]*padding:\s*env\(safe-area-inset-top\)\s+env\(safe-area-inset-right\)\s+env\(safe-area-inset-bottom\)\s+env\(safe-area-inset-left\)/i);
  assert.match(styles, /\.intro-screen[^}]*background:\s*#eecf62/i);
});

test('la carga inicial pinta la safe area amarilla antes de renderizar y conserva viewport-fit', async () => {
  const html = await read('../index.html');

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /classList\.toggle\('splash-active', startsWithSplash\)/);
  assert.match(html, /startsWithSplash\s*\?\s*'#eecf62'/);
  assert.equal((html.match(/<meta[^>]+name="viewport"/g) || []).length, 1);
});

test('la clase y theme-color temporales se restauran al abandonar la intro', async () => {
  const app = await read('../app.js');

  assert.match(app, /const active = state\.screen === 'intro'/);
  assert.match(app, /document\.documentElement\.classList\.toggle\('splash-active', active\)/);
  assert.match(app, /document\.body\.classList\.toggle\('splash-active', active\)/);
  assert.match(app, /active \? '#eecf62' : state\.theme === 'dark' \? '#171612' : '#eecf62'/);
  assert.match(app, /function finishIntro\(\)[\s\S]*?state\.screen =[\s\S]*?render\(\)/);
});

test('el manifiesto instalado mantiene el amarillo Spirit', async () => {
  const manifest = JSON.parse(await read('../manifest.webmanifest'));

  assert.equal(manifest.background_color.toLowerCase(), '#eecf62');
  assert.equal(manifest.theme_color.toLowerCase(), '#eecf62');
});

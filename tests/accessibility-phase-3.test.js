import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { accessibleDialogMarkup } from '../services/accessible-modal.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('el live region global se sustituye por un anunciador dedicado', async () => {
  const html = await read('index.html');
  assert.match(html, /<div id="app"><\/div>/);
  assert.doesNotMatch(html, /id="app"[^>]*aria-live/);
  assert.match(html, /id="app-announcer"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="modal-root"/);
});

test('el generador de modal exige nombre accesible', () => {
  assert.throws(() => accessibleDialogMarkup({ content: 'Contenido' }), /labelledBy/);
  const html = accessibleDialogMarkup({
    content: '<h2 id="dialog-title">Título</h2>',
    labelledBy: 'dialog-title',
    describedBy: 'dialog-copy',
    className: 'modal--form'
  });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="dialog-title"/);
  assert.match(html, /aria-describedby="dialog-copy"/);
  assert.match(html, /tabindex="-1"/);
});

test('el controlador centraliza Escape, trampa de foco, inert y restauración', async () => {
  const controller = await read('services/accessible-modal.js');
  assert.match(controller, /event\.key === 'Escape'/);
  assert.match(controller, /event\.key !== 'Tab'/);
  assert.match(controller, /appRoot\.inert = true/);
  assert.match(controller, /appRoot\.inert = false/);
  assert.match(controller, /previousFocus\.focus\(\)/);
  assert.match(controller, /event\.target === backdrop/);
});

test('todos los paneles de cliente están etiquetados y el contador no satura lectores', async () => {
  const app = await read('app.js');
  for (const id of [
    'stamp-request-title',
    'personal-dialog-title',
    'appearance-dialog-title',
    'language-dialog-title',
    'password-dialog-title',
    'delete-account-dialog-title'
  ]) assert.match(app, new RegExp(`id="${id}"`));
  assert.match(app, /role="timer" aria-live="off"/);
  assert.doesNotMatch(app, /document\.querySelector\('\[data-sheet-backdrop\]'\)\?\.remove\(\)/);
});

test('la matriz visual incluye iPhone, Android, tablet y escritorio', async () => {
  const config = await read('playwright.config.js');
  assert.match(config, /Pixel 7/);
  assert.match(config, /iPhone 14/);
  assert.match(config, /iPad Pro 11/);
  assert.match(config, /Desktop Chrome/);
});

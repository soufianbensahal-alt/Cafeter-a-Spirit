import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('los errores de columnas ausentes no se muestran literalmente al usuario', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

  assert.match(app, /42703:\s*t\('operationError'\)/);
  assert.match(app, /PGRST204:\s*t\('operationError'\)/);
});

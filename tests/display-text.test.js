import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayText } from '../services/display-text.js';

test('displayText preserves safe textual errors', () => {
  assert.equal(displayText(new Error('Error de red'), 'Error inesperado'), 'Error de red');
  assert.equal(displayText({ message: 'Credenciales incorrectas' }, 'Error inesperado'), 'Credenciales incorrectas');
});

test('displayText never renders objects or serialized empty objects', () => {
  assert.equal(displayText({}, 'Error inesperado'), 'Error inesperado');
  assert.equal(displayText({ message: {} }, 'Error inesperado'), 'Error inesperado');
  assert.equal(displayText('{\u007d', 'Error inesperado'), 'Error inesperado');
  assert.equal(displayText('[object Object]', 'Error inesperado'), 'Error inesperado');
});

test('client and business error renderers use the safe text converter', async () => {
  const [client, business] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../business/business-view.js', import.meta.url), 'utf8')
  ]);

  assert.match(client, /const escapeHTML = \(value = ''\) => displayText\(value\)/);
  assert.match(client, /displayText\(error, t\('operationError'\)\)/);
  assert.match(business, /const escapeHTML = \(value = ''\) => displayText\(value\)/);
  assert.match(business, /return displayText\(error, 'Ha ocurrido un error inesperado/);
});

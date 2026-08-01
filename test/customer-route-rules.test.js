import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCustomerScreen } from '../services/customer-route-rules.js';

test('la recuperación de contraseña conserva su pantalla dedicada', () => {
  assert.equal(initialCustomerScreen({ passwordRecovery: true }), 'login');
});

test('la entrada normal mantiene la introducción', () => {
  assert.equal(initialCustomerScreen(), 'intro');
});

test('confirmación y login utilizan sus pantallas públicas sin pasar por la intro', () => {
  assert.equal(initialCustomerScreen({ emailConfirmation: true }), 'emailConfirmation');
  assert.equal(initialCustomerScreen({ login: true }), 'login');
});

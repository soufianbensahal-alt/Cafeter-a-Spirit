import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraConstraints, cameraPermissionFromError } from '../services/camera-rules.js';

test('móvil solicita por defecto la cámara trasera', () => {
  assert.deepEqual(cameraConstraints({ mobile: true }), { facingMode: { ideal: 'environment' } });
});

test('escritorio utiliza la webcam predeterminada', () => {
  assert.equal(cameraConstraints({ mobile: false }), true);
});

test('la selección manual de cámara tiene prioridad', () => {
  assert.deepEqual(cameraConstraints({ deviceId: 'camera-2', mobile: true }), { deviceId: { exact: 'camera-2' } });
});

test('los rechazos de permisos quedan diferenciados', () => {
  assert.equal(cameraPermissionFromError('NotAllowedError'), 'denied');
  assert.equal(cameraPermissionFromError('NotReadableError'), 'error');
});

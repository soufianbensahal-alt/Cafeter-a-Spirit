export function cameraConstraints({ deviceId = '', mobile = false } = {}) {
  if (deviceId) return { deviceId: { exact: deviceId } };
  if (mobile) return { facingMode: { ideal: 'environment' } };
  return true;
}

export function cameraPermissionFromError(errorName = '') {
  if (['NotAllowedError', 'SecurityError'].includes(errorName)) return 'denied';
  return 'error';
}

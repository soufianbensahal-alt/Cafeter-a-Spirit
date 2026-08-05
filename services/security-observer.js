const summarizeError = (error) => Object.freeze({
  name: String(error?.name || 'Error').slice(0, 80),
  code: String(error?.code || 'unexpected').slice(0, 80),
  message: String(error?.message || 'Unexpected security error').slice(0, 240)
});

export function reportSecurityError(area, error) {
  const detail = Object.freeze({
    area: String(area || 'application').slice(0, 80),
    error: summarizeError(error),
    occurredAt: new Date().toISOString()
  });

  console.error(`[Spirit security:${detail.area}]`, detail.error);
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('spirit:security-error', { detail }));
  }
}

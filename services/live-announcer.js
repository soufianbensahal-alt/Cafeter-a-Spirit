export function createLiveAnnouncer(element) {
  if (!element) throw new TypeError('Se necesita un elemento para los anuncios accesibles.');
  let timer = 0;
  const announce = (message, { assertive = false } = {}) => {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) return;
    clearTimeout(timer);
    element.setAttribute('role', assertive ? 'alert' : 'status');
    element.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    element.textContent = '';
    timer = setTimeout(() => { element.textContent = text; }, 20);
  };
  return { announce };
}

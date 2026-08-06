const INVALID_DISPLAY_TEXT = new Set(['{}', '[object Object]']);

const validText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
};

export function displayText(value, fallback = '') {
  const candidates = [
    value,
    value instanceof Error ? value.message : '',
    value?.message,
    value?.error_description,
    value?.error
  ];

  for (const candidate of candidates) {
    const text = validText(candidate);
    if (text && !INVALID_DISPLAY_TEXT.has(text)) return text;
  }

  const fallbackText = validText(fallback);
  return INVALID_DISPLAY_TEXT.has(fallbackText) ? '' : fallbackText;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createThemePreferenceController,
  normalizeThemePreference,
  readThemePreference
} from '../services/theme-preference.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
};

const mediaEnvironment = (initialMatches = false, legacy = false) => {
  let matches = initialMatches;
  const listeners = new Set();
  const query = {
    get matches() { return matches; },
    ...(legacy ? {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener)
    } : {
      addEventListener: (event, listener) => event === 'change' && listeners.add(listener),
      removeEventListener: (event, listener) => event === 'change' && listeners.delete(listener)
    })
  };
  return {
    matchMedia: () => query,
    emit(nextMatches) {
      matches = nextMatches;
      [...listeners].forEach((listener) => listener({ matches }));
    },
    listenerCount: () => listeners.size
  };
};

const controllerEnvironment = ({ stored, systemDark = false, legacy = false } = {}) => {
  const storage = memoryStorage(stored ? { 'spirit-theme': stored } : {});
  const media = mediaEnvironment(systemDark, legacy);
  const documentElement = { dataset: {} };
  const themeColorElement = {
    content: '',
    setAttribute(name, value) { if (name === 'content') this.content = value; }
  };
  const controller = createThemePreferenceController({
    storage,
    documentElement,
    themeColorElement,
    matchMediaImpl: media.matchMedia
  });
  return { controller, storage, media, documentElement, themeColorElement };
};

test('Sistema aparece junto a Claro y Oscuro en el selector existente', async () => {
  const app = await read('app.js');
  assert.match(app, /\['system', 'systemTheme'\]/);
  assert.match(app, /\['light', 'lightTheme'\]/);
  assert.match(app, /\['dark', 'darkTheme'\]/);
  assert.match(app, /data-theme-preference/);
});

test('system resuelve el tema del dispositivo y lo actualiza sin recargar', () => {
  const environment = controllerEnvironment({ systemDark: true });
  environment.controller.apply('system');

  assert.equal(environment.documentElement.dataset.theme, 'dark');
  assert.equal(environment.media.listenerCount(), 1);

  environment.media.emit(false);
  assert.equal(environment.documentElement.dataset.theme, 'light');
  assert.equal(environment.themeColorElement.content, '#eecf62');
});

test('light y dark ignoran el sistema y eliminan su listener', () => {
  const environment = controllerEnvironment({ systemDark: true });
  environment.controller.apply('system');
  environment.controller.apply('light');

  assert.equal(environment.documentElement.dataset.theme, 'light');
  assert.equal(environment.media.listenerCount(), 0);
  environment.media.emit(true);
  assert.equal(environment.documentElement.dataset.theme, 'light');

  environment.controller.apply('dark');
  assert.equal(environment.documentElement.dataset.theme, 'dark');
  assert.equal(environment.media.listenerCount(), 0);
});

test('cambiar de light a system aplica el sistema y no duplica listeners', () => {
  const environment = controllerEnvironment({ systemDark: false, legacy: true });
  environment.controller.apply('light');
  environment.controller.apply('system');
  environment.controller.apply('system');

  assert.equal(environment.documentElement.dataset.theme, 'light');
  assert.equal(environment.media.listenerCount(), 1);
  environment.media.emit(true);
  assert.equal(environment.documentElement.dataset.theme, 'dark');
});

test('la preferencia system se guarda y se conserva al recargar', () => {
  const environment = controllerEnvironment({ systemDark: true });
  environment.controller.apply('system', { persist: true });

  assert.equal(environment.storage.getItem('spirit-theme'), 'system');
  assert.equal(readThemePreference(environment.storage), 'system');

  const reloaded = createThemePreferenceController({
    storage: environment.storage,
    documentElement: { dataset: {} },
    themeColorElement: { setAttribute() {} },
    matchMediaImpl: environment.media.matchMedia
  });
  reloaded.apply(readThemePreference(environment.storage));
  assert.equal(reloaded.getPreference(), 'system');
  assert.equal(reloaded.getEffectiveTheme(), 'dark');
  reloaded.destroy();
});

test('usuarios existentes conservan light o dark y valores inválidos usan system', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('invalid'), 'system');
  assert.equal(readThemePreference(memoryStorage({ 'spirit-theme': 'dark' })), 'dark');
});

test('la carga inicial resuelve system antes de renderizar y tiene fallback claro', async () => {
  const startup = await read('startup.js');
  assert.match(startup, /\['system', 'light', 'dark'\]\.includes\(savedTheme\)/);
  assert.match(startup, /preference === 'system'/);
  assert.match(startup, /typeof matchMedia === 'function'/);
  assert.match(startup, /document\.documentElement\.dataset\.theme = theme/);
});

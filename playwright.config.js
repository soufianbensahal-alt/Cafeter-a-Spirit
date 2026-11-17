import { defineConfig, devices } from '@playwright/test';

const enabled = process.env.SPIRIT_E2E === '1';
// Opcional y solo local: SPIRIT_E2E_CHROME=1 añade un proyecto que usa el
// Google Chrome instalado (channel 'chrome') en lugar del Chromium de Playwright.
// Sin la variable, la lista de proyectos queda exactamente igual.
const useInstalledChrome = process.env.SPIRIT_E2E_CHROME === '1';
const supabaseUrl = process.env.SPIRIT_E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const publishableKey = process.env.SPIRIT_E2E_SUPABASE_PUBLISHABLE_KEY || '';

if (enabled && supabaseUrl.includes('iabuhjhyvsqhtiqowarq')) {
  throw new Error('Los E2E destructivos no pueden ejecutarse contra producción.');
}
if (enabled && !publishableKey) {
  throw new Error('Falta SPIRIT_E2E_SUPABASE_PUBLISHABLE_KEY para la base desechable.');
}

// Recorrido táctil de Android (e2e/android-scroll-reach.spec.js): perfiles
// que representan la variedad real de móviles. Cada perfil solo ejecuta ese
// spec; las sesiones se inician una vez (android-auth) y se reutilizan.
const REACH_SPEC = /android-scroll-reach\.spec\.js/;
const AUTH_SETUP = /android-auth\.setup\.js/;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const androidPhone = (width, height, deviceScaleFactor, extra = {}) => ({
  ...devices['Pixel 7'],
  userAgent: ANDROID_UA,
  viewport: { width, height },
  screen: { width, height },
  deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
  ...extra
});
const reachProfiles = [
  // Estrechos.
  ['android-reach-360x640', androidPhone(360, 640, 2)],
  ['android-reach-360x780', androidPhone(360, 780, 2.75)],
  // Estándar: Pixel y Samsung/Xiaomi.
  ['android-reach-pixel-393x873', androidPhone(393, 873, 2.75)],
  ['android-reach-samsung-412x915', androidPhone(412, 915, 2.625)],
  // Grande.
  ['android-reach-430x932', androidPhone(430, 932, 3)],
  // Tablet Android.
  ['android-reach-tablet', { ...devices['Galaxy Tab S9'], userAgent: ANDROID_UA.replace(' Mobile', '') }],
  // Oppo Reno 14 5G (ColorOS): 412 px, escala 3, app instalada, tema oscuro y
  // barra de 3 botones (resta ~48 px de alto al área de la app).
  ['android-reach-oppo-reno14', androidPhone(412, 867, 3, { colorScheme: 'dark', standalone: true })],
  // Letra del sistema: Chrome la aplica como zoom de página (menos ancho útil).
  ['android-reach-letra-130', androidPhone(317, 704, 3.4125)],
  ['android-reach-letra-200', androidPhone(206, 458, 5.25)],
  // Samsung Internet / WebView: solo crece el texto.
  ['android-reach-solo-texto-200', androidPhone(412, 915, 2.625, { textScale: 2 })],
  // «Tamaño de pantalla» ampliado en Ajustes (zoom de pantalla).
  ['android-reach-zoom-pantalla', androidPhone(320, 693, 3.375)],
  // CPU lenta (gama baja).
  ['android-reach-cpu-lenta', androidPhone(360, 780, 2, { cpuThrottle: 4 })],
  // App instalada (display-mode: standalone), sin barra del navegador.
  ['android-reach-instalada', androidPhone(393, 851, 2.75, { standalone: true })]
].map(([name, use]) => ({ name, testMatch: REACH_SPEC, dependencies: ['android-auth'], use }));

export default defineConfig({
  testDir: './e2e',
  // Cuentas de prueba locales con la versión actual de la política aceptada.
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'webkit-tablet', use: { ...devices['iPad Pro 11'] } },
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    // Android: 360 px (Galaxy S8) y un Galaxy actual. Todo cambio de interfaz
    // se prueba también aquí, no solo en iPhone.
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'android-360', use: { ...devices['Galaxy S8'] } },
    { testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'android-galaxy', use: { ...devices['Galaxy S24'] } },
    // Inicia sesión una vez (cliente y empleado) para los perfiles de recorrido.
    { name: 'android-auth', testMatch: AUTH_SETUP, use: { ...devices['Pixel 7'] } },
    ...reachProfiles,
    // Oscuro forzado por el navegador (como Samsung Internet o el «oscuro
    // automático» de Chrome): sólo el spec que lo comprueba.
    {
      name: 'android-forced-dark',
      testMatch: /android-forced-dark\.spec\.js/,
      use: {
        ...devices['Galaxy S8'],
        // El oscuro automático se activa en el spec por CDP
        // (Emulation.setAutoDarkModeOverride): los flags no funcionan en headless.
        colorScheme: 'dark'
      }
    },
    ...(useInstalledChrome
      ? [{ testIgnore: [REACH_SPEC, AUTH_SETUP], name: 'chrome-mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } }]
      : [])
  ],
  webServer: enabled ? {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SPIRIT_E2E_HOOKS: '1'
    }
  } : undefined
});

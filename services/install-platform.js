// ¿Cómo se instala Spirit en este dispositivo? Función pura (sin window):
// tests/install-platform.test.js. Decide qué variante de la hoja «Instala
// Spirit» se muestra.
//
// kind:
//   installed        ya se abre como app (display-mode/navigator.standalone): nunca se ofrece.
//   desktop          ordenador: el cliente no muestra la hoja.
//   in-app           navegador interno (Instagram, Facebook, TikTok, WhatsApp): no se puede instalar.
//   android-native   Android con beforeinstallprompt (Chrome, Samsung Internet, Edge): diálogo nativo.
//   android-menu     Android sin el evento (Xiaomi, ColorOS/Oppo, Firefox, Opera…): pasos con el menú ⋮.
//   ios              iPhone/iPad: Safari, o Chrome/Edge/Firefox desde iOS 16.4.
//   ios-safari-only  otros navegadores de iOS anteriores a 16.4: hay que abrirla en Safari.

const IN_APP = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A|\[FB/],
  ['TikTok', /musical_ly|BytedanceWebview|TikTok|trill_/i],
  ['WhatsApp', /WhatsApp/i]
];

const androidBrowser = (ua) => {
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/MiuiBrowser|XiaoMi/i.test(ua)) return 'xiaomi';
  if (/HeyTapBrowser|OppoBrowser|ColorOS/i.test(ua)) return 'oppo';
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/OPR\/|Opera|OPX\//i.test(ua)) return 'opera';
  if (/EdgA\//i.test(ua)) return 'edge';
  return 'chrome';
};

const iosBrowser = (ua) => {
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/EdgiOS/i.test(ua)) return 'edge';
  if (/FxiOS/i.test(ua)) return 'firefox';
  if (/OPiOS|OPT\//i.test(ua)) return 'opera';
  return 'safari';
};

// «OS 17_2 like Mac OS X» → [17, 2]. El iPad en modo escritorio no lo indica:
// se da por moderno.
const iosVersion = (ua) => {
  const match = /\bOS (\d+)[_.](\d+)/.exec(ua);
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const atLeast = (version, major, minor) => !version || version[0] > major || (version[0] === major && version[1] >= minor);

/**
 * @param {{ userAgent?: string, maxTouchPoints?: number, standalone?: boolean, hasPrompt?: boolean }} input
 * @returns {{ kind: string, device: 'android' | 'iphone' | 'ipad' | 'desktop', browser: string, inApp: string | null }}
 */
export function detectInstallPlatform({ userAgent = '', maxTouchPoints = 0, standalone = false, hasPrompt = false } = {}) {
  const ua = String(userAgent || '');
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && Number(maxTouchPoints) > 1);
  const iphone = !ipad && /iPhone|iPod/.test(ua);
  const android = !ipad && !iphone && /Android/i.test(ua);
  const device = ipad ? 'ipad' : iphone ? 'iphone' : android ? 'android' : 'desktop';
  const inApp = device === 'desktop' ? null : (IN_APP.find(([, pattern]) => pattern.test(ua))?.[0] || null);
  const browser = device === 'android' ? androidBrowser(ua) : device === 'desktop' ? 'desktop' : iosBrowser(ua);
  const result = (kind) => ({ kind, device, browser, inApp });

  if (standalone) return result('installed');
  if (device === 'desktop') return result('desktop');
  if (inApp) return result('in-app');
  if (device === 'android') return result(hasPrompt ? 'android-native' : 'android-menu');
  if (browser !== 'safari' && !atLeast(iosVersion(ua), 16, 4)) return result('ios-safari-only');
  return result('ios');
}

// ¿Se ofrece instalar (hoja automática, fila del login y del perfil)?
export const canOfferInstall = (platform) => Boolean(platform) && !['installed', 'desktop'].includes(platform.kind);

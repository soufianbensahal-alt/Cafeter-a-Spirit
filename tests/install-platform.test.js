import test from 'node:test';
import assert from 'node:assert/strict';
import { canOfferInstall, detectInstallPlatform } from '../services/install-platform.js';

// User agents reales (abreviados donde no importa).
const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  xiaomi: 'Mozilla/5.0 (Linux; U; Android 14; es-es; 23129RAA4G Build/UKQ1.230804.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.12.1-gn',
  oppo: 'Mozilla/5.0 (Linux; U; Android 14; es-ES; CPH2609 Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.5790.168 Mobile Safari/537.36 HeyTapBrowser/45.11.4.1',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
  opera: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 OPR/86.0.0.0',
  edgeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneChromeOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,3; iOS 18_1; es_ES; es; scale=3.00; 1290x2796; 660370427)',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.104;FBBV/655;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBLC/es_ES]',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; 2201117TG Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 trill_340404 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.4.4 ByteLocale/es',
  tiktokIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/es Region/ES',
  whatsappAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.18.80',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
};

const detect = (userAgent, extra = {}) => detectInstallPlatform({ userAgent, ...extra });

test('Android con beforeinstallprompt (Chrome, Samsung, Edge): instalación nativa', () => {
  for (const [ua, browser] of [[UA.androidChrome, 'chrome'], [UA.samsung, 'samsung'], [UA.edgeAndroid, 'edge']]) {
    assert.deepEqual(detect(ua, { hasPrompt: true }), { kind: 'android-native', device: 'android', browser, inApp: null });
  }
});

test('Android sin el evento (Xiaomi, Oppo, Firefox, Opera, Chrome sin evento): pasos con el menú', () => {
  for (const [ua, browser] of [[UA.xiaomi, 'xiaomi'], [UA.oppo, 'oppo'], [UA.androidFirefox, 'firefox'], [UA.opera, 'opera'], [UA.androidChrome, 'chrome']]) {
    const result = detect(ua);
    assert.equal(result.kind, 'android-menu', browser);
    assert.equal(result.browser, browser);
    assert.equal(result.device, 'android');
  }
});

test('iPhone: Safari y Chrome/Edge desde iOS 16.4 → pasos; Chrome anterior → abrir en Safari', () => {
  assert.deepEqual(detect(UA.iphoneSafari), { kind: 'ios', device: 'iphone', browser: 'safari', inApp: null });
  assert.deepEqual(detect(UA.iphoneChrome), { kind: 'ios', device: 'iphone', browser: 'chrome', inApp: null });
  assert.equal(detect(UA.iphoneEdge).browser, 'edge');
  assert.equal(detect(UA.iphoneEdge).kind, 'ios');
  assert.equal(detect(UA.iphoneChromeOld).kind, 'ios-safari-only');
});

test('iPad: con su UA o en modo escritorio (Macintosh táctil)', () => {
  assert.deepEqual(detect(UA.ipadSafari), { kind: 'ios', device: 'ipad', browser: 'safari', inApp: null });
  assert.deepEqual(detect(UA.ipadDesktop, { maxTouchPoints: 5 }), { kind: 'ios', device: 'ipad', browser: 'safari', inApp: null });
  assert.equal(detect(UA.macSafari, { maxTouchPoints: 0 }).kind, 'desktop', 'un Mac sin pantalla táctil es escritorio');
});

test('navegadores internos: Instagram, Facebook, TikTok y WhatsApp', () => {
  assert.deepEqual(detect(UA.instagramIos), { kind: 'in-app', device: 'iphone', browser: 'safari', inApp: 'Instagram' });
  assert.deepEqual(detect(UA.instagramAndroid, { hasPrompt: true }), { kind: 'in-app', device: 'android', browser: 'chrome', inApp: 'Instagram' });
  assert.equal(detect(UA.facebookIos).inApp, 'Facebook');
  assert.equal(detect(UA.tiktokAndroid).inApp, 'TikTok');
  assert.equal(detect(UA.tiktokIos).inApp, 'TikTok');
  assert.equal(detect(UA.whatsappAndroid).inApp, 'WhatsApp');
  for (const ua of [UA.facebookIos, UA.tiktokAndroid, UA.tiktokIos, UA.whatsappAndroid]) assert.equal(detect(ua).kind, 'in-app');
});

test('escritorio: no se ofrece (ni con el evento del navegador)', () => {
  assert.equal(detect(UA.desktopChrome).kind, 'desktop');
  assert.equal(detect(UA.desktopChrome, { hasPrompt: true }).kind, 'desktop');
  assert.equal(detect(UA.macSafari).kind, 'desktop');
  assert.equal(canOfferInstall(detect(UA.desktopChrome)), false);
});

test('ya instalada (standalone): nunca, en ninguna plataforma', () => {
  for (const ua of [UA.androidChrome, UA.iphoneSafari, UA.ipadSafari, UA.instagramIos, UA.desktopChrome]) {
    const result = detect(ua, { standalone: true, hasPrompt: true });
    assert.equal(result.kind, 'installed');
    assert.equal(canOfferInstall(result), false);
  }
  assert.equal(canOfferInstall(detect(UA.iphoneSafari)), true);
  assert.equal(canOfferInstall(detect(UA.instagramAndroid)), true);
  assert.equal(canOfferInstall(null), false);
  assert.equal(detect('').kind, 'desktop');
});

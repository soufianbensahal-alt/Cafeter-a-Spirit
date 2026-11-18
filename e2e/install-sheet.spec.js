import { expect, test } from '@playwright/test';

// «Instala Spirit»: hoja de la primera visita, contenido por plataforma,
// cerrar (×, atrás, deslizar) sin que vuelva, nunca con la app instalada,
// acceso desde el login y el perfil, e instalación nativa en Android.
// Perfiles: android-360, android-galaxy, webkit-mobile (iPhone) y webkit-tablet (iPad).
const e2eEnabled = process.env.SPIRIT_E2E === '1';
const accountEnabled = e2eEnabled && Boolean(process.env.SPIRIT_E2E_INSTALL_EMAIL && process.env.SPIRIT_E2E_INSTALL_PASSWORD);
const e2eTest = e2eEnabled ? test : test.skip;
const accountTest = accountEnabled ? test : test.skip;
test.use({ serviceWorkers: 'block' });

const PROJECTS = ['android-360', 'android-galaxy', 'webkit-mobile', 'webkit-tablet'];
test.beforeEach(({}, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'Solo perfiles Android, iPhone e iPad.');
});

const TITLE = 'Instala Spirit en tu móvil';
const BENEFIT = 'Abre la carta y pide en un toque, sin buscar la web.';
const DONE = '¡Listo! Ya tienes Spirit en tu pantalla de inicio';
const UA = {
  xiaomi: 'Mozilla/5.0 (Linux; U; Android 14; es-es; 23129RAA4G Build/UKQ1.230804.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.12.1-gn',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,3; iOS 18_1; es_ES; es; scale=3.00; 1290x2796; 660370427)',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; 2201117TG Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 trill_340404 AppName/musical_ly app_version/34.4.4',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1'
};

const isAndroid = (testInfo) => testInfo.project.name.startsWith('android');
const sheet = (page) => page.locator('[data-install-sheet]');
const dialog = (page) => page.getByRole('dialog', { name: TITLE });
const loginRow = (page) => page.locator('[data-install-row]');

// Simula lo que la app hace al terminar la primera visita (onboarding hecho y
// hoja pendiente) y añade, si se pide, el evento de Chrome y el modo instalado.
async function prepare(page, { firstVisit = true, nativePrompt = false, standalone = false } = {}) {
  await page.addInitScript(([first, native, installed]) => {
    localStorage.setItem('spirit-onboarded', '1');
    if (first) localStorage.setItem('spirit-install-first-visit', '1');
    window.__installCalls = 0;
    window.__fireInstall = () => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.__installCalls += 1; };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    };
    if (native) window.addEventListener('DOMContentLoaded', () => window.__fireInstall(), { once: true });
    if (installed) {
      Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query)
        ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
        : original(query));
    }
  }, [firstVisit, nativePrompt, standalone]);
}

async function openMenu(page) {
  await page.locator('section.guest-entry').getByRole('button', { name: 'Ver la carta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
}

async function newPage(browser, testInfo, extra = {}) {
  const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block', ...extra });
  return context.newPage();
}

async function expectPlatformContent(page, testInfo) {
  const body = sheet(page);
  if (isAndroid(testInfo)) {
    await expect(body).toHaveAttribute('data-install-kind', 'android-menu');
    await expect(body.getByText('Abre el menú ⋮ y elige «Instalar app» o «Añadir a pantalla de inicio».')).toBeVisible();
    return;
  }
  await expect(body).toHaveAttribute('data-install-kind', 'ios');
  const steps = body.locator('ol.install-sheet__steps > li');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toContainText('Toca Compartir');
  await expect(steps.nth(0).locator('svg.install-sheet__share')).toBeVisible();
  await expect(steps.nth(1)).toHaveText('Elige «Añadir a pantalla de inicio»');
  await expect(steps.nth(2)).toHaveText('Si aparece «Abrir como app web», actívalo');
  await expect(steps.nth(3)).toHaveText('Toca «Añadir»');
  const ipad = testInfo.project.name === 'webkit-tablet';
  await expect(body).toHaveAttribute('data-install-device', ipad ? 'ipad' : 'iphone');
  await expect(body.getByText(ipad ? 'Compartir está arriba, junto a la barra de direcciones.' : 'En Safari, Compartir está abajo o en el menú ···. En Chrome, arriba a la derecha.')).toBeVisible();
}

async function expectTouchTargets(page) {
  for (const control of await sheet(page).locator('button, a').all()) {
    const box = await control.boundingBox();
    expect(box.height, await control.textContent()).toBeGreaterThanOrEqual(44);
  }
}

e2eTest('primera visita: intro → onboarding → login → carta sin cuenta → la hoja sale una sola vez', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Omitir' }).first().click();
  // Onboarding: se recorre hasta «Entrar en Spirit».
  // (cada paso espera a que termine la transición anterior).
  await expect(page.getByRole('img', { name: '1 de 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('img', { name: '2 de 3' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('img', { name: '3 de 3' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Entrar en Spirit' }).click();
  await expect(page.locator('section.guest-entry')).toBeVisible();

  // En el login no sale sola; está la fila «Instala la app» bajo la promoción.
  await page.waitForTimeout(1500);
  await expect(sheet(page)).toHaveCount(0);
  await expect(loginRow(page)).toBeVisible();
  await expect(loginRow(page)).toContainText('Instala la app');
  expect((await loginRow(page).getByRole('button', { name: 'Instalar' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  const promoBottom = await page.locator('[data-signup-promo]').evaluate((element) => element.getBoundingClientRect().bottom);
  const rowTop = await loginRow(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(rowTop).toBeGreaterThanOrEqual(promoBottom);

  // En la carta (sin cuenta) aparece la hoja, con el contenido de la plataforma.
  await openMenu(page);
  await expect(dialog(page)).toBeVisible();
  await expect(sheet(page).getByText(BENEFIT)).toBeVisible();
  await expectPlatformContent(page, testInfo);
  await expectTouchTargets(page);
  // La hoja queda por encima de la barra del sistema y dentro de la pantalla.
  const box = await dialog(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');

  // Se cierra con × y no vuelve: ni al volver a la carta ni al recargar.
  await sheet(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver al inicio' }).first().click().catch(() => {});
  await page.reload();
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await openMenu(page);
  await page.waitForTimeout(1500);
  await expect(sheet(page)).toHaveCount(0);
  expect(Number(await page.evaluate(() => localStorage.getItem('spirit-install-dismissed-at')))).toBeGreaterThan(0);
});

e2eTest('cerrar con atrás y deslizando: se cierra y no vuelve', async ({ browser }, testInfo) => {
  const back = await newPage(browser, testInfo);
  await prepare(back);
  await back.goto('/login');
  await openMenu(back);
  await expect(dialog(back)).toBeVisible();
  await back.goBack({ waitUntil: 'commit' });
  await expect(sheet(back)).toHaveCount(0);
  await expect(back.getByRole('heading', { level: 1, name: 'Carta' })).toBeVisible();
  await back.waitForTimeout(1500);
  await expect(sheet(back)).toHaveCount(0);
  await back.context().close();

  const swipe = await newPage(browser, testInfo);
  await prepare(swipe);
  await swipe.goto('/login');
  await openMenu(swipe);
  await expect(dialog(swipe)).toBeVisible();
  const grab = await swipe.locator('.install-sheet__grab').boundingBox();
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await swipe.mouse.move(x, y);
  await swipe.mouse.down();
  await swipe.mouse.move(x, y + 60, { steps: 4 });
  await swipe.mouse.move(x, y + 160, { steps: 6 });
  await swipe.mouse.up();
  await expect(sheet(swipe)).toHaveCount(0);
  await swipe.reload();
  await openMenu(swipe);
  await swipe.waitForTimeout(1500);
  await expect(sheet(swipe)).toHaveCount(0);
  await swipe.context().close();
});

e2eTest('«Ahora no» y un arrastre corto: el corto no cierra, «Ahora no» sí', async ({ page }) => {
  await prepare(page);
  await page.goto('/login');
  await openMenu(page);
  await expect(dialog(page)).toBeVisible();
  const grab = await page.locator('.install-sheet__grab').boundingBox();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 4);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 30, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(dialog(page)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Ahora no' }).click();
  await expect(sheet(page)).toHaveCount(0);
});

e2eTest('Android con el evento del navegador: «Instalar app» abre el diálogo nativo y, al instalarse, aviso y sin accesos', async ({ page }, testInfo) => {
  test.skip(!isAndroid(testInfo), 'beforeinstallprompt solo existe en Android.');
  await prepare(page, { nativePrompt: true });
  await page.goto('/login');
  await expect(loginRow(page)).toBeVisible();
  await openMenu(page);
  await expect(dialog(page)).toBeVisible();
  await expect(sheet(page)).toHaveAttribute('data-install-kind', 'android-native');
  const install = sheet(page).getByRole('button', { name: 'Instalar app' });
  await expect(install).toBeFocused();
  await install.click();
  await expect.poll(() => page.evaluate(() => window.__installCalls)).toBe(1);
  await expect(sheet(page)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#toast')).toHaveText(DONE);
  await page.getByRole('button', { name: 'Volver al inicio' }).first().click().catch(() => {});
  await page.goto('/login');
  await expect(loginRow(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(loginRow(page)).toHaveCount(0);
});

e2eTest('el evento llega con la hoja abierta: pasa de los pasos al botón nativo', async ({ page }, testInfo) => {
  test.skip(!isAndroid(testInfo), 'beforeinstallprompt solo existe en Android.');
  await prepare(page);
  await page.goto('/login');
  await openMenu(page);
  await expect(sheet(page)).toHaveAttribute('data-install-kind', 'android-menu');
  await page.evaluate(() => window.__fireInstall());
  await expect(sheet(page)).toHaveAttribute('data-install-kind', 'android-native');
  await expect(sheet(page).getByRole('button', { name: 'Ahora no' })).toBeVisible();
});

e2eTest('contenido por navegador: Xiaomi, Chrome en iPhone e Instagram/TikTok', async ({ browser }, testInfo) => {
  const android = isAndroid(testInfo);
  if (android) {
    const xiaomi = await newPage(browser, testInfo, { userAgent: UA.xiaomi });
    await prepare(xiaomi);
    await xiaomi.goto('/login');
    await openMenu(xiaomi);
    await expect(sheet(xiaomi)).toHaveAttribute('data-install-kind', 'android-menu');
    await expect(sheet(xiaomi).getByText('Abre el menú ⋮')).toBeVisible();
    await xiaomi.context().close();
  } else if (testInfo.project.name === 'webkit-mobile') {
    const chrome = await newPage(browser, testInfo, { userAgent: UA.iphoneChrome });
    await prepare(chrome);
    await chrome.goto('/login');
    await openMenu(chrome);
    await expect(sheet(chrome)).toHaveAttribute('data-install-kind', 'ios');
    await expect(sheet(chrome).locator('ol > li')).toHaveCount(4);
    await chrome.context().close();
  }

  const apps = android ? [['Instagram', UA.instagramAndroid], ['TikTok', UA.tiktokAndroid]] : [['Instagram', UA.instagramIos]];
  for (const [name, userAgent] of apps) {
    const inApp = await newPage(browser, testInfo, { userAgent });
    await prepare(inApp);
    await inApp.goto('/login');
    await openMenu(inApp);
    await expect(sheet(inApp)).toHaveAttribute('data-install-kind', 'in-app');
    await expect(sheet(inApp).getByText(`Desde ${name} no se puede instalar.`)).toBeVisible();
    await expect(sheet(inApp).getByText(`Abre esta página en ${android ? 'Chrome' : 'Safari'}`)).toBeVisible();
    const chromeLink = sheet(inApp).getByRole('link', { name: 'Abrir en Chrome' });
    if (android) await expect(chromeLink).toHaveAttribute('href', /^intent:\/\/127\.0\.0\.1:4173\/#Intent;scheme=http;package=com\.android\.chrome;/);
    else await expect(chromeLink).toHaveCount(0);
    await expectTouchTargets(inApp);
    await sheet(inApp).getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(inApp.locator('#toast')).toHaveText('Enlace copiado');
    await inApp.context().close();
  }
});

e2eTest('con la app instalada no aparece nunca (ni hoja, ni fila del login)', async ({ page }) => {
  await prepare(page, { standalone: true, nativePrompt: true });
  await page.goto('/login');
  await expect(page.locator('section.guest-entry')).toBeVisible();
  await expect(loginRow(page)).toHaveCount(0);
  await openMenu(page);
  await page.waitForTimeout(1500);
  await expect(sheet(page)).toHaveCount(0);
});

e2eTest('fila del login: abre la misma hoja aunque se haya cerrado, en catalán también', async ({ page }, testInfo) => {
  await prepare(page, { firstVisit: false });
  await page.addInitScript(() => localStorage.setItem('spirit-install-dismissed-at', String(Date.now())));
  await page.goto('/login');
  await loginRow(page).getByRole('button', { name: 'Instalar' }).click();
  await expect(dialog(page)).toBeVisible();
  await expectPlatformContent(page, testInfo);
  await expect(sheet(page).getByRole('button', { name: 'Ahora no' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(loginRow(page).getByRole('button', { name: 'Instalar' })).toBeFocused();
});

accountTest('perfil: «Instalar la app» abre las instrucciones también después de cerrarla', async ({ page }, testInfo) => {
  await prepare(page, { firstVisit: false });
  await page.addInitScript(() => localStorage.setItem('spirit-install-dismissed-at', String(Date.now())));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_INSTALL_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_INSTALL_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.locator('.loyalty-card')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Perfil' }).click();
  const access = page.locator('[data-install-access]');
  await expect(access).toHaveText(/Instalar la app/);
  await access.click();
  await expect(dialog(page)).toBeVisible();
  await expectPlatformContent(page, testInfo);
  await sheet(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(access).toBeFocused();
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
});

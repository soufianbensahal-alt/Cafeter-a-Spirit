import { expect, test } from '@playwright/test';
import sharp from 'sharp';

// Oscuro forzado por el navegador (Samsung Internet, «oscuro automático» de
// Chrome). Solo en el proyecto android-forced-dark: activa el «oscuro
// automático» de Chromium por CDP (Emulation.setAutoDarkModeOverride). La app
// declara color-scheme: el navegador no debe oscurecer su tema claro ni
// retocar su tema oscuro.
const e2eEnabled = process.env.SPIRIT_E2E === '1';
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!e2eEnabled || testInfo.project.name !== 'android-forced-dark', 'Solo en el proyecto android-forced-dark.');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: true });
});

// Color pintado de verdad en (x, y) frente al color que pide el CSS ahí.
async function paintedVsDeclared(page, x, y) {
  const declared = await page.evaluate(([px, py]) => {
    let node = document.elementFromPoint(px, py);
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      const match = color.match(/rgba?\(([^)]+)\)/);
      const [r, g, b, a = 1] = match ? match[1].split(',').map(Number) : [0, 0, 0, 0];
      if (a > 0.99) return { r, g, b };
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255 };
  }, [x, y]);
  const scale = await page.evaluate(() => window.devicePixelRatio);
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
  const offset = (Math.round(y * scale) * info.width + Math.round(x * scale)) * info.channels;
  const painted = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  return { painted, declared };
}

const distance = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

test('control: sin color-scheme, el navegador sí oscurece la página', async ({ page }) => {
  await page.route('**/__control-sin-color-scheme', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#ffffff"><div style="height:400px;background:#eecf62"></div><p>Texto</p></body></html>'
  }));
  await page.goto('/__control-sin-color-scheme');
  // Fondo blanco del body, debajo del bloque mostaza.
  const { painted, declared } = await paintedVsDeclared(page, 10, 500);
  expect(distance(painted, declared), 'Si falla, este Chromium no fuerza el oscuro y el resto no prueba nada').toBeGreaterThan(40);
});

for (const [label, preference, background] of [
  ['tema claro elegido', 'light', { r: 238, g: 207, b: 98 }],
  ['tema del sistema (oscuro)', null, { r: 23, g: 22, b: 18 }]
]) {
  test(`login con ${label}: la marca no cambia`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('spirit-onboarded', '1');
      if (value) localStorage.setItem('spirit-theme', value);
    }, preference);
    await page.goto('/login');
    await expect(page.locator('section.signup-promo h2')).toBeVisible();
    await page.waitForTimeout(400);
    const screen = await paintedVsDeclared(page, 6, 200);
    expect(distance(screen.declared, background), 'fondo declarado').toBeLessThanOrEqual(2);
    expect(distance(screen.painted, screen.declared), 'fondo pintado').toBeLessThanOrEqual(6);
    // La caja de la promo (tinta en claro, mostaza en oscuro).
    await page.locator('section.signup-promo .signup-promo__benefits').scrollIntoViewIfNeeded();
    const box = await page.locator('section.signup-promo .signup-promo__benefits').boundingBox();
    // Hueco entre la lista y el borde izquierdo de la caja: solo fondo.
    const promo = await paintedVsDeclared(page, box.x - 8, box.y + 4);
    expect(distance(promo.painted, promo.declared), 'promo pintada').toBeLessThanOrEqual(10);
  });
}

// Sin la declaración, el oscuro automático deja el texto del botón claro sobre
// mostaza y hace desaparecer la taza: la promo debe verse idéntica con y sin él.
for (const preference of ['light', 'dark']) {
  test(`promo (${preference}) idéntica con y sin oscuro automático`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => {
      localStorage.setItem('spirit-onboarded', '1');
      localStorage.setItem('spirit-theme', value);
    }, preference);
    await page.goto('/login');
    const promo = page.locator('section.signup-promo');
    await expect(promo.getByText('Con 10 sellos, tu próximo café es gratis.')).toBeVisible();
    await page.waitForTimeout(300);
    const forced = await sharp(await promo.screenshot()).raw().toBuffer();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: false });
    await page.waitForTimeout(300);
    const normal = await sharp(await promo.screenshot()).raw().toBuffer();
    expect(forced.length).toBe(normal.length);
    let different = 0;
    for (let index = 0; index < forced.length; index += 1) if (Math.abs(forced[index] - normal[index]) > 12) different += 1;
    expect(different / forced.length, 'proporción de canales distintos').toBeLessThan(0.002);
  });
}

test('panel con tema claro elegido: el acceso no se oscurece', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('spirit-theme', 'light'));
  await page.goto('/cafeteria');
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await page.waitForTimeout(400);
  const { painted, declared } = await paintedVsDeclared(page, 4, 4);
  expect(distance(painted, declared)).toBeLessThanOrEqual(6);
  const card = page.locator('.signed-out-card');
  const forced = await sharp(await card.screenshot()).raw().toBuffer();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: false });
  await page.waitForTimeout(300);
  const normal = await sharp(await card.screenshot()).raw().toBuffer();
  let different = 0;
  for (let index = 0; index < forced.length; index += 1) if (Math.abs(forced[index] - normal[index]) > 12) different += 1;
  expect(different / forced.length, 'tarjeta de acceso idéntica').toBeLessThan(0.002);
  await expect(page.locator('#color-scheme')).toHaveAttribute('content', 'only light');
});

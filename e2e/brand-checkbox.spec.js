import { expect, test } from '@playwright/test';

// La casilla de consentimiento del registro usa el mismo estilo de la marca
// que «Recoger en barra»: borde visible, mostaza al marcar, 44 px tocables y
// foco visible, en claro y en oscuro. No crea cuentas ni toca la base.
const e2eTest = process.env.SPIRIT_E2E === '1' ? test : test.skip;
const MUSTARD = 'rgb(238, 207, 98)';

for (const colorScheme of ['light', 'dark']) {
  e2eTest(`consentimiento del registro con la casilla de la marca (${colorScheme})`, async ({ page, browserName }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
    await page.goto('/login');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    const checkbox = page.getByRole('checkbox', { name: /Acepto la política de privacidad/ });
    const label = page.locator('label.check').filter({ has: checkbox });
    expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const style = await checkbox.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { appearance: computed.appearance || computed.webkitAppearance, width: element.getBoundingClientRect().width, border: computed.borderTopWidth };
    });
    expect(style).toEqual({ appearance: 'none', width: 24, border: '2px' });

    await label.getByText(/Acepto la política de privacidad/).click();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveCSS('background-color', MUSTARD);

    // Navegación real con teclado desde la confirmación de contraseña. Safari
    // (WebKit) sólo lleva el Tab a las casillas con Option+Tab.
    await page.locator('#signup-password-confirmation').focus();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(checkbox).toBeFocused();
    expect(await checkbox.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    await expect(checkbox).toHaveCSS('outline-style', 'solid');
    await expect(checkbox).toHaveCSS('outline-width', '3px');
  });
}

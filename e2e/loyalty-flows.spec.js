import { expect, test } from '@playwright/test';
import * as OTPAuth from 'otpauth';

const required = [
  'SPIRIT_E2E_CUSTOMER_EMAIL',
  'SPIRIT_E2E_CUSTOMER_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_EMAIL',
  'SPIRIT_E2E_EMPLOYEE_PASSWORD',
  'SPIRIT_E2E_EMPLOYEE_TOTP_SECRET'
];
const e2eEnabled = process.env.SPIRIT_E2E === '1' && required.every((name) => process.env[name]);
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

async function customerLogin(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_CUSTOMER_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
}

async function employeeLogin(page) {
  await page.goto('/cafeteria');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
  await page.getByRole('button', { name: 'Acceder' }).click();
  const otpInput = page.getByLabel('Código de 6 dígitos');
  const home = page.getByRole('heading', { name: 'Procesa al cliente en segundos.' });
  // isVisible() no espera: se aguarda a que aparezca la pantalla TOTP o la principal.
  await expect(otpInput.or(home)).toBeVisible();
  if (await otpInput.isVisible()) {
    const token = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET),
      digits: 6,
      period: 30
    }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Procesa al cliente en segundos.' })).toBeVisible();
}

e2eTest('el modal de perfil atrapa y restaura el foco y cierra con Escape', async ({ page }) => {
  await customerLogin(page);
  await page.getByRole('button', { name: 'Perfil' }).click();
  const opener = page.getByRole('button', { name: 'Datos personales' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Datos personales' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByLabel('Nombre')).toBeFocused();
  await page.getByRole('button', { name: 'Cerrar' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Guardar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

e2eTest('un sello confirmado una sola vez genera la recompensa', async ({ browser }) => {
  // Cliente y empleado son dispositivos distintos: un contexto compartido
  // haría que /cafeteria arrancase con la sesión del cliente.
  const customerContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const employee = await employeeContext.newPage();
  await customerLogin(customer);
  await customer.getByRole('button', { name: 'Solicitar sello' }).click();
  const code = (await customer.locator('.stamp-request__code').textContent()).trim();

  await employeeLogin(employee);
  await employee.getByLabel('Código del cliente').fill(code);
  await employee.getByRole('button', { name: 'Validar código' }).click();
  await employee.getByRole('button', { name: 'Confirmar sello' }).dblclick();
  await expect(employee.getByRole('heading', { name: /Sello añadido|Sello ya procesado/ })).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Usar café gratuito' })).toBeEnabled();
  await Promise.all([customerContext.close(), employeeContext.close()]);
});

e2eTest('el canje se descuenta solo tras confirmación del empleado', async ({ browser }) => {
  // Cliente y empleado son dispositivos distintos: un contexto compartido
  // haría que /cafeteria arrancase con la sesión del cliente.
  const customerContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const employee = await employeeContext.newPage();
  await customerLogin(customer);
  await customer.getByRole('button', { name: 'Usar café gratuito' }).click();
  const code = (await customer.locator('.stamp-request__code').textContent()).trim();
  await employeeLogin(employee);
  await employee.getByLabel('Código del cliente').fill(code);
  await employee.getByRole('button', { name: 'Validar código' }).click();
  await expect(employee.getByRole('heading', { name: 'Vas a canjear 1 café gratuito.' })).toBeVisible();
  await employee.getByRole('button', { name: 'Confirmar canje' }).click();
  await expect(employee.getByRole('heading', { name: 'Premio canjeado.' })).toBeVisible();
  await expect(customer.locator('#toast').getByText(/Premio canjeado/i)).toBeVisible();
  await Promise.all([customerContext.close(), employeeContext.close()]);
});

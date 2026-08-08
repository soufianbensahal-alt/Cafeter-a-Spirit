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
  await expect(page.getByText(/Hoy toca café/i)).toBeVisible();
}

async function employeeLogin(page) {
  await page.goto('/cafeteria');
  await page.getByLabel('Correo electrónico').fill(process.env.SPIRIT_E2E_EMPLOYEE_EMAIL);
  await page.getByLabel('Contraseña').fill(process.env.SPIRIT_E2E_EMPLOYEE_PASSWORD);
  await page.getByRole('button', { name: 'Acceder' }).click();
  const otpInput = page.getByLabel('Código de 6 dígitos');
  if (await otpInput.isVisible()) {
    const token = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(process.env.SPIRIT_E2E_EMPLOYEE_TOTP_SECRET),
      digits: 6,
      period: 30
    }).generate();
    await otpInput.fill(token);
    await page.getByRole('button', { name: /Verificar y acceder/ }).click();
  }
  await expect(page.getByText('Procesa al cliente en segundos.')).toBeVisible();
}

e2eTest('un sello confirmado una sola vez genera la recompensa', async ({ browser }) => {
  const context = await browser.newContext();
  const customer = await context.newPage();
  const employee = await context.newPage();
  await customerLogin(customer);
  await customer.getByRole('button', { name: 'Solicitar sello' }).click();
  const code = (await customer.locator('.stamp-request__code').textContent()).trim();

  await employeeLogin(employee);
  await employee.getByLabel('Código del cliente').fill(code);
  await employee.getByRole('button', { name: 'Validar código' }).click();
  await employee.getByRole('button', { name: 'Confirmar sello' }).dblclick();
  await expect(employee.getByText(/Sello añadido|Sello ya procesado/)).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Usar café gratuito' })).toBeEnabled();
  await context.close();
});

e2eTest('el canje se descuenta solo tras confirmación del empleado', async ({ browser }) => {
  const context = await browser.newContext();
  const customer = await context.newPage();
  const employee = await context.newPage();
  await customerLogin(customer);
  await customer.getByRole('button', { name: 'Usar café gratuito' }).click();
  const code = (await customer.locator('.stamp-request__code').textContent()).trim();
  await employeeLogin(employee);
  await employee.getByLabel('Código del cliente').fill(code);
  await employee.getByRole('button', { name: 'Validar código' }).click();
  await expect(employee.getByText('Vas a canjear 1 café gratuito.')).toBeVisible();
  await employee.getByRole('button', { name: 'Confirmar canje' }).click();
  await expect(employee.getByText('Premio canjeado.')).toBeVisible();
  await expect(customer.getByText(/Premio canjeado/i)).toBeVisible();
  await context.close();
});

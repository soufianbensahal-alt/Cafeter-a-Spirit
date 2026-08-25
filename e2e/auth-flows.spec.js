import { expect, test } from '@playwright/test';

const e2eEnabled = process.env.SPIRIT_E2E === '1';
const e2eTest = e2eEnabled ? test : test.skip;
test.describe.configure({ mode: 'serial' });

const email = process.env.SPIRIT_E2E_NEW_EMAIL || `phase2-${Date.now()}@spirit.test`;
const password = 'Spirit-E2E-2026!';
const nextPassword = 'Spirit-E2E-2027!';
const mailboxUrl = process.env.SPIRIT_E2E_MAILBOX_URL || 'http://127.0.0.1:54324';

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('spirit-onboarded', '1'));
}

async function latestEmailLink(request, recipient, matcher) {
  await expect.poll(async () => {
    const response = await request.get(`${mailboxUrl}/api/v1/mailbox/${encodeURIComponent(recipient)}`);
    if (!response.ok()) return '';
    return JSON.stringify(await response.json());
  }, { timeout: 15_000 }).toContain(recipient.split('@')[0]);
  const mailbox = await (await request.get(`${mailboxUrl}/api/v1/mailbox/${encodeURIComponent(recipient)}`)).json();
  const messages = mailbox.messages || mailbox || [];
  for (const message of messages) {
    const id = message.id || message.ID;
    const detailResponse = await request.get(`${mailboxUrl}/api/v1/mailbox/${encodeURIComponent(recipient)}/${id}`);
    const content = detailResponse.ok() ? JSON.stringify(await detailResponse.json()) : JSON.stringify(message);
    const links = content.match(/https?:[^"'<>\\s]+/g) || [];
    const link = links.map((value) => value.replace(/\\u0026/g, '&')).find(matcher);
    if (link) return link;
  }
  throw new Error('No se encontró el enlace transaccional esperado.');
}

e2eTest('registro, confirmación de correo e inicio de sesión', async ({ page, request }) => {
  await prepare(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).first().click();
  await page.getByLabel('Nombre').fill('Cliente');
  await page.getByLabel('Apellidos').fill('E2E');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Confirmar contraseña').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).last().click();
  await expect(page.getByText(/Revisa tu correo/i)).toBeVisible();

  const confirmationLink = await latestEmailLink(request, email, (link) => /verify|auth\/v1/.test(link));
  await page.goto(confirmationLink);
  await expect(page.getByText('Correo confirmado')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  await expect(page.getByText(/Hoy toca café/i)).toBeVisible();
});

e2eTest('recuperación de contraseña y enlace de un solo uso', async ({ browser, request }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await prepare(first);
  await prepare(second);
  await first.goto('/login');
  await first.getByRole('button', { name: 'He olvidado mi contraseña' }).click();
  await first.getByLabel('Correo electrónico').fill(email);
  await first.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
  const recoveryLink = await latestEmailLink(request, email, (link) => /recovery|reset-password|verify/.test(link));
  await Promise.all([first.goto(recoveryLink), second.goto(recoveryLink)]);

  await first.getByLabel('Nueva contraseña').fill(nextPassword);
  await first.getByLabel('Confirmar nueva contraseña').fill(nextPassword);
  await first.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(first.getByText(/Contraseña actualizada/i)).toBeVisible();

  await second.reload();
  await expect(second.getByText(/enlace.*no.*válido|caducado|utilizado/i)).toBeVisible();
  await context.close();
});

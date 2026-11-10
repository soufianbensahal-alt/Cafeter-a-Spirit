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

// Mailpit (Supabase CLI actual): GET /api/v1/search devuelve los mensajes más
// recientes primero y GET /api/v1/message/{ID} el contenido HTML y texto.
// `since` descarta correos anteriores a la acción (p. ej. el de alta cuando se
// espera el de recuperación).
async function messageLinks(request, id) {
  const response = await request.get(`${mailboxUrl}/api/v1/message/${encodeURIComponent(id)}`);
  if (!response.ok()) return [];
  const message = await response.json();
  const content = `${message.HTML || ''}\n${message.Text || ''}`;
  return (content.match(/https?:\/\/[^"'<>\s]+/g) || []).map((value) => value.replace(/&amp;/g, '&'));
}

// Las plantillas enlazan al dominio público (confirmation.html lo lleva fijo):
// se conserva solo ruta y query para abrirlo contra el preview local.
const localPath = (link) => {
  const url = new URL(link);
  return `${url.pathname}${url.search}${url.hash}`;
};

async function latestEmailLink(request, recipient, matcher, { since = 0 } = {}) {
  let found = '';
  await expect.poll(async () => {
    const query = encodeURIComponent(`to:"${recipient}"`);
    const response = await request.get(`${mailboxUrl}/api/v1/search?query=${query}&limit=20`);
    if (!response.ok()) return '';
    const { messages = [] } = await response.json();
    for (const message of messages) {
      if (Date.parse(message.Created) < since) continue;
      const link = (await messageLinks(request, message.ID)).find(matcher);
      if (link) {
        found = link;
        return link;
      }
    }
    return '';
  }, { timeout: 15_000, message: `Enlace transaccional para ${recipient}` }).not.toBe('');
  return found;
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
  const sentAfter = Date.now() - 2000;
  await page.getByRole('button', { name: 'Crear mi cuenta' }).last().click();
  await expect(page.getByText(/Revisa tu correo/i)).toBeVisible();

  const confirmationLink = await latestEmailLink(request, email, (link) => /\/auth\/confirm\?.*token_hash=.*type=email/.test(link), { since: sentAfter });
  await page.goto(localPath(confirmationLink));
  await expect(page.getByText('Correo confirmado')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).last().click();
  // El live-announcer repite el título: se busca el <h1> por rol.
  await expect(page.getByRole('heading', { level: 1, name: /Hoy toca café/i })).toBeVisible();
});

e2eTest('recuperación de contraseña y enlace de un solo uso', async ({ browser, request }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await prepare(first);
  await first.goto('/login');
  await first.getByRole('button', { name: 'He olvidado mi contraseña' }).click();
  await first.getByLabel('Correo electrónico').fill(email);
  const requestedAfter = Date.now() - 2000;
  await first.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
  const recoveryLink = await latestEmailLink(request, email, (link) => /token_hash=.*type=recovery/.test(link), { since: requestedAfter });
  await first.goto(localPath(recoveryLink));

  await first.getByLabel('Nueva contraseña', { exact: true }).fill(nextPassword);
  await first.getByLabel('Confirmar nueva contraseña').fill(nextPassword);
  await first.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(first.getByText(/Contraseña actualizada/i)).toBeVisible();

  // El token_hash se verifica al guardar. Reabrir el mismo enlace (en otro
  // dispositivo: contexto nuevo, sin el estado de la primera pestaña) e intentar
  // usarlo de nuevo debe ser rechazado por el servidor.
  const otherDevice = await browser.newContext();
  const second = await otherDevice.newPage();
  await prepare(second);
  await second.goto(localPath(recoveryLink));
  await second.getByLabel('Nueva contraseña', { exact: true }).fill('Spirit-E2E-2028!');
  await second.getByLabel('Confirmar nueva contraseña').fill('Spirit-E2E-2028!');
  await second.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(second.getByText('El enlace ha caducado, ya se ha utilizado o no puede verificarse.', { exact: false }).first()).toBeVisible();
  await Promise.all([context.close(), otherDevice.close()]);
});

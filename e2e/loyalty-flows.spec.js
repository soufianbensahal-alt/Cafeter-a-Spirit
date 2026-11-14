import { expect, test } from '@playwright/test';
import pg from 'pg';
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

// Estado propio: la tarjeta del cliente de E2E empieza a 9 sellos (el sello
// del test genera la recompensa y el canje la consume). Al terminar se deja
// la tarjeta como estaba y se borran las notificaciones creadas por el test.
// Solo contra la base local desechable.
const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BUSINESS_NAME = 'Cafetería Spirit - Montcada';

async function withDatabase(run) {
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) throw new Error('Solo base local.');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

const CARD_QUERY = `select card.id, card.current_stamps, card.available_rewards, card.total_rewards_earned, program.stamps_required
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = program.business_id
  join auth.users as customer on customer.id = card.customer_id
  where lower(customer.email) = lower($1) and lower(btrim(business.name)) = lower(btrim($2))`;

let savedCard = null;
let startedAt = null;

test.beforeAll(async () => {
  if (!e2eEnabled) return;
  await withDatabase(async (db) => {
    const { rows: [card] } = await db.query(CARD_QUERY, [process.env.SPIRIT_E2E_CUSTOMER_EMAIL, BUSINESS_NAME]);
    if (!card) throw new Error('El cliente de E2E no tiene tarjeta de Spirit Montcada en la base local.');
    savedCard = card;
    startedAt = (await db.query('select clock_timestamp() as now')).rows[0].now;
    // Un sello menos que la recompensa y ninguna recompensa pendiente.
    await db.query('update public.customer_cards set current_stamps = $2, available_rewards = 0 where id = $1', [card.id, card.stamps_required - 1]);
  });
});

test.afterAll(async () => {
  if (!e2eEnabled || !savedCard) return;
  await withDatabase(async (db) => {
    await db.query('begin');
    try {
      await db.query('delete from public.reward_notifications where customer_card_id = $1 and created_at >= $2', [savedCard.id, startedAt]);
      // total_rewards_earned solo crece (trigger track_reward_sequence): para
      // dejar la tarjeta como estaba se omiten los triggers en esta transacción.
      await db.query('set local session_replication_role = replica');
      await db.query('update public.customer_cards set current_stamps = $2, available_rewards = $3, total_rewards_earned = $4 where id = $1',
        [savedCard.id, savedCard.current_stamps, savedCard.available_rewards, savedCard.total_rewards_earned]);
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  });
});

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

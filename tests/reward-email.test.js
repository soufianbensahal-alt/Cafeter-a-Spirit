import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderRewardEmail,
  sendWithResend
} from '../supabase/functions/send-reward-email/email.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la plantilla Spirit es legible sin imágenes y escapa datos variables', () => {
  const html = renderRewardEmail({
    displayName: '<Soufian>',
    rewardDescription: '<Café gratuito>',
    appUrl: 'https://www.spiritcoffee.es/'
  });

  assert.match(html, /¡Enhorabuena, &lt;Soufian&gt;!/);
  assert.match(html, /&lt;Café gratuito&gt;/);
  assert.match(html, /Has completado tu tarjeta Spirit/);
  assert.match(html, /https:\/\/www\.spiritcoffee\.es\/email\/logo-white\.png/);
  assert.match(html, /https:\/\/www\.spiritcoffee\.es\/email\/paw-pattern\.png/);
  assert.match(html, /Ver mi recompensa/);
  assert.doesNotMatch(html, /<Soufian>|<Café gratuito>/);
});

test('Resend recibe un idempotency key estable y no expone datos fuera del body', async () => {
  let request;
  const fetchMock = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'resend-id-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const id = await sendWithResend({
    fetchImpl: fetchMock,
    apiKey: 'test-api-key',
    from: 'Spirit <test@spirit.test>',
    to: 'customer@spirit.test',
    subject: 'Premio',
    html: '<p>Premio</p>',
    idempotencyKey: 'spirit-reward-notification-id'
  });

  assert.equal(id, 'resend-id-1');
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers['Idempotency-Key'], 'spirit-reward-notification-id');
  assert.equal(request.options.headers.Authorization, 'Bearer test-api-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    from: 'Spirit <test@spirit.test>',
    to: ['customer@spirit.test'],
    subject: 'Premio',
    html: '<p>Premio</p>'
  });
});

test('un error de Resend falla de forma controlada y no se interpreta como enviado', async () => {
  await assert.rejects(
    sendWithResend({
      fetchImpl: async () => new Response(
        JSON.stringify({ message: 'dominio no verificado' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      ),
      apiKey: 'test-api-key',
      from: 'Spirit <test@spirit.test>',
      to: 'customer@spirit.test',
      subject: 'Premio',
      html: '<p>Premio</p>',
      idempotencyKey: 'spirit-reward-notification-id'
    }),
    /dominio no verificado/
  );
});

test('la Edge Function usa Auth Admin, claim atómico y autorización interna', async () => {
  const edge = await read('supabase/functions/send-reward-email/index.ts');
  const migration = await read(
    'supabase/migrations/20260729234225_add_reward_email_outbox.sql'
  );
  const cron = await read('supabase/cron/schedule_reward_emails.sql');

  assert.match(edge, /x-reward-email-secret/);
  assert.match(edge, /verify_reward_email_worker_secret/);
  assert.match(edge, /claim_reward_email_notification/);
  assert.match(edge, /auth\.admin\.getUserById/);
  assert.match(edge, /RESEND_API_KEY/);
  assert.match(edge, /RESEND_FROM_EMAIL/);
  assert.match(edge, /spirit-reward-\$\{notification\.id\}/);
  assert.doesNotMatch(edge, /request(?:ed)?\.email|body\?\.email/);

  assert.match(migration, /for update skip locked/);
  assert.match(migration, /unique \(customer_card_id, reward_sequence\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /new\.available_rewards > old\.available_rewards/);
  assert.match(cron, /spirit_reward_email_worker_secret/);
  assert.match(cron, /'\* \* \* \* \*'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('las notificaciones se activan con consentimiento y una suscripción Web Push real', async () => {
  const service = await read('../services/push-notification-service.js');

  assert.match(service, /Notification\.requestPermission\(\)/);
  assert.match(service, /userVisibleOnly: true/);
  assert.match(service, /register_own_push_subscription/);
  assert.match(service, /unregister_own_push_subscription/);
  assert.match(service, /ios_install_required/);
  assert.doesNotMatch(service, /service_role/i);
});

test('el service worker muestra el aviso y abre los accesos rápidos', async () => {
  const worker = await read('../sw.js');

  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(worker, /\/#quick-access/);
});

test('el envío recurrente solo reclama suscripciones con dos días de antigüedad', async () => {
  const migration = await read('../supabase/migrations/20260723210447_add_web_push_notifications.sql');
  const sender = await read('../supabase/functions/send-quick-access-reminders/index.ts');

  assert.match(migration, /last_notified_at <= now\(\) - interval '2 days'/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /enable row level security/);
  assert.match(sender, /claim_due_push_subscriptions/);
  assert.match(sender, /Pots accedir als nostres accessos ràpids/);
  assert.match(sender, /Puedes acceder a nuestros accesos rápidos/);
});

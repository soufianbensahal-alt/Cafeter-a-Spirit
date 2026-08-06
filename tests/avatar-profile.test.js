import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.__SUPABASE_URL__ = '';
globalThis.__SUPABASE_PUBLISHABLE_KEY__ = '';

const { versionedAvatarUrl } = await import('../services/avatar-service.js');
const { deriveUserContexts } = await import('../services/user-context-rules.js');

test('el avatar persistido utiliza una versión de caché y las previsualizaciones locales no se alteran', () => {
  assert.equal(
    versionedAvatarUrl('https://example.supabase.co/avatar.jpg', '2026-08-06T19:30:00Z'),
    'https://example.supabase.co/avatar.jpg?v=2026-08-06T19%3A30%3A00Z'
  );
  assert.equal(versionedAvatarUrl('blob:https://spiritcoffee.es/preview', 123), 'blob:https://spiritcoffee.es/preview');
  assert.equal(versionedAvatarUrl('', 123), '');
});

test('el contexto único del usuario transporta avatar_url y updated_at', () => {
  const context = deriveUserContexts({
    user: { id: 'user-1', email: 'spirit@example.com', user_metadata: {} },
    profile: {
      display_name: 'Spirit User',
      avatar_url: 'https://example.supabase.co/avatar.jpg',
      updated_at: '2026-08-06T19:30:00Z'
    }
  });
  assert.equal(context.avatarUrl, 'https://example.supabase.co/avatar.jpg');
  assert.equal(context.avatarUpdatedAt, '2026-08-06T19:30:00Z');
});

test('la interfaz prioriza la foto, revierte a iniciales al fallar y persiste en Supabase', async () => {
  const [app, avatarService, business, migration] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../services/avatar-service.js', import.meta.url), 'utf8'),
    readFile(new URL('../business/business-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260806193805_add_profile_avatars.sql', import.meta.url), 'utf8')
  ]);
  assert.match(app, /state\.profile\.avatarLoadFailed = true/);
  assert.match(app, /syncAvatarElements\(\)/);
  assert.match(app, /uploadOwnAvatar\(imageBlob\)/);
  assert.match(avatarService, /\.update\(\{ avatar_url: avatarUrl \}\)/);
  assert.match(avatarService, /upsert: true/);
  assert.match(business, /employeeAvatar\(\)/);
  assert.match(migration, /add column avatar_url text/);
  assert.match(migration, /'spirit-avatars'/);
  assert.match(migration, /name = \(select auth\.uid\(\)\)::text \|\| '\/avatar\.jpg'/);
});

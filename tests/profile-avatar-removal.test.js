import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

test('el perfil conserva iniciales y no ofrece carga de fotografías', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /data-photo-input|changePhoto|imageToAvatar|profile\.photo|avatar_url/);
  assert.match(app, /const avatar = \(className = 'avatar'\) => `<span/);
});

test('el servicio de avatares se ha retirado y la migración elimina su esquema', async () => {
  await assert.rejects(access(new URL('../services/avatar-service.js', import.meta.url)));
  const migration = await readFile(
    new URL('../supabase/migrations/20260806195221_remove_profile_avatars.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /drop policy if exists "spirit_avatars_select_own"/);
  assert.match(migration, /drop column if exists avatar_url/);
});

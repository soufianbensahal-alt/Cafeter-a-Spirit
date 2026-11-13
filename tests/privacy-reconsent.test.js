import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { needsReconsent } from '../services/privacy-consent-rules.js';
import { LEGAL_COPY, renderConsentScreen } from '../client/legal-view.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const t = (key) => LEGAL_COPY.es[key] || key;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('se pide aceptar si no hay versión o si la aceptada es anterior', () => {
  assert.equal(needsReconsent(null, '2026-08-05'), true);
  assert.equal(needsReconsent('', '2026-08-05'), true);
  assert.equal(needsReconsent('2026-08-05', '2026-08-05'), false);
  assert.equal(needsReconsent('2026-08-05', '2027-01-15'), true);
  assert.equal(needsReconsent('2027-01-15', '2026-08-05'), false);
});

test('pantalla de reconsentimiento: política, casilla, aceptar y cerrar sesión', () => {
  const html = renderConsentScreen({ lang: 'es', translate: t, escapeHTML });
  assert.match(html, /<h1 tabindex="-1" data-screen-heading>Hemos actualizado la política de privacidad<\/h1>/);
  assert.match(html, /<article class="consent-policy" aria-label="Política de privacidad">/);
  assert.match(html, /<h2>1\. Responsable del tratamiento<\/h2>/);
  assert.match(html, /role="note">Borrador pendiente de revisión legal/);
  assert.match(html, /<input type="checkbox" name="accept" value="yes" required><span>He leído y acepto la política de privacidad\.<\/span>/);
  assert.match(html, /data-action="consent-logout">Cerrar sesión</);
  assert.match(renderConsentScreen({ lang: 'es', translate: t, escapeHTML, checking: true }), /role="status"><span class="auth-spinner"[^>]*><\/span><p>Comprobando tu consentimiento…<\/p>/);
  assert.match(renderConsentScreen({ lang: 'es', translate: t, escapeHTML, busy: true }), /<button class="primary-button" type="submit" disabled>/);
  assert.deepEqual(Object.keys(LEGAL_COPY.ca).sort(), Object.keys(LEGAL_COPY.es).sort());
});

test('app.js: comprueba al iniciar sesión, bloquea hasta aceptar y no afecta a invitados', async () => {
  const app = await read('app.js');
  assert.match(app, /if \(context\.userId && state\.consentCheckedFor !== context\.userId\) void checkPrivacyConsent\(context\.userId\);/);
  assert.match(app, /needsReconsent\(await getLatestAcceptedPolicyVersion\(\), PRIVACY_POLICY_VERSION\)/);
  assert.match(app, /&& !state\.isGuest\n    && \['checking', 'required'\]\.includes\(state\.consentStatus\)/);
  assert.match(app, /await acceptPrivacyPolicy\(PRIVACY_POLICY_VERSION\);/);
  assert.match(app, /const PRIVACY_POLICY_VERSION = '2026-08-05';/, 'la versión no cambia todavía');
});

test('la migración registra el reconsentimiento sin abrir escrituras directas', async () => {
  const sql = await read('supabase/migrations/20261113150000_add_privacy_reconsent.sql');
  assert.match(sql, /check \(source = any \(array\['customer_signup', 'profile_update', 'login_reconsent'\]\)\)/);
  assert.match(sql, /'guest_not_allowed'/);
  assert.match(sql, /revoke all on function public\.accept_privacy_policy\(text\) from public, anon;/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('los E2E preparan el consentimiento sólo en la base local', async () => {
  const setup = await read('e2e/global-setup.js');
  assert.match(setup, /\['127\.0\.0\.1', 'localhost', '::1'\]\.includes\(hostname\)/);
  assert.match(setup, /u\.email like '%@spirit\.test'/);
  assert.match(await read('playwright.config.js'), /globalSetup: '\.\/e2e\/global-setup\.js'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEGAL_CONTENT, LEGAL_DRAFT, LEGAL_ROUTES, legalPageFromPath } from '../client/legal-content.js';
import {
  LEGAL_COPY,
  legalText,
  privacyInlineLink,
  renderLegalFooter,
  renderLegalScreen,
  renderLegalSheetContent
} from '../client/legal-view.js';
import { CLIENT_ICONS } from '../client/icons.js';
import { renderGuestEntry, renderGuestMenuBanner } from '../client/guest-view.js';
import { GUEST_COPY } from '../client/guest-copy.js';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const translator = (lang) => (key) => ({ ...GUEST_COPY[lang], ...LEGAL_COPY[lang], close: 'Cerrar' })[key] || key;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const flatten = (doc) => [doc.title, doc.intro, ...doc.sections.flatMap((section) => [section.title, ...(section.paragraphs || []), ...(section.items || [])])].join('\n');

test('borrador en castellano y catalán con la misma estructura', () => {
  assert.equal(LEGAL_DRAFT, true);
  for (const page of ['privacy', 'notice']) {
    const es = LEGAL_CONTENT.es[page];
    const ca = LEGAL_CONTENT.ca[page];
    assert.equal(ca.sections.length, es.sections.length, page);
    es.sections.forEach((section, index) => {
      assert.equal((ca.sections[index].items || []).length, (section.items || []).length, `${page} §${index + 1}`);
    });
  }
  assert.match(LEGAL_CONTENT.es.draftBanner, /^Borrador pendiente de revisión legal/);
  assert.match(LEGAL_CONTENT.ca.draftBanner, /^Esborrany pendent de revisió legal/);
});

test('los datos de la empresa son marcadores claros en las dos páginas', () => {
  for (const lang of ['es', 'ca']) {
    for (const page of ['privacy', 'notice']) {
      const text = flatten(LEGAL_CONTENT[lang][page]);
      for (const marker of ['[RAZÓN SOCIAL]', '[NIF]', '[DIRECCIÓN]', '[EMAIL DE CONTACTO]']) assert.ok(text.includes(marker), `${lang}/${page}: ${marker}`);
    }
  }
});

test('la política refleja el inventario: proveedores, plazos propuestos y derechos', () => {
  const text = flatten(LEGAL_CONTENT.es.privacy);
  for (const fragment of [
    'Supabase', 'Fráncfort', 'Vercel', '[REGIÓN Y PLAN DE VERCEL]', 'Resend', '[PROVEEDOR DE CORREO DE AUTENTICACIÓN]',
    'Pedidos: 12 meses', 'se borran en ese momento la nota y el nombre', '30 días sin actividad',
    'Intentos con el código del día y solicitudes de sello o canje caducadas: 30 días', 'correos de recompensa: 90 días',
    'Alertas de seguridad del equipo: 12 meses', '[PENDIENTE DE VALIDAR CON LA CAFETERÍA', 'aepd.es',
    'no usa cookies publicitarias'
  ]) assert.ok(text.includes(fragment), fragment);
  assert.doesNotMatch(text, /Turnstile|Google Fonts/);
});

test('los marcadores se escapan y se resaltan', () => {
  assert.equal(legalText('Titular: [RAZÓN SOCIAL] <b>', escapeHTML), 'Titular: <mark class="legal-placeholder">[RAZÓN SOCIAL]</mark> &lt;b&gt;');
});

test('rutas /privacidad y /aviso-legal', () => {
  assert.deepEqual({ ...LEGAL_ROUTES }, { privacy: '/privacidad', notice: '/aviso-legal' });
  assert.equal(legalPageFromPath('/privacidad'), 'privacy');
  assert.equal(legalPageFromPath('/privacidad/'), 'privacy');
  assert.equal(legalPageFromPath('/aviso-legal'), 'notice');
  assert.equal(legalPageFromPath('/'), null);
});

test('página completa: aviso de borrador, título, cambio de idioma y enlace a la otra', () => {
  const html = renderLegalScreen({ page: 'privacy', lang: 'es', translate: translator('es'), escapeHTML, icons: CLIENT_ICONS });
  assert.match(html, /<p class="legal-draft" role="note">Borrador pendiente de revisión legal/);
  assert.match(html, /<h1 tabindex="-1" data-screen-heading>Política de privacidad<\/h1>/);
  assert.match(html, /data-action="legal-lang" lang="ca">Llegir en català</);
  assert.match(html, /<a href="\/aviso-legal" data-legal-link="notice">Aviso legal<\/a>/);
  assert.match(html, /<mark class="legal-placeholder">\[NIF\]<\/mark>/);
  const ca = renderLegalScreen({ page: 'notice', lang: 'ca', translate: translator('ca'), escapeHTML, icons: CLIENT_ICONS });
  assert.match(ca, /<h1 tabindex="-1" data-screen-heading>Avís legal<\/h1>/);
  // En catalán, también los enlaces y botones de la página.
  assert.match(ca, /<a href="\/privacidad" data-legal-link="privacy">Política de privacitat<\/a>/);
  assert.match(ca, /aria-label="Tornar"/);
  assert.match(ca, /lang="es">Leer en castellano</);
  assert.match(renderLegalSheetContent({ page: 'privacy', lang: 'es', translate: translator('es'), escapeHTML }), /<h2 id="legal-sheet-title">Política de privacidad<\/h2>[\s\S]*<h3>1\. Responsable del tratamiento<\/h3>/);
});

test('enlaces: casilla de consentimiento, pedir sin cuenta, perfil y pie', async () => {
  const t = translator('es');
  assert.equal(privacyInlineLink(t), '<a href="/privacidad" data-legal-sheet="privacy">política de privacidad</a>');
  assert.match(renderLegalFooter({ translate: t }), /<a href="\/privacidad" data-legal-link="privacy">Política de privacidad<\/a>.*<a href="\/aviso-legal" data-legal-link="notice">Aviso legal<\/a>/);
  assert.match(renderGuestEntry({ translate: t, available: true }), /Al pedir sin cuenta tratamos tu nombre y tu pedido como explica la <a href="\/privacidad" data-legal-sheet="privacy">/);
  assert.match(renderGuestMenuBanner({ translate: t }), /data-legal-sheet="privacy"/);
  const app = await read('app.js');
  assert.match(app, /const privacyLabel = \(\) => t\('privacy'\)\.replace\(t\('legalPrivacyInline'\), privacyInlineLink\(t\)\);/);
  assert.match(app, /<span>\$\{privacyLabel\(\)\}<\/span><\/label>/);
  assert.match(app, /data-legal-link="privacy"><span>\$\{t\('legalPrivacyLink'\)\}<\/span>/);
  assert.match(app, /data-legal-link="notice"><span>\$\{t\('legalNoticeLink'\)\}<\/span>/);
  assert.equal((app.match(/\$\{legalFooter\(\)\}/g) || []).length, 3, 'pie en el login, el inicio y el perfil');
  // Las palabras enlazadas existen en el texto de la casilla de ambos idiomas.
  assert.match(app, /privacy: 'Acepto la política de privacidad/);
  assert.match(app, /privacy: 'Accepto la política de privacitat/);
});

test('la versión del consentimiento no cambia todavía', async () => {
  const app = await read('app.js');
  assert.match(app, /const PRIVACY_POLICY_VERSION = '2026-08-05';/);
});

test('Vercel sirve las dos rutas como la app', async () => {
  const vercel = JSON.parse(await read('vercel.json'));
  for (const source of ['/privacidad', '/privacidad/', '/aviso-legal', '/aviso-legal/']) {
    assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === '/index.html'), source);
  }
});

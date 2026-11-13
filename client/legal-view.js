// Vistas de /privacidad y /aviso-legal (render puro, tests/legal-pages.test.js).
import { LEGAL_CONTENT, LEGAL_DRAFT, LEGAL_ROUTES, LEGAL_UPDATED } from './legal-content.js';

export const LEGAL_COPY = Object.freeze({
  es: Object.freeze({
    legalPrivacyLink: 'Política de privacidad',
    legalNoticeLink: 'Aviso legal',
    legalBack: 'Volver',
    legalReadOther: 'Llegir en català',
    legalFooterLabel: 'Información legal',
    legalPrivacyInline: 'política de privacidad',
    guestPrivacyNote: 'Al pedir sin cuenta tratamos tu nombre y tu pedido como explica la'
  }),
  ca: Object.freeze({
    legalPrivacyLink: 'Política de privacitat',
    legalNoticeLink: 'Avís legal',
    legalBack: 'Tornar',
    legalReadOther: 'Leer en castellano',
    legalFooterLabel: 'Informació legal',
    legalPrivacyInline: 'política de privacitat',
    guestPrivacyNote: 'En demanar sense compte tractem el teu nom i la comanda com explica la'
  })
});

const contentFor = (lang) => LEGAL_CONTENT[lang] || LEGAL_CONTENT.es;

// Escapa y resalta los marcadores pendientes ([RAZÓN SOCIAL], [PENDIENTE…]).
export const legalText = (value, escapeHTML) => escapeHTML(value)
  .replace(/\[[^\]]+\]/g, (marker) => `<mark class="legal-placeholder">${marker}</mark>`);

export function renderLegalDocument({ page, lang = 'es', escapeHTML, level = 2 }) {
  const doc = contentFor(lang)[page];
  const heading = `h${level}`;
  return doc.sections.map((section) => `<section class="legal-section">
      <${heading}>${legalText(section.title, escapeHTML)}</${heading}>
      ${(section.paragraphs || []).map((paragraph) => `<p>${legalText(paragraph, escapeHTML)}</p>`).join('')}
      ${section.items ? `<ul>${section.items.map((item) => `<li>${legalText(item, escapeHTML)}</li>`).join('')}</ul>` : ''}
    </section>`).join('');
}

const draftBanner = (lang, escapeHTML) => (LEGAL_DRAFT
  ? `<p class="legal-draft" role="note">${escapeHTML(contentFor(lang).draftBanner)}</p>`
  : '');

export function renderLegalScreen({ page, lang = 'es', translate, escapeHTML, icons }) {
  // Los textos de la página siguen el idioma que se está leyendo, aunque la
  // app esté en el otro.
  const t = (key) => LEGAL_COPY[lang]?.[key] || translate(key);
  const content = contentFor(lang);
  const doc = content[page];
  const other = page === 'privacy' ? 'notice' : 'privacy';
  const otherLabel = other === 'privacy' ? t('legalPrivacyLink') : t('legalNoticeLink');
  return `<main class="app-shell"><section class="screen legal-screen" data-legal-page="${page}">
    <header class="order-header">
      <button class="menu-icon-button" type="button" data-action="legal-back" aria-label="${t('legalBack')}">${icons.arrowLeft}</button>
      <button class="text-btn legal-lang" type="button" data-action="legal-lang" lang="${lang === 'ca' ? 'es' : 'ca'}">${t('legalReadOther')}</button>
    </header>
    ${draftBanner(lang, escapeHTML)}
    <h1 tabindex="-1" data-screen-heading>${escapeHTML(doc.title)}</h1>
    <p class="legal-updated">${escapeHTML(content.updated.replace('{date}', LEGAL_UPDATED))}</p>
    <p class="legal-intro">${legalText(doc.intro, escapeHTML)}</p>
    ${renderLegalDocument({ page, lang, escapeHTML })}
    <p class="legal-other"><a href="${LEGAL_ROUTES[other]}" data-legal-link="${other}">${otherLabel}</a></p>
  </section></main>`;
}

// Diálogo (desde el consentimiento o «Pedir sin cuenta»): no se pierde lo escrito.
export function renderLegalSheetContent({ page, lang = 'es', translate: t, escapeHTML }) {
  const doc = contentFor(lang)[page];
  return `<div class="sheet-head"><div><h2 id="legal-sheet-title">${escapeHTML(doc.title)}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div>
    <div class="legal-sheet">
      ${draftBanner(lang, escapeHTML)}
      <p class="legal-intro">${legalText(doc.intro, escapeHTML)}</p>
      ${renderLegalDocument({ page, lang, escapeHTML, level: 3 })}
    </div>`;
}

// Enlace a la política dentro de un texto (consentimiento, invitado).
export const privacyInlineLink = (t) => `<a href="${LEGAL_ROUTES.privacy}" data-legal-sheet="privacy">${t('legalPrivacyInline')}</a>`;

export function renderLegalFooter({ translate: t }) {
  return `<footer class="legal-footer"><nav aria-label="${t('legalFooterLabel')}"><a href="${LEGAL_ROUTES.privacy}" data-legal-link="privacy">${t('legalPrivacyLink')}</a><span aria-hidden="true"> · </span><a href="${LEGAL_ROUTES.notice}" data-legal-link="notice">${t('legalNoticeLink')}</a></nav></footer>`;
}

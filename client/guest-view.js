// Vistas de «Pedir sin cuenta». Render puro (tests/guest-ordering.test.js).
import { GUEST_NAME_MAX } from '../services/guest-rules.js';
import { privacyInlineLink } from './legal-view.js';

// Aviso de privacidad junto a «Pedir sin cuenta» (abre la política en un diálogo).
const guestPrivacyNote = (t) => `<p class="guest-privacy">${t('guestPrivacyNote')} ${privacyInlineLink(t)}.</p>`;

// Error del modo invitado: dentro de su tarjeta, nunca en el formulario de login.
const guestErrorMessage = (error, escape) => (error
  ? `<p class="guest-error" role="alert" data-guest-error>${escape(error)}</p>`
  : '');

const plain = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

// Bloque del login/bienvenida: entrar como invitado o ver la carta. Sin
// «Pedir sin cuenta» mientras no conste que se puede (cargando, apagado o
// error): solo el texto alternativo y «Ver la carta».
export function renderGuestEntry({ translate: t, available = false, busy = false, error = '', escapeHTML = plain }) {
  return `<section class="guest-entry" aria-labelledby="guest-entry-title">
    <h2 id="guest-entry-title">${t('guestEntryTitle')}</h2>
    ${available
      ? `<p>${t('guestEntryCopy')}</p><button class="primary-button primary-button--light" type="button" data-action="guest-start" ${busy ? 'disabled' : ''}>${busy ? t('guestStarting') : t('guestStart')}</button>${guestPrivacyNote(t)}`
      : `<p>${t('guestEntryUnavailable')}</p>`}
    ${guestErrorMessage(error, escapeHTML)}
    <button class="auth-link auth-link--centered" type="button" data-action="guest-view-menu">${t('guestViewMenu')}</button>
  </section>`;
}

// Seguimiento del invitado: recordatorio en una línea, sin botón ni enlace.
// Sólo aquí; nada en la carta, el carrito ni la confirmación.
export const renderGuestTrackingReminder = ({ translate: t }) => `<p class="guest-reminder" data-guest-reminder>${t('guestTrackingReminder')}</p>`;

// Carta sin sesión: entrar como invitado sin salir de la carta. Si el alta
// falló, el aviso ocupa la franja (sin botón).
export function renderGuestMenuBanner({ translate: t, busy = false, error = '', escapeHTML = plain }) {
  if (error) return `<div class="guest-menu-banner guest-menu-banner--error">${guestErrorMessage(error, escapeHTML)}</div>`;
  return `<div class="guest-menu-banner"><p>${t('guestEntryCopy')}</p><button class="primary-button" type="button" data-action="guest-start" ${busy ? 'disabled' : ''}>${busy ? t('guestStarting') : t('guestStart')}</button>${guestPrivacyNote(t)}</div>`;
}

export function renderGuestNameField({ translate: t, escapeHTML, value = '' }) {
  return `<div class="field">
      <label for="checkout-guest-name">${t('guestName')}</label>
      <input id="checkout-guest-name" name="guestName" type="text" maxlength="${GUEST_NAME_MAX}" autocomplete="given-name" enterkeyhint="next" aria-describedby="checkout-guest-name-hint checkout-guest-name-error" aria-invalid="false" required value="${escapeHTML(value)}" data-checkout-guest-name>
      <small id="checkout-guest-name-hint" class="field-note">${t('guestNameHint')}</small>
      <small id="checkout-guest-name-error" class="field-error" data-checkout-guest-name-error></small>
    </div>`;
}

export function renderGuestExitContent({ translate: t }) {
  return `<div class="sheet-head"><div><h2 id="guest-exit-title">${t('guestExitTitle')}</h2></div></div>
    <p id="guest-exit-description" class="delete-account-warning">${t('guestExitCopy')}</p>
    <div class="delete-account-actions">
      <button class="primary-button primary-button--light" type="button" data-action="close-sheet" data-guest-exit-stay>${t('guestExitStay')}</button>
      <button class="primary-button primary-button--danger" type="button" data-action="guest-exit-confirm">${t('guestExitConfirm')}</button>
    </div>`;
}

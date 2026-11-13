// Vistas de «Pedir sin cuenta». Render puro (tests/guest-ordering.test.js).
import { GUEST_NAME_MAX } from '../services/guest-rules.js';

// Bloque del login/bienvenida: entrar como invitado o ver la carta.
export function renderGuestEntry({ translate: t, available = false, busy = false }) {
  return `<section class="guest-entry" aria-labelledby="guest-entry-title">
    <h2 id="guest-entry-title">${t('guestEntryTitle')}</h2>
    ${available ? `<p>${t('guestEntryCopy')}</p><button class="primary-button primary-button--light" type="button" data-action="guest-start" ${busy ? 'disabled' : ''}>${busy ? t('guestStarting') : t('guestStart')}</button>` : ''}
    <button class="auth-link auth-link--centered" type="button" data-action="guest-view-menu">${t('guestViewMenu')}</button>
  </section>`;
}

// Captación en la carta, el carrito y el seguimiento.
export function renderGuestPrompt({ translate: t, id = 'guest-prompt' }) {
  return `<aside class="guest-prompt" aria-labelledby="${id}-title">
    <p id="${id}-title" class="guest-prompt__title">${t('guestPromptTitle')}</p>
    <p class="guest-prompt__copy">${t('guestPromptCopy')}</p>
    <button class="primary-button guest-prompt__action" type="button" data-action="guest-create-account">${t('guestCreateAccount')}</button>
  </aside>`;
}

// Carta sin sesión: entrar como invitado sin salir de la carta.
export function renderGuestMenuBanner({ translate: t, busy = false }) {
  return `<div class="guest-menu-banner"><p>${t('guestEntryCopy')}</p><button class="primary-button" type="button" data-action="guest-start" ${busy ? 'disabled' : ''}>${busy ? t('guestStarting') : t('guestStart')}</button></div>`;
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
      <button class="primary-button primary-button--light" type="button" data-action="guest-create-account">${t('guestCreateAccount')}</button>
      <button class="primary-button primary-button--danger" type="button" data-action="guest-exit-confirm">${t('guestExitConfirm')}</button>
    </div>`;
}

const header = ({ t, icons, eyebrow, title }) => `<header class="order-header">
    <button class="menu-icon-button" type="button" data-action="guest-signup-back" aria-label="${t('guestSignupBack')}">${icons.arrowLeft}</button>
  </header>
  <p class="eyebrow">${eyebrow}</p>
  <h1 tabindex="-1" data-screen-heading>${title}</h1>`;

// Paso 1 de la conversión: nombre, correo y consentimiento.
export function renderGuestSignupScreen({ translate: t, escapeHTML, icons, sentTo = '', busy = false, error = '' }) {
  const head = header({ t, icons, eyebrow: t('guestSignupEyebrow'), title: sentTo ? t('guestSignupSentTitle') : t('guestSignupTitle') });
  if (sentTo) {
    return `<main class="app-shell"><section class="screen order-screen">${head}
      <div class="form recovery-state recovery-state--success" role="status"><span class="recovery-state__icon" aria-hidden="true">✓</span><p>${t('guestSignupSentCopy', { email: escapeHTML(sentTo) })}</p>
      <button class="primary-button" type="button" data-action="guest-signup-back">${t('guestSignupBack')}</button></div>
    </section></main>`;
  }
  return `<main class="app-shell"><section class="screen order-screen">${head}
    <p class="subtitle">${t('guestSignupCopy')}</p>
    <form class="form" data-form="guest-signup" novalidate>
      <div class="field"><label for="guest-first-name">${t('firstName')}</label><input id="guest-first-name" name="firstName" type="text" autocomplete="given-name" maxlength="28" required></div>
      <div class="field"><label for="guest-last-name">${t('lastName')}</label><input id="guest-last-name" name="lastName" type="text" autocomplete="family-name" maxlength="42"></div>
      <div class="field"><label for="guest-email">${t('email')}</label><input id="guest-email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
      <label class="check"><input type="checkbox" name="privacyConsent" value="accepted" required><span>${t('privacy')}</span></label>
      <p class="form-error" role="alert" data-guest-signup-error>${escapeHTML(error)}</p>
      <button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>${busy ? t('guestSignupSending') : t('guestSignupSubmit')}</button>
    </form>
  </section></main>`;
}

// Paso 2: tras confirmar el correo, la contraseña.
export function renderGuestPasswordScreen({ translate: t, escapeHTML, busy = false, error = '', minLength }) {
  return `<main class="app-shell"><section class="screen screen--gold screen--recovery">
    <p class="eyebrow">${t('guestPasswordEyebrow')}</p>
    <h1 tabindex="-1" data-screen-heading>${t('guestPasswordTitle')}</h1>
    <p class="subtitle">${t('guestPasswordCopy')}</p>
    <form class="form" data-form="guest-password" novalidate>
      <div class="field"><label for="guest-password">${t('newPassword')}</label><input id="guest-password" name="password" type="password" minlength="${minLength}" autocomplete="new-password" aria-describedby="guest-password-note" required><small id="guest-password-note" class="field-note">${t('passwordLength')}</small></div>
      <div class="field"><label for="guest-password-confirmation">${t('confirmPassword')}</label><input id="guest-password-confirmation" name="passwordConfirmation" type="password" minlength="${minLength}" autocomplete="new-password" required></div>
      <p class="form-error" role="alert" data-guest-password-error>${escapeHTML(error)}</p>
      <button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>${t('guestPasswordSubmit')}</button>
    </form>
  </section></main>`;
}

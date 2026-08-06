import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SIGNUP_VALIDATION_ERROR,
  signupCanSubmit,
  submitValidatedCustomerSignup,
  validateCustomerSignup
} from '../services/signup-validation.js';

const validSignup = (overrides = {}) => ({
  displayName: 'Soufian Bensahal',
  email: 'soufian@example.com',
  emailValid: true,
  password: 'SpiritCafe123!',
  passwordConfirmation: 'SpiritCafe123!',
  privacyAccepted: true,
  consent: { accepted: true, version: '2026-08-05' },
  ...overrides
});

test('la creación de cuenta renderiza dos contraseñas accesibles', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /<label for="password">\$\{t\('password'\)\}<\/label><input id="password" name="password" type="password"/);
  assert.match(app, /<label for="signup-password-confirmation">\$\{t\('confirmSignupPassword'\)\}<\/label>/);
  assert.match(app, /id="signup-password-confirmation" name="passwordConfirmation" type="password"/);
  assert.match(app, /placeholder="\$\{t\('confirmSignupPasswordPlaceholder'\)\}"/);
  assert.match(app, /aria-describedby="signup-password-confirmation-error"/);
  assert.match(app, /data-signup-password-error role="alert" aria-live="polite"/);
});

test('una confirmación vacía o distinta bloquea el registro', () => {
  const empty = validateCustomerSignup(validSignup({ passwordConfirmation: '' }));
  assert.equal(empty.valid, false);
  assert.equal(empty.confirmationError, SIGNUP_VALIDATION_ERROR.CONFIRMATION_REQUIRED);
  assert.equal(signupCanSubmit(validSignup({ passwordConfirmation: '' })), false);

  const mismatch = validateCustomerSignup(validSignup({ passwordConfirmation: 'SpiritCafe124!' }));
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.confirmationError, SIGNUP_VALIDATION_ERROR.PASSWORD_MISMATCH);
  assert.equal(signupCanSubmit(validSignup({ passwordConfirmation: 'SpiritCafe124!' })), false);
});

test('el error desaparece al corregir la confirmación', () => {
  assert.equal(
    validateCustomerSignup(validSignup({ passwordConfirmation: 'SpiritCafe124!' })).confirmationError,
    SIGNUP_VALIDATION_ERROR.PASSWORD_MISMATCH
  );
  assert.equal(validateCustomerSignup(validSignup()).confirmationError, '');
  assert.equal(signupCanSubmit(validSignup()), true);
  assert.equal(signupCanSubmit(validSignup(), true), false);
});

test('una contraseña débil mantiene la política aunque la confirmación coincida', () => {
  const validation = validateCustomerSignup(validSignup({
    password: 'demasiado-debil',
    passwordConfirmation: 'demasiado-debil'
  }));
  assert.equal(validation.valid, false);
  assert.equal(validation.error, SIGNUP_VALIDATION_ERROR.WEAK_PASSWORD);
});

test('signUp no se invoca si las contraseñas discrepan', async () => {
  let calls = 0;
  const submission = await submitValidatedCustomerSignup(
    validSignup({ passwordConfirmation: 'SpiritCafe124!' }),
    async () => { calls += 1; }
  );
  assert.equal(submission.ok, false);
  assert.equal(calls, 0);
});

test('signUp recibe solo la contraseña principal y nunca la confirmación', async () => {
  let payload;
  const submission = await submitValidatedCustomerSignup(validSignup(), async (values) => {
    payload = values;
    return { confirmationRequired: true };
  });

  assert.equal(submission.ok, true);
  assert.equal(payload.password, 'SpiritCafe123!');
  assert.equal('passwordConfirmation' in payload, false);
  assert.equal('confirmation' in payload, false);
  assert.deepEqual(payload.consent, { accepted: true, version: '2026-08-05' });
  assert.equal('passwordConfirmation' in (payload.consent || {}), false);
});

test('la interfaz nunca interpola directamente objetos de error', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /escapeHTML\(state\.authError\)/);
  assert.doesNotMatch(app, /\$\{state\.authError\}/);
  assert.match(app, /readableAuthError\(error\)/);
});

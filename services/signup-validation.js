import { passwordMeetsPolicy } from './password-policy.js';

export const SIGNUP_VALIDATION_ERROR = Object.freeze({
  REQUIRED_FIELDS: 'required_fields',
  INVALID_EMAIL: 'invalid_email',
  WEAK_PASSWORD: 'weak_password',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  PASSWORD_MISMATCH: 'password_mismatch',
  PRIVACY_REQUIRED: 'privacy_required'
});

const text = (value) => String(value ?? '');

export const validateCustomerSignup = ({
  firstName,
  lastName,
  email,
  emailValid = true,
  password,
  passwordConfirmation,
  privacyAccepted
}) => {
  const requiredFieldsPresent = Boolean(
    text(firstName).trim()
    && text(lastName).trim()
    && text(email).trim()
  );
  const passwordValid = passwordMeetsPolicy(password);
  const confirmation = text(passwordConfirmation);
  const confirmationError = !confirmation
    ? SIGNUP_VALIDATION_ERROR.CONFIRMATION_REQUIRED
    : text(password) !== confirmation
      ? SIGNUP_VALIDATION_ERROR.PASSWORD_MISMATCH
      : '';

  let error = '';
  if (!requiredFieldsPresent) error = SIGNUP_VALIDATION_ERROR.REQUIRED_FIELDS;
  else if (!emailValid) error = SIGNUP_VALIDATION_ERROR.INVALID_EMAIL;
  else if (!passwordValid) error = SIGNUP_VALIDATION_ERROR.WEAK_PASSWORD;
  else if (confirmationError) error = confirmationError;
  else if (!privacyAccepted) error = SIGNUP_VALIDATION_ERROR.PRIVACY_REQUIRED;

  return Object.freeze({
    valid: !error,
    error,
    confirmationError,
    passwordValid,
    passwordsMatch: !confirmationError,
    requiredFieldsPresent,
    privacyAccepted: privacyAccepted === true
  });
};

export const signupCanSubmit = (values, loading = false) => (
  !loading && validateCustomerSignup(values).valid
);

export const submitValidatedCustomerSignup = async (values, signUp) => {
  const validation = validateCustomerSignup(values);
  if (!validation.valid) return { ok: false, validation };

  const result = await signUp({
    email: values.email,
    password: values.password,
    firstName: text(values.firstName).trim().replace(/\s+/g, ' '),
    lastName: text(values.lastName).trim().replace(/\s+/g, ' '),
    displayName: `${text(values.firstName).trim()} ${text(values.lastName).trim()}`
      .replace(/\s+/g, ' '),
    consent: values.consent
  });

  return { ok: true, validation, result };
};

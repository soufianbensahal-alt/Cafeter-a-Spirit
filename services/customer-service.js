import { requireSupabase } from './supabase-client.js';
import {
  getCurrentUser,
  completePasswordRecovery,
  reauthenticateAndUpdatePassword,
  sendPasswordReset,
  signInWithEmail,
  signOut,
  signOutCurrentSession,
  signUpWithEmail,
  subscribeToAuthChanges,
  verifyEmailConfirmation
} from './auth-service.js';
import { getUserContexts } from './user-context-service.js';
import {
  getEmailConfirmationUrl,
  getPasswordResetUrl
} from './site-origin.js';

const splitName = (displayName = '') => {
  const parts = String(displayName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || 'Cliente',
    lastName: parts.join(' ')
  };
};

export async function getCustomerContext(authenticatedUser) {
  const contexts = await getUserContexts(authenticatedUser);
  if (!contexts) return null;
  const displayName = contexts.displayName;
  return Object.freeze({
    userId: contexts.userId,
    email: contexts.email,
    displayName,
    isCustomer: contexts.isCustomer,
    hasBusinessAccess: contexts.hasBusinessAccess,
    needsProfileCompletion: contexts.needsProfileCompletion,
    ...splitName(displayName)
  });
}

export async function signInCustomer(email, password, captchaToken) {
  const { user } = await signInWithEmail(email, password, captchaToken);
  return getCustomerContext(user);
}

export async function signUpCustomer({ email, password, displayName, captchaToken, consent }) {
  const data = await signUpWithEmail({
    email,
    password,
    displayName,
    redirectTo: getEmailConfirmationUrl(),
    captchaToken,
    consent
  });
  return {
    confirmationRequired: !data.session,
    context: data.session ? await getCustomerContext(data.user) : null
  };
}

export async function updateCustomerProfile(displayName) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No existe una sesión activa.');
  const cleanName = String(displayName || '').trim().slice(0, 80);
  const { error } = await requireSupabase()
    .from('profiles')
    .update({ display_name: cleanName })
    .eq('id', user.id);
  if (error) throw error;
  return getCustomerContext(user);
}

export const requestCustomerPasswordReset = (email, captchaToken) => sendPasswordReset(
  email,
  getPasswordResetUrl(),
  captchaToken
);

export const updateCustomerPassword = (email, currentPassword, nextPassword, captchaToken) => (
  reauthenticateAndUpdatePassword(email, currentPassword, nextPassword, captchaToken)
);

export const completeCustomerPasswordRecovery = (tokenHash, nextPassword) => (
  completePasswordRecovery(tokenHash, nextPassword)
);

export const confirmCustomerEmail = (tokenHash) => verifyEmailConfirmation(tokenHash);

export {
  getCurrentUser,
  signOut,
  signOutCurrentSession,
  subscribeToAuthChanges
};

import { requireSupabase } from './supabase-client.js';
import {
  getCurrentUser,
  completePasswordRecovery,
  reauthenticateAndUpdatePassword,
  resendSignUpConfirmation,
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

export async function signInCustomer(email, password) {
  const { user } = await signInWithEmail(email, password);
  return getCustomerContext(user);
}

export async function customerSignUpResult(data, loadContext = getCustomerContext) {
  return {
    confirmationRequired: !data.session,
    context: data.session ? await loadContext(data.user) : null
  };
}

export async function signUpCustomer({ email, password, displayName, consent }) {
  const data = await signUpWithEmail({
    email,
    password,
    displayName,
    redirectTo: getEmailConfirmationUrl(),
    consent
  });
  return customerSignUpResult(data);
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

export const requestCustomerPasswordReset = (email) => sendPasswordReset(
  email,
  getPasswordResetUrl()
);

export const updateCustomerPassword = (email, currentPassword, nextPassword) => (
  reauthenticateAndUpdatePassword(email, currentPassword, nextPassword)
);

export const completeCustomerPasswordRecovery = (tokenHash, nextPassword) => (
  completePasswordRecovery(tokenHash, nextPassword)
);

export const confirmCustomerEmail = (tokenHash) => verifyEmailConfirmation(tokenHash);

export const resendCustomerEmailConfirmation = (email) => resendSignUpConfirmation(
  email,
  getEmailConfirmationUrl()
);

export {
  getCurrentUser,
  signOut,
  signOutCurrentSession,
  subscribeToAuthChanges
};

import { requireSupabase } from './supabase-client.js';
import {
  getCurrentUser,
  reauthenticateAndUpdatePassword,
  sendPasswordReset,
  signInWithEmail,
  signInWithOAuth,
  signOut,
  signUpWithEmail,
  subscribeToAuthChanges,
  updatePassword
} from './auth-service.js';
import { getUserContexts } from './user-context-service.js';

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

export async function signUpCustomer({ email, password, displayName }) {
  const data = await signUpWithEmail({
    email,
    password,
    displayName,
    redirectTo: new URL('/', window.location.origin).href
  });
  return {
    confirmationRequired: !data.session,
    context: data.session ? await getCustomerContext(data.user) : null
  };
}

export const signInCustomerWithOAuth = (provider) => signInWithOAuth(
  provider,
  new URL('/auth/callback', window.location.origin).href
);

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
  new URL('/reset-password', window.location.origin).href
);

export const updateCustomerPassword = (email, currentPassword, nextPassword) => (
  reauthenticateAndUpdatePassword(email, currentPassword, nextPassword)
);

export const completeCustomerPasswordRecovery = (nextPassword) => updatePassword(nextPassword);

export { getCurrentUser, signOut, subscribeToAuthChanges };

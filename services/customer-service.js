import { requireSupabase } from './supabase-client.js';
import {
  getCurrentUser,
  reauthenticateAndUpdatePassword,
  sendPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeToAuthChanges,
  updatePassword
} from './auth-service.js';

const splitName = (displayName = '') => {
  const parts = String(displayName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || 'Cliente',
    lastName: parts.join(' ')
  };
};

export async function getCustomerContext(authenticatedUser) {
  const user = authenticatedUser || await getCurrentUser();
  if (!user) return null;

  const { data: profile, error } = await requireSupabase()
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  const displayName = profile?.display_name || user.email?.split('@')[0] || 'Cliente Spirit';
  return Object.freeze({
    userId: user.id,
    email: user.email || '',
    displayName,
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

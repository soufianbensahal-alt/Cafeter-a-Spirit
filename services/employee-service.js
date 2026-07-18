import { requireSupabase } from './supabase-client.js';
import {
  AuthServiceError,
  getCurrentUser,
  signInWithEmail,
  signOut,
  subscribeToAuthChanges
} from './auth-service.js';
import { getUserContexts } from './user-context-service.js';

const EMPLOYEE_ROLES = new Set(['owner', 'manager', 'employee']);

export class EmployeeAuthorizationError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'EmployeeAuthorizationError';
    this.code = code;
  }
}

const employeeError = (error) => {
  if (error instanceof EmployeeAuthorizationError || error instanceof AuthServiceError) return error;
  if (error?.name === 'TypeError' || /fetch|network/i.test(error?.message || '')) {
    return new EmployeeAuthorizationError('network_error', 'No se ha podido comprobar el acceso. Revisa tu conexión.', error);
  }
  return new EmployeeAuthorizationError('authorization_error', 'No se ha podido comprobar tu acceso al negocio.', error);
};

export async function getEmployeeContext(authenticatedUser) {
  try {
    const user = authenticatedUser || await getCurrentUser();
    if (!user) throw new EmployeeAuthorizationError('not_authenticated', 'Inicia sesión para acceder al modo cafetería.');

    const contexts = await getUserContexts(user);
    const memberships = contexts.allBusinessMemberships;
    if (!memberships?.length) {
      throw new EmployeeAuthorizationError('no_membership', 'Tu cuenta no tiene acceso al modo cafetería.');
    }

    const roleMemberships = memberships.filter((membership) => membership.active && EMPLOYEE_ROLES.has(membership.role));
    if (!roleMemberships.length) {
      throw new EmployeeAuthorizationError('inactive_membership', 'Tu acceso de empleado está inactivo.');
    }

    const selectedMembership = roleMemberships.find((membership) => {
      const membershipBusiness = Array.isArray(membership.business) ? membership.business[0] : membership.business;
      return membershipBusiness?.active;
    });
    if (!selectedMembership) {
      throw new EmployeeAuthorizationError('inactive_business', 'Este negocio no está activo. Contacta con la persona responsable.');
    }
    const business = Array.isArray(selectedMembership.business)
      ? selectedMembership.business[0]
      : selectedMembership.business;

    return Object.freeze({
      userId: user.id,
      email: user.email || '',
      employeeName: contexts.displayName || user.email || 'Equipo Spirit',
      membershipId: selectedMembership.id,
      role: selectedMembership.role,
      businessId: business.id,
      businessName: business.name,
      isCustomer: contexts.isCustomer
    });
  } catch (error) {
    throw employeeError(error);
  }
}

export async function signInEmployee(email, password) {
  const { user } = await signInWithEmail(email, password);
  return getEmployeeContext(user);
}

export async function restoreEmployeeSession() {
  const user = await getCurrentUser();
  if (!user) return null;
  return getEmployeeContext(user);
}

export { signOut, subscribeToAuthChanges };

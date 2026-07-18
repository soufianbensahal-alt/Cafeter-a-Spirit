import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveUserContexts } from '../services/user-context-rules.js';

const user = { id: 'user-1', email: 'sofia@example.com', user_metadata: {} };
const business = { id: 'business-1', name: 'Spirit', active: true };

test('una cuenta de empleado no se convierte implícitamente en cliente', () => {
  const contexts = deriveUserContexts({
    user,
    profile: { display_name: 'Sofia Spirit' },
    customerCards: [],
    businessMemberships: [{ id: 'member-1', role: 'employee', active: true, business }]
  });
  assert.equal(contexts.isCustomer, false);
  assert.equal(contexts.hasBusinessAccess, true);
});

test('una misma identidad puede tener ambos contextos de forma explícita', () => {
  const contexts = deriveUserContexts({
    user,
    profile: { display_name: 'Sofia Spirit' },
    customerCards: [{ id: 'card-1' }],
    businessMemberships: [{ id: 'member-1', role: 'owner', active: true, business }]
  });
  assert.equal(contexts.isCustomer, true);
  assert.equal(contexts.hasBusinessAccess, true);
  assert.deepEqual(contexts.routes, { customer: '/', business: '/cafeteria' });
});

test('membresías inactivas o de negocios inactivos no autorizan el panel', () => {
  const contexts = deriveUserContexts({
    user,
    profile: null,
    customerCards: [{ id: 'card-1' }],
    businessMemberships: [{ id: 'member-1', role: 'employee', active: true, business: { ...business, active: false } }]
  });
  assert.equal(contexts.isCustomer, true);
  assert.equal(contexts.hasBusinessAccess, false);
  assert.equal(contexts.needsProfileCompletion, true);
});

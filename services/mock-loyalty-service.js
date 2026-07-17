const TRANSACTIONS_KEY = 'spirit-business-transactions';
const delay = (milliseconds = 420) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const memoryStorage = new Map();
const storage = typeof localStorage === 'undefined' ? {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: (key) => memoryStorage.delete(key)
} : localStorage;

let employeeContext = null;
const stampSessions = new Map();

export class MockLoyaltyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MockLoyaltyError';
    this.code = code;
  }
}

const requireEmployeeSession = () => {
  if (!employeeContext) {
    throw new MockLoyaltyError('session_expired', 'La sesión de empleado ha caducado. Inicia sesión de nuevo.');
  }
  return employeeContext;
};

const readTransactions = () => {
  try {
    const parsed = JSON.parse(storage.getItem(TRANSACTIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
};

export function mockBeginLoyaltySimulation(context) {
  employeeContext = context ? { ...context } : null;
}

export function mockPrepareConfirmation(validatedSession) {
  requireEmployeeSession();
  if (!validatedSession?.id) throw new MockLoyaltyError('unexpected', 'No se ha encontrado la operación validada.');
  const session = { ...validatedSession, status: 'pending' };
  stampSessions.set(session.id, session);
  return { ...session };
}

export async function mockConfirmStamp(publicSession) {
  requireEmployeeSession();
  const session = stampSessions.get(publicSession?.id);
  if (!session) throw new MockLoyaltyError('unexpected', 'No se ha encontrado la operación. Valida de nuevo el código.');
  if (session.status !== 'pending') throw new MockLoyaltyError('double_submit', 'Este sello ya se está procesando o ha sido confirmado.');
  session.status = 'confirming';
  await delay(650);
  session.status = 'confirmed';
  const transaction = {
    id: session.id,
    timestamp: new Date().toISOString(),
    customerMasked: session.customerMasked,
    result: 'Sello añadido',
    progress: `${session.nextProgress} de ${session.goal}`
  };
  const transactions = [transaction, ...readTransactions().filter((item) => item.id !== transaction.id)].slice(0, 5);
  storage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  return { transaction, progress: session.nextProgress, goal: session.goal };
}

export async function mockGetRecentTransactions() {
  requireEmployeeSession();
  await delay(120);
  return readTransactions();
}

export function mockEndLoyaltySimulation() {
  employeeContext = null;
  stampSessions.clear();
}

export function mockResetForTests() {
  employeeContext = null;
  stampSessions.clear();
  storage.removeItem(TRANSACTIONS_KEY);
}

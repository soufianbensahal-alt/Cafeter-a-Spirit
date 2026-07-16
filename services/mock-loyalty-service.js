const TRANSACTIONS_KEY = 'spirit-business-transactions';
const EMPLOYEE_SESSION_TTL = 8 * 60 * 60 * 1000;
const delay = (milliseconds = 420) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const memoryStorage = new Map();
const storage = typeof localStorage === 'undefined' ? {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: (key) => memoryStorage.delete(key)
} : localStorage;

let employeeSession = null;
const stampSessions = new Map();

export class MockLoyaltyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MockLoyaltyError';
    this.code = code;
  }
}

const createEmployeeSession = () => ({
  id: `employee-${Date.now()}`,
  employeeName: 'Marta · Equipo Spirit',
  businessName: 'Cafetería Spirit',
  status: 'active',
  expiresAt: Date.now() + EMPLOYEE_SESSION_TTL
});

const requireEmployeeSession = () => {
  if (!employeeSession || employeeSession.status !== 'active' || employeeSession.expiresAt <= Date.now()) {
    employeeSession = null;
    throw new MockLoyaltyError('session_expired', 'La sesión simulada ha caducado. Iníciala de nuevo.');
  }
  return employeeSession;
};

const createStampSession = (source) => {
  const session = {
    id: `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    customer: 'Cliente Spirit',
    customerMasked: 'Cliente S•••••',
    program: 'Tarjeta Café Spirit',
    currentProgress: 4,
    nextProgress: 5,
    goal: 10,
    reward: 'Café gratuito al completar 10 sellos',
    status: 'pending'
  };
  stampSessions.set(session.id, session);
  return { ...session };
};

const readTransactions = () => {
  try {
    const parsed = JSON.parse(storage.getItem(TRANSACTIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
};

export async function mockLoginEmployee() {
  await delay(260);
  employeeSession = createEmployeeSession();
  return { ...employeeSession };
}

export async function mockValidateCode(rawCode) {
  requireEmployeeSession();
  await delay();
  const code = String(rawCode ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw new MockLoyaltyError('incomplete_code', 'Introduce un código de 6 dígitos.');
  if (code === '111111') throw new MockLoyaltyError('expired_code', 'Este código ha caducado. Pide al cliente que genere uno nuevo.');
  if (code === '222222') throw new MockLoyaltyError('used_code', 'Este código ya se ha utilizado.');
  if (code === '333333') throw new MockLoyaltyError('wrong_business', 'Este código no pertenece a Cafetería Spirit.');
  if (code !== '123456') throw new MockLoyaltyError('incorrect_code', 'El código no es correcto. Revísalo e inténtalo de nuevo.');
  return createStampSession('manual');
}

export async function mockValidateQr(rawContent) {
  requireEmployeeSession();
  await delay(300);
  const content = String(rawContent ?? '').trim();
  if (!/^SPIRIT:STAMP:[A-Z0-9_-]+$/i.test(content)) {
    throw new MockLoyaltyError('invalid_qr', 'QR no válido. Utiliza un QR de fidelización de Spirit.');
  }
  return createStampSession('qr');
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

export async function mockLogoutEmployee() {
  await delay(180);
  if (employeeSession) employeeSession.status = 'logged_out';
  employeeSession = null;
  stampSessions.clear();
  return true;
}

export function mockResetForTests() {
  employeeSession = null;
  stampSessions.clear();
  storage.removeItem(TRANSACTIONS_KEY);
}

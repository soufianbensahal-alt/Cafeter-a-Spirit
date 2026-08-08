import pg from 'pg';

const connectionString = process.env.SPIRIT_DISPOSABLE_DB_URL;
if (!connectionString) {
  console.error('Falta SPIRIT_DISPOSABLE_DB_URL. La prueba solo se ejecuta contra una base desechable.');
  process.exit(2);
}

const target = new URL(connectionString);
const productionRef = 'iabuhjhyvsqhtiqowarq';
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
if (!isLocal && target.hostname.includes(productionRef)) {
  throw new Error('Prueba bloqueada: nunca se permite usar la base de producción.');
}
if (!isLocal && process.env.SPIRIT_CONFIRM_DISPOSABLE_DB !== 'yes') {
  throw new Error('Confirma una rama desechable con SPIRIT_CONFIRM_DISPOSABLE_DB=yes.');
}

const ids = Object.freeze({
  customer: 'a1000000-0000-4000-8000-000000000001',
  employee1: 'a2000000-0000-4000-8000-000000000001',
  employee2: 'a2000000-0000-4000-8000-000000000002',
  business: 'a3000000-0000-4000-8000-000000000001',
  program: 'a4000000-0000-4000-8000-000000000001',
  card: 'a5000000-0000-4000-8000-000000000001',
  stampSession: 'a6000000-0000-4000-8000-000000000001',
  authSession1: 'a7000000-0000-4000-8000-000000000001',
  authSession2: 'a7000000-0000-4000-8000-000000000002'
});

const pool = new pg.Pool({ connectionString, max: 3 });
const authClaims = (userId, sessionId) => JSON.stringify({ sub: userId, aal: 'aal2', session_id: sessionId });

async function setup() {
  await pool.query('begin');
  try {
    await pool.query(`insert into auth.users (id, email) values
      ($1, 'phase2-concurrency-customer@spirit.test'),
      ($2, 'phase2-concurrency-employee1@spirit.test'),
      ($3, 'phase2-concurrency-employee2@spirit.test')`, [ids.customer, ids.employee1, ids.employee2]);
    await pool.query(`insert into public.businesses (id, name, active) values ($1, 'Spirit Concurrency Test', true)`, [ids.business]);
    await pool.query(`insert into public.loyalty_programs (id, business_id, name, description, stamps_required, reward_description, active)
      values ($1, $2, 'Concurrency', 'Disposable test', 10, 'Café gratuito', true)`, [ids.program, ids.business]);
    await pool.query(`insert into public.business_members (business_id, user_id, role, active) values
      ($1, $2, 'employee', true), ($1, $3, 'employee', true)`, [ids.business, ids.employee1, ids.employee2]);
    await pool.query(`insert into public.customer_cards (id, customer_id, loyalty_program_id, current_stamps, available_rewards)
      values ($1, $2, $3, 9, 0)`, [ids.card, ids.customer, ids.program]);
    await pool.query(`insert into public.stamp_sessions (id, customer_card_id, business_id, session_type, token_hash, short_code, expires_at)
      values ($1, $2, $3, 'stamp', repeat('a', 64), '991001', clock_timestamp() + interval '90 seconds')`, [ids.stampSession, ids.card, ids.business]);
    await pool.query(`insert into private.privileged_business_sessions (session_id, business_id, user_id, expires_at) values
      ($1, $2, $3, clock_timestamp() + interval '8 hours'),
      ($4, $2, $5, clock_timestamp() + interval '8 hours')`, [ids.authSession1, ids.business, ids.employee1, ids.authSession2, ids.employee2]);
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function confirmAs(employeeId, sessionId) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [authClaims(employeeId, sessionId)]);
    const result = await client.query('select status, current_stamps, available_rewards from public.confirm_stamp_session($1)', [ids.stampSession]);
    await client.query('commit');
    return result.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup() {
  await pool.query('delete from auth.users where id = any($1::uuid[])', [[ids.customer, ids.employee1, ids.employee2]]);
  await pool.query('delete from public.businesses where id = $1', [ids.business]);
}

try {
  await setup();
  const results = await Promise.all([
    confirmAs(ids.employee1, ids.authSession1),
    confirmAs(ids.employee2, ids.authSession2)
  ]);
  const statuses = results.map(({ status }) => status).sort();
  if (statuses.join(',') !== 'already_processed,confirmed') {
    throw new Error(`Resultado concurrente inesperado: ${JSON.stringify(results)}`);
  }
  const { rows: [state] } = await pool.query(`
    select card.current_stamps, card.available_rewards,
      count(tx.id)::integer as transactions
    from public.customer_cards card
    left join public.stamp_transactions tx on tx.customer_card_id = card.id
    where card.id = $1
    group by card.id
  `, [ids.card]);
  if (state.current_stamps !== 0 || state.available_rewards !== 1 || state.transactions !== 1) {
    throw new Error(`La operación no fue atómica: ${JSON.stringify(state)}`);
  }
  console.log('OK: dos empleados concurrentes producen un solo sello, una recompensa y una transacción.');
} finally {
  try { await cleanup(); } finally { await pool.end(); }
}

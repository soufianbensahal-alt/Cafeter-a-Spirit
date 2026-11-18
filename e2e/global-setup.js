import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Antes de los E2E: las cuentas de prueba locales (@spirit.test) aceptan la
// versión actual de la política, para que el reconsentimiento no se cruce en
// las pruebas que inician sesión. El propio E2E de reconsentimiento borra a
// propósito la aceptación de su cliente. Al terminar, se borran los pedidos
// creados durante la ejecución. Sólo contra la base local.
const DB_URL = process.env.SPIRIT_E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default async function globalSetup() {
  if (process.env.SPIRIT_E2E !== '1') return;
  const { hostname } = new URL(DB_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) || DB_URL.includes('supabase.co')) {
    throw new Error('La preparación de los E2E solo puede tocar una base local desechable.');
  }
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const version = app.match(/const PRIVACY_POLICY_VERSION = '(\d{4}-\d{2}-\d{2})';/)?.[1];
  if (!version) throw new Error('No se encuentra PRIVACY_POLICY_VERSION en app.js.');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  let existingOrders;
  try {
    await db.query(`insert into public.privacy_consents (user_id, policy_version, source)
      select u.id, $1, 'customer_signup' from auth.users u
      where not coalesce(u.is_anonymous, false) and u.email like '%@spirit.test'
      on conflict (user_id, policy_version) do nothing`, [version]);
    // Pedidos que ya existían: al terminar se borran sólo los creados en esta
    // ejecución (por id, no por fecha: algunos E2E insertan pedidos de días
    // pasados).
    ({ rows: [{ ids: existingOrders }] } = await db.query("select coalesce(array_agg(id), '{}') as ids from public.orders"));
  } finally {
    await db.end();
  }

  // Al terminar: cada ejecución limpia sus pedidos (sólo base local y sólo de
  // cuentas de prueba, invitados anónimos o sin cliente), para que la batería
  // no dependa de cuántas veces se ha ejecutado en el día.
  return async function cleanupE2EOrders() {
    const cleanup = new pg.Client({ connectionString: DB_URL });
    await cleanup.connect();
    try {
      const { rowCount } = await cleanup.query(`delete from public.orders as o
        where not (o.id = any($1::uuid[]))
          and (o.customer_id is null or exists (
            select 1 from auth.users as u
            where u.id = o.customer_id and (coalesce(u.is_anonymous, false) or u.email like '%@spirit.test')
          ))`, [existingOrders]);
      if (rowCount) console.log(`E2E: ${rowCount} pedidos de prueba borrados de la base local.`);
    } finally {
      await cleanup.end();
    }
  };
}

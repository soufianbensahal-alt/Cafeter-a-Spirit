begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.set_test_auth(p_user_id uuid, p_aal text default 'aal2')
returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'aal', p_aal,
    'session_id', gen_random_uuid()
  )::text, true)
$$;

-- Prefijo c0…/c1…/c2…/c3… exclusivo de este fichero.
-- C cliente, E empleado, M manager, W owner, O empleado de otro negocio.
insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'history-customer@spirit.test'),
  ('c2000000-0000-4000-8000-000000000001', 'history-employee@spirit.test'),
  ('c2000000-0000-4000-8000-000000000002', 'history-manager@spirit.test'),
  ('c2000000-0000-4000-8000-000000000003', 'history-owner@spirit.test'),
  ('c2000000-0000-4000-8000-000000000004', 'history-outsider@spirit.test');

update public.profiles set display_name = 'Marta Puig Soler'
where id = 'c1000000-0000-4000-8000-000000000001';

insert into public.businesses (id, name, active) values
  ('c0000000-0000-4000-8000-000000000001', 'History Test', true),
  ('c0000000-0000-4000-8000-000000000002', 'History Other Test', true);

insert into public.business_members (business_id, user_id, role, active) values
  ('c0000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'employee', true),
  ('c0000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'manager', true),
  ('c0000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'owner', true),
  ('c0000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000004', 'employee', true);

insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents) values
  ('c0000000-0000-4000-8000-000000000001', 'history-cafe', 'test', 'Café historial', 'Cafè historial', 250);

-- Días relativos a hoy en Madrid: hace 1, 30 (límite del employee), 31 y 90.
create temporary table history_days on commit drop as
select (now() at time zone 'Europe/Madrid')::date as today;
grant select on history_days to authenticated;

insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, status, total_cents, rejection_reason, created_at)
select v.id::uuid, 'c0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', v.num,
       (select today from history_days) - v.days_ago, v.place, v.status, v.total, v.reason,
       ((select today from history_days) - v.days_ago)::timestamp at time zone 'Europe/Madrid' + v.at
from (values
  -- Ayer: servido, rechazado, cancelado y uno que se quedó en preparación.
  ('c3000000-0000-4000-8000-000000000001', 1, 3, 'Barra',  'served',    250, null::text,        interval '11 hours'),
  ('c3000000-0000-4000-8000-000000000002', 1, 1, 'Mesa 4', 'served',    500, null,              interval '9 hours'),
  ('c3000000-0000-4000-8000-000000000003', 1, 2, 'Mesa 2', 'rejected',  250, 'Cocina cerrada',  interval '10 hours'),
  ('c3000000-0000-4000-8000-000000000004', 1, 4, 'Barra',  'cancelled', 250, null,              interval '12 hours'),
  ('c3000000-0000-4000-8000-000000000005', 1, 5, 'Mesa 1', 'preparing', 250, null,              interval '13 hours'),
  ('c3000000-0000-4000-8000-000000000006', 30, 1, 'Barra', 'served',    250, null,              interval '9 hours'),
  ('c3000000-0000-4000-8000-000000000007', 31, 1, 'Barra', 'served',    250, null,              interval '9 hours'),
  ('c3000000-0000-4000-8000-000000000008', 90, 1, 'Barra', 'served',    250, null,              interval '9 hours')
) as v(id, days_ago, num, place, status, total, reason, at);

insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents)
select id, business_id, 'history-cafe', 1, total_cents / 250, 250, 'Café historial', total_cents
from public.orders where business_id = 'c0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Permisos de la función.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.list_business_orders_by_date(uuid, date)', 'execute'), 'anon no puede consultar el historial');
select ok(has_function_privilege('authenticated', 'public.list_business_orders_by_date(uuid, date)', 'execute'), 'authenticated puede invocar list_business_orders_by_date');
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.list_business_orders_by_date(uuid, date)'::regprocedure),
  'list_business_orders_by_date es SECURITY DEFINER con search_path vacío'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Employee con AAL2: hoy y los 30 días anteriores.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000001');

select results_eq(
  $$select order_number from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1)$$,
  array[1, 2, 3, 4, 5],
  'el employee ve ayer: todos los estados, ordenados por hora'
);
select results_eq(
  $$select status from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1)$$,
  array['served', 'rejected', 'served', 'cancelled', 'preparing']::text[],
  'incluye servidos, rechazados, cancelados y los que se quedaron abiertos'
);
select is(
  (select customer_masked from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1) where order_number = 1),
  'Marta S.',
  'el cliente aparece enmascarado igual que en el panel'
);
select is(
  (select rejection_reason from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1) where order_number = 2),
  'Cocina cerrada',
  'el motivo del rechazo llega al historial'
);
select is(
  (select items from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1) where order_number = 1),
  '[{"product_id":"history-cafe","product_name":"Café historial","quantity":2,"line_total_cents":500}]'::jsonb,
  'las líneas llevan nombre y total congelados'
);
select is(
  (select count(*)::integer from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1) as listed
   where listed::text ilike '%@spirit.test%' or listed::text ilike '%c1000000-0000-4000-8000-000000000001%'),
  0,
  'el historial no expone el correo ni el identificador del cliente'
);
select results_eq(
  $$select order_number from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 30)$$,
  array[1],
  'el employee ve el día 30 (límite incluido)'
);
select is_empty(
  $$select 1 from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days))$$,
  'hoy sin pedidos del negocio devuelve una lista vacía (no los activos de otros días)'
);
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 31)$$,
  '42501',
  'history_out_of_range',
  'el employee no ve el día 31'
);
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 90)$$,
  '42501',
  'history_out_of_range',
  'el employee no ve 90 días atrás'
);
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) + 1)$$,
  '22023',
  'invalid_date',
  'una fecha futura es inválida'
);
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', null)$$,
  '22023',
  'invalid_date',
  'una fecha nula es inválida'
);

-- ---------------------------------------------------------------------------
-- Employee con AAL1: no autorizado aunque la fecha esté en rango.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1)$$,
  '42501',
  'not_authorized',
  'sin AAL2 el employee no consulta el historial'
);

-- ---------------------------------------------------------------------------
-- Manager y owner: sin límite de días.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000002');
select results_eq(
  $$select order_number from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 31)$$,
  array[1],
  'el manager ve el día 31'
);
select results_eq(
  $$select order_number from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 90)$$,
  array[1],
  'el manager ve 90 días atrás'
);
select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000002', 'aal1');
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 90)$$,
  '42501',
  'not_authorized',
  'el manager también necesita AAL2'
);

select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000003');
select results_eq(
  $$select order_number from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 90)$$,
  array[1],
  'el owner ve 90 días atrás'
);
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) + 1)$$,
  '22023',
  'invalid_date',
  'tampoco el owner puede pedir una fecha futura'
);

-- ---------------------------------------------------------------------------
-- Otro negocio y cliente.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('c2000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1)$$,
  '42501',
  'not_authorized',
  'un empleado de otro negocio no ve el historial ajeno'
);
select is_empty(
  $$select 1 from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000002', (select today from history_days) - 1)$$,
  'en su propio negocio sólo ve sus pedidos (ninguno)'
);

select pg_temp.set_test_auth('c1000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.list_business_orders_by_date('c0000000-0000-4000-8000-000000000001', (select today from history_days) - 1)$$,
  '42501',
  'not_authorized',
  'el cliente no consulta el historial del negocio aunque tenga pedidos'
);

select * from finish();
rollback;

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

-- Prefijo b1…/b2…/b0… exclusivo de este fichero (ver 88813a2).
-- C cliente con pedido, D cliente sin pedido, E empleado, O empleado de otro negocio.
insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'panel-customer@spirit.test'),
  ('b1000000-0000-4000-8000-000000000002', 'panel-other-customer@spirit.test'),
  ('b2000000-0000-4000-8000-000000000001', 'panel-employee@spirit.test'),
  ('b2000000-0000-4000-8000-000000000002', 'panel-outsider@spirit.test');

update public.profiles set display_name = 'Marta Puig Soler'
where id = 'b1000000-0000-4000-8000-000000000001';

insert into public.businesses (id, name, active) values
  ('b0000000-0000-4000-8000-000000000001', 'Panel Test', true),
  ('b0000000-0000-4000-8000-000000000002', 'Panel Other Test', true);

insert into public.business_members (business_id, user_id, role, active) values
  ('b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'employee', true),
  ('b0000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'employee', true);

insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents) values
  ('b0000000-0000-4000-8000-000000000001', 'panel-cafe', 'test', 'Café panel', 'Cafè panel', 250),
  ('b0000000-0000-4000-8000-000000000001', 'panel-tostada', 'test', 'Tostada panel', 'Torrada panel', 800);

-- Pedidos insertados como postgres (el flujo de creación ya lo cubre ordering_test.sql).
insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at) values
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1,
   (now() at time zone 'Europe/Madrid')::date, 'Terraza 2', 'pending', 1300, 'Sin azúcar', now() - interval '3 minutes'),
  ('b3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 2,
   (now() at time zone 'Europe/Madrid')::date, 'Barra', 'cancelled', 250, null, now() - interval '2 minutes'),
  -- Activo de ayer: debe seguir apareciendo.
  ('b3000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 7,
   (now() at time zone 'Europe/Madrid')::date - 1, 'Mesa 4', 'preparing', 250, null, now() - interval '1 day'),
  -- Servido de ayer: ya no pertenece al panel.
  ('b3000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 8,
   (now() at time zone 'Europe/Madrid')::date - 1, 'Mesa 5', 'served', 250, null, now() - interval '1 day');

insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'panel-tostada', 2, 1, 800, 'Tostada panel', 800),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'panel-cafe', 1, 2, 250, 'Café panel', 500),
  ('b3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'panel-cafe', 1, 1, 250, 'Café panel', 250),
  ('b3000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'panel-cafe', 1, 1, 250, 'Café panel', 250),
  ('b3000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'panel-cafe', 1, 1, 250, 'Café panel', 250);

-- ---------------------------------------------------------------------------
-- Permisos de la función.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.list_business_orders(uuid)', 'execute'), 'anon no puede listar pedidos del negocio');
select ok(has_function_privilege('authenticated', 'public.list_business_orders(uuid)', 'execute'), 'authenticated puede invocar list_business_orders');
select is(
  (select prosecdef from pg_proc where oid = 'public.list_business_orders(uuid)'::regprocedure),
  true,
  'list_business_orders es SECURITY DEFINER'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Empleado real con AAL2.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('b2000000-0000-4000-8000-000000000001');

select results_eq(
  $$select order_number from public.list_business_orders('b0000000-0000-4000-8000-000000000001')$$,
  array[7, 1, 2],
  'el panel lista los pedidos de hoy y los activos anteriores, por antigüedad'
);
select is(
  (select customer_masked from public.list_business_orders('b0000000-0000-4000-8000-000000000001') where order_number = 1),
  'Marta S.',
  'el cliente aparece enmascarado como en el historial'
);
select is(
  (select items from public.list_business_orders('b0000000-0000-4000-8000-000000000001') where order_number = 1),
  '[{"product_id":"panel-cafe","product_name":"Café panel","quantity":2,"line_total_cents":500},{"product_id":"panel-tostada","product_name":"Tostada panel","quantity":1,"line_total_cents":800}]'::jsonb,
  'las líneas vienen ordenadas por posición con nombre y total congelados'
);
select results_eq(
  $$select note, table_label, total_cents from public.list_business_orders('b0000000-0000-4000-8000-000000000001') where order_number = 1$$,
  $$values ('Sin azúcar'::text, 'Terraza 2'::text, 1300)$$,
  'nota, mesa y total llegan al panel'
);
select is(
  (select count(*)::integer from public.list_business_orders('b0000000-0000-4000-8000-000000000001') as listed
   where listed::text ilike '%@spirit.test%' or listed::text ilike '%b1000000-0000-4000-8000-000000000001%'),
  0,
  'el panel no expone el correo ni el identificador del cliente'
);
select results_eq(
  $$select count(*) from public.orders where business_id = 'b0000000-0000-4000-8000-000000000001'$$,
  array[4::bigint],
  'el empleado con AAL2 lee orders de su negocio (vía de Realtime)'
);
select results_eq(
  $$select count(*) from public.order_items where business_id = 'b0000000-0000-4000-8000-000000000001'$$,
  array[5::bigint],
  'el empleado con AAL2 lee order_items de su negocio'
);
select is(
  public.update_order_status('b3000000-0000-4000-8000-000000000002', 'accepted'),
  'invalid_transition',
  'un pedido que el cliente ya canceló no se puede aceptar'
);

-- ---------------------------------------------------------------------------
-- El mismo empleado en AAL1.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('b2000000-0000-4000-8000-000000000001', 'aal1');

select results_eq(
  $$select count(*) from public.orders$$,
  array[0::bigint],
  'el mismo empleado sin AAL2 no lee orders'
);
select results_eq(
  $$select count(*) from public.order_items$$,
  array[0::bigint],
  'el mismo empleado sin AAL2 no lee order_items'
);
select throws_ok(
  $$select * from public.list_business_orders('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  'not_authorized',
  'el mismo empleado sin AAL2 no puede usar el panel'
);

-- Sin claim aal (token antiguo o manipulado) tampoco.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b2000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select results_eq($$select count(*) from public.orders$$, array[0::bigint], 'sin claim aal el empleado no lee orders');

-- ---------------------------------------------------------------------------
-- Empleado de otro negocio (AAL2).
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('b2000000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from public.list_business_orders('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  'not_authorized',
  'un empleado de otro negocio no puede listar los pedidos'
);
select results_eq($$select count(*) from public.orders$$, array[0::bigint], 'un empleado de otro negocio no lee orders ajenos');
select results_eq($$select count(*) from public.order_items$$, array[0::bigint], 'un empleado de otro negocio no lee order_items ajenos');

-- ---------------------------------------------------------------------------
-- Clientes (no empleados): la rama del cliente sigue funcionando en AAL1.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('b1000000-0000-4000-8000-000000000001', 'aal1');

select results_eq($$select count(*) from public.orders$$, array[4::bigint], 'el cliente en AAL1 sigue leyendo sus pedidos');
select results_eq($$select count(*) from public.order_items$$, array[5::bigint], 'el cliente en AAL1 sigue leyendo sus líneas');
select throws_ok(
  $$select * from public.list_business_orders('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  'not_authorized',
  'un cliente no puede usar el panel'
);

select pg_temp.set_test_auth('b1000000-0000-4000-8000-000000000002', 'aal2');

select results_eq($$select count(*) from public.orders$$, array[0::bigint], 'un no-empleado con AAL2 no lee pedidos ajenos');
select throws_ok(
  $$select * from public.list_business_orders('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  'not_authorized',
  'un no-empleado con AAL2 no puede usar el panel'
);

reset role;
select ok(
  (select count(*) = 0 from pg_policies where tablename in ('orders', 'order_items') and schemaname = 'public' and cmd <> 'SELECT'),
  'orders y order_items siguen sin políticas de escritura'
);

select * from finish();
rollback;

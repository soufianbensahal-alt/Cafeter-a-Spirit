begin;
create extension if not exists pgtap with schema extensions;
select plan(110);

create function pg_temp.set_test_auth(p_user_id uuid, p_aal text default 'aal2')
returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'aal', p_aal,
    'session_id', gen_random_uuid()
  )::text, true)
$$;

-- Clientes: A y B en el piloto, C fuera. E empleado, M manager, O empleado de otro negocio.
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'order-customer-a@spirit.test'),
  ('a1000000-0000-4000-8000-000000000002', 'order-customer-b@spirit.test'),
  ('a1000000-0000-4000-8000-000000000003', 'order-customer-c@spirit.test'),
  ('a2000000-0000-4000-8000-000000000001', 'order-employee@spirit.test'),
  ('a2000000-0000-4000-8000-000000000002', 'order-manager@spirit.test'),
  ('a2000000-0000-4000-8000-000000000003', 'order-outsider@spirit.test');

insert into public.businesses (id, name, active) values
  ('a0000000-0000-4000-8000-000000000001', 'Spirit Ordering Test', true),
  ('a0000000-0000-4000-8000-000000000002', 'Ordering Other Test', true);

insert into public.business_members (business_id, user_id, role, active) values
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'employee', true),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'manager', true),
  ('a0000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'employee', true);

insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents, in_catalog, is_available) values
  ('a0000000-0000-4000-8000-000000000001', 'test-cafe', 'test', 'Café test', 'Cafè test', 250, true, true),
  ('a0000000-0000-4000-8000-000000000001', 'test-tostada', 'test', 'Tostada test', 'Torrada test', 800, true, true),
  ('a0000000-0000-4000-8000-000000000001', 'test-agotado', 'test', 'Agotado', 'Esgotat', 300, true, false),
  ('a0000000-0000-4000-8000-000000000001', 'test-retirado', 'test', 'Retirado', 'Retirat', 300, false, true),
  ('a0000000-0000-4000-8000-000000000002', 'otro-cafe', 'test', 'Café ajeno', 'Cafè aliè', 100, true, true);

insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only) values
  ('a0000000-0000-4000-8000-000000000001', true, true),
  ('a0000000-0000-4000-8000-000000000002', true, false)
on conflict (business_id) do update
set ordering_enabled = excluded.ordering_enabled, pilot_only = excluded.pilot_only;

insert into public.ordering_pilot_members (business_id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');

insert into private.business_order_codes (business_id, code, expires_at) values
  ('a0000000-0000-4000-8000-000000000001', '1234', now() + interval '1 hour'),
  ('a0000000-0000-4000-8000-000000000002', '9999', now() + interval '1 hour');

-- ---------------------------------------------------------------------------
-- Estructura, permisos y semilla del catálogo.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('products', 'business_ordering_settings', 'ordering_pilot_members', 'orders', 'order_items') and relrowsecurity$$,
  array[5::bigint],
  'RLS está activa en las cinco tablas públicas de pedidos'
);
select results_eq(
  $$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'$$,
  array[1::bigint],
  'orders se publica en Realtime'
);
select results_eq(
  $$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'$$,
  array[1::bigint],
  'products se publica en Realtime (agotados en la carta sin recargar)'
);
select ok(not has_function_privilege('anon', 'public.create_order(uuid, text, text, jsonb, text)', 'execute'), 'anon no puede crear pedidos');
select ok(has_function_privilege('authenticated', 'public.create_order(uuid, text, text, jsonb, text)', 'execute'), 'authenticated puede invocar create_order');
select ok(not has_function_privilege('anon', 'public.update_order_status(uuid, text, text)', 'execute'), 'anon no puede cambiar estados');
select ok(not has_function_privilege('anon', 'public.regenerate_order_code(uuid, integer)', 'execute'), 'anon no puede regenerar códigos');
select is(
  (select price_cents from public.products as product join public.businesses as business on business.id = product.business_id
   where lower(business.name) = lower('Cafetería Spirit - Montcada') and product.id = 'cafes-latte'),
  220,
  'la migración de catálogo sincroniza precios en céntimos con el id estable'
);
select is(
  (select count(*)::integer from public.products as product join public.businesses as business on business.id = product.business_id
   where lower(business.name) = lower('Cafetería Spirit - Montcada') and product.id = 'bebidas-cervezas-artesanas'),
  0,
  'los productos sin precio no se sincronizan'
);

-- ---------------------------------------------------------------------------
-- Cliente A (piloto). Los clientes no necesitan AAL2.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');

select is(
  (select status from public.create_order(
    'a0000000-0000-4000-8000-000000000001', '1234', 'Mesa 4',
    '[{"product_id":"test-cafe","quantity":2,"price":1,"unit_price_cents":1},{"product_id":"test-tostada","quantity":1,"price_cents":1}]'::jsonb,
    '  sin azúcar  '
  )),
  'ok',
  'un pedido válido se crea aunque el cliente envíe precios manipulados'
);
select is((select total_cents from public.orders where customer_id = 'a1000000-0000-4000-8000-000000000001'), 1300, 'el total se calcula en servidor (2×250 + 800)');
select results_eq(
  $$select unit_price_cents from public.order_items order by position$$,
  array[250, 800],
  'las líneas congelan el precio del servidor, no el del cliente'
);
select results_eq(
  $$select product_name from public.order_items order by position$$,
  array['Café test'::text, 'Tostada test'::text],
  'las líneas congelan el nombre del producto'
);
select results_eq(
  $$select order_number, status, payment_status, note, table_id is null from public.orders$$,
  $$values (1, 'pending'::text, 'pay_at_venue'::text, 'sin azúcar'::text, true)$$,
  'el pedido recibe número corto, queda pendiente, se paga en el local y table_id es nulo'
);
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '0000', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'invalid_code',
  'un código incorrecto se rechaza'
);
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', 'abcd', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'invalid_code',
  'un código con formato inválido se rechaza'
);

reset role;
update private.business_order_codes
set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where business_id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'invalid_code',
  'un código caducado se rechaza igual que uno incorrecto'
);

reset role;
update private.business_order_codes
set created_at = now(), expires_at = now() + interval '1 hour'
where business_id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;

select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-agotado","quantity":1}]'::jsonb)), 'product_unavailable', 'un producto agotado no se puede pedir');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-retirado","quantity":1}]'::jsonb)), 'product_unavailable', 'un producto retirado del catálogo no se puede pedir');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"otro-cafe","quantity":1}]'::jsonb)), 'product_unavailable', 'un producto de otro negocio no se puede pedir');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"no-existe","quantity":1}]'::jsonb)), 'product_unavailable', 'un producto inexistente no se puede pedir');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":0}]'::jsonb)), 'invalid_quantity', 'la cantidad 0 se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":11}]'::jsonb)), 'invalid_quantity', 'la cantidad 11 se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1.5}]'::jsonb)), 'invalid_quantity', 'una cantidad decimal se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":-3}]'::jsonb)), 'invalid_quantity', 'una cantidad negativa se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":"2"}]'::jsonb)), 'invalid_items', 'una cantidad en texto se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[]'::jsonb)), 'invalid_items', 'un pedido vacío se rechaza');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '{"product_id":"test-cafe"}'::jsonb)), 'invalid_items', 'items debe ser un array');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1},{"product_id":"test-cafe","quantity":1}]'::jsonb)), 'duplicate_product', 'las líneas duplicadas se rechazan');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', '   ', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)), 'invalid_table_label', 'la mesa es obligatoria');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', repeat('x', 21), '[{"product_id":"test-cafe","quantity":1}]'::jsonb)), 'invalid_table_label', 'la mesa admite como máximo 20 caracteres');
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb, repeat('n', 201))), 'invalid_note', 'la nota admite como máximo 200 caracteres');

select results_eq(
  $$select status, order_number from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)$$,
  $$values ('ok'::text, 2)$$,
  'el segundo pedido activo se acepta con el siguiente número'
);
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)), 'active_order_limit', 'el tercer pedido activo se rechaza');
select is(
  public.cancel_own_order((select id from public.orders where order_number = 2)),
  'ok',
  'el cliente puede cancelar su pedido pendiente'
);
select is(
  public.cancel_own_order((select id from public.orders where order_number = 2)),
  'invalid_transition',
  'un pedido cancelado no se vuelve a cancelar'
);
select is((select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)), 'ok', 'tras cancelar se libera un hueco de pedido activo');
select is(
  public.update_order_status((select id from public.orders where order_number = 1), 'accepted'),
  'not_authorized',
  'un cliente no puede cambiar el estado de su pedido'
);

select throws_ok(
  $$insert into public.orders (business_id, customer_id, order_number, service_date, table_label, total_cents) values ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 99, current_date, 'Barra', 1)$$,
  '42501', null, 'el cliente no puede insertar pedidos directamente'
);
select throws_ok(
  $$update public.orders set total_cents = 1$$,
  '42501', null, 'el cliente no puede alterar el total'
);
select throws_ok(
  $$insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) select id, business_id, 'test-cafe', 9, 1, 1, 'x', 1 from public.orders limit 1$$,
  '42501', null, 'el cliente no puede insertar líneas'
);
select throws_ok(
  $$update public.products set price_cents = 1$$,
  '42501', null, 'el cliente no puede cambiar precios'
);
select throws_ok(
  $$select code from private.business_order_codes$$,
  '42501', null, 'el código del día no es legible por clientes'
);
select results_eq('select count(*) from public.business_ordering_settings', array[0::bigint], 'el cliente no lee la configuración del negocio');
select results_eq(
  $$select ordering_enabled, eligible from public.get_ordering_status('a0000000-0000-4000-8000-000000000001')$$,
  $$values (true, true)$$,
  'un miembro del piloto ve los pedidos abiertos y es elegible'
);

reset role;
create temporary table spirit_order_ids on commit drop as select id, order_number from public.orders where business_id = 'a0000000-0000-4000-8000-000000000001';
grant select on spirit_order_ids to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Cliente B: límite de intentos y aislamiento entre clientes.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000002', 'aal1');

select results_eq('select count(*) from public.orders', array[0::bigint], 'un cliente no ve pedidos de otro cliente');
select results_eq('select count(*) from public.order_items', array[0::bigint], 'un cliente no ve líneas de otro cliente');
select is(
  public.cancel_own_order((select id from spirit_order_ids where order_number = 1)),
  'not_found',
  'un cliente no puede cancelar pedidos ajenos'
);
select results_eq(
  $$select attempt.status from (values ('1111'), ('2222'), ('3333'), ('4444'), ('5555')) as c(code) cross join lateral public.create_order('a0000000-0000-4000-8000-000000000001', c.code, 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb) as attempt order by c.code$$,
  array['invalid_code'::text, 'invalid_code', 'invalid_code', 'invalid_code', 'invalid_code'],
  'cinco códigos incorrectos se registran como fallos'
);
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'code_rate_limited',
  'tras cinco fallos el código correcto también se bloquea'
);

-- ---------------------------------------------------------------------------
-- Cliente C: fuera del piloto.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000003', 'aal1');

select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'not_in_pilot',
  'un usuario fuera del piloto no puede pedir'
);
select results_eq(
  $$select ordering_enabled, eligible from public.get_ordering_status('a0000000-0000-4000-8000-000000000001')$$,
  $$values (true, false)$$,
  'un usuario fuera del piloto no es elegible'
);

-- ---------------------------------------------------------------------------
-- Empleado E (AAL2).
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000001');

select results_eq(
  $$select count(*) from public.orders where business_id = 'a0000000-0000-4000-8000-000000000001'$$,
  array[3::bigint],
  'el empleado ve los pedidos de su negocio'
);
select results_eq(
  $$select status, order_code from public.get_current_order_code('a0000000-0000-4000-8000-000000000001')$$,
  $$values ('ok'::text, '1234'::text)$$,
  'el empleado puede consultar el código vigente'
);
select is(public.set_ordering_enabled('a0000000-0000-4000-8000-000000000001', false), 'ok', 'el empleado puede cerrar los pedidos');

select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'ordering_closed',
  'con los pedidos cerrados no se aceptan pedidos'
);

select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000001');
select is(public.set_ordering_enabled('a0000000-0000-4000-8000-000000000001', true), 'ok', 'el empleado puede reabrir los pedidos');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'served'), 'invalid_transition', 'no se puede servir un pedido sin aceptarlo');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'rejected'), 'reason_required', 'rechazar exige un motivo');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'accepted'), 'ok', 'pending → accepted');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'preparing'), 'ok', 'accepted → preparing');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'served'), 'ok', 'preparing → served');
select is(public.update_order_status((select id from public.orders where order_number = 1), 'cancelled'), 'invalid_transition', 'un pedido servido es final');
select results_eq(
  $$select handled_by, accepted_at is not null, preparing_at is not null, served_at is not null from public.orders where order_number = 1$$,
  $$values ('a2000000-0000-4000-8000-000000000001'::uuid, true, true, true)$$,
  'cada transición registra su timestamp y el empleado'
);
select is(public.update_order_status((select id from public.orders where order_number = 3), 'rejected', 'Cocina cerrada'), 'ok', 'el empleado puede rechazar con motivo');
select is(public.set_product_availability('a0000000-0000-4000-8000-000000000001', 'test-cafe', false), 'ok', 'el empleado puede marcar un producto como agotado');
select is(public.set_product_availability('a0000000-0000-4000-8000-000000000001', 'no-existe', false), 'not_found', 'un producto inexistente devuelve not_found');
select is(public.add_ordering_pilot_member('a0000000-0000-4000-8000-000000000001', 'order-customer-c@spirit.test'), 'not_authorized', 'un empleado no gestiona el piloto');

select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-cafe","quantity":1}]'::jsonb)),
  'product_unavailable',
  'un producto marcado como agotado deja de poder pedirse'
);

select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000001', 'aal1');
select is(public.set_ordering_enabled('a0000000-0000-4000-8000-000000000001', false), 'not_authorized', 'sin AAL2 el empleado no puede operar');

-- ---------------------------------------------------------------------------
-- Empleado de otro negocio.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000003');

select results_eq($$select count(*) from public.orders where business_id = 'a0000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'otro negocio no ve pedidos de Spirit');
select results_eq($$select count(*) from public.order_items where business_id = 'a0000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'otro negocio no ve líneas de Spirit');
select is(public.update_order_status('00000000-0000-4000-8000-00000000ffff', 'accepted'), 'not_found', 'un pedido inexistente devuelve not_found');

select is(public.update_order_status((select id from spirit_order_ids where order_number = 2), 'accepted'), 'not_authorized', 'otro negocio no puede cambiar pedidos de Spirit');
select is((select status from public.regenerate_order_code('a0000000-0000-4000-8000-000000000001')), 'not_authorized', 'otro negocio no puede regenerar el código de Spirit');
select is((select status from public.get_current_order_code('a0000000-0000-4000-8000-000000000001')), 'not_authorized', 'otro negocio no puede leer el código de Spirit');
select is(public.set_product_availability('a0000000-0000-4000-8000-000000000001', 'test-tostada', false), 'not_authorized', 'otro negocio no puede cambiar productos de Spirit');

-- ---------------------------------------------------------------------------
-- Manager M: piloto y apertura general.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000002');

select is(public.add_ordering_pilot_member('a0000000-0000-4000-8000-000000000001', ' Order-Customer-C@spirit.test '), 'ok', 'el manager añade usuarios al piloto por correo');
select is(public.add_ordering_pilot_member('a0000000-0000-4000-8000-000000000001', 'order-customer-c@spirit.test'), 'already_member', 'añadir dos veces es idempotente');
select is(public.add_ordering_pilot_member('a0000000-0000-4000-8000-000000000001', 'nadie@spirit.test'), 'user_not_found', 'un correo desconocido no se añade');
select results_eq(
  $$select email_masked from public.list_ordering_pilot_members('a0000000-0000-4000-8000-000000000001') where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  array['o***@spirit.test'::text],
  'el listado del piloto enmascara el correo'
);
select is(public.remove_ordering_pilot_member('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003'), 'ok', 'el manager puede retirar usuarios del piloto');
select is(public.set_ordering_pilot_only('a0000000-0000-4000-8000-000000000001', false), 'ok', 'el manager puede abrir los pedidos a todos');

select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000003', 'aal1');
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-tostada","quantity":1}]'::jsonb)),
  'ok',
  'con pilot_only = false cualquier cliente autenticado puede pedir'
);

-- ---------------------------------------------------------------------------
-- Regeneración del código.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('a2000000-0000-4000-8000-000000000001');
select is((select status from public.regenerate_order_code('a0000000-0000-4000-8000-000000000001', 1)), 'invalid_duration', 'la validez mínima es de 5 minutos');
select ok(
  (select order_code ~ '^[0-9]{4}$' and order_code <> '1234' from public.regenerate_order_code('a0000000-0000-4000-8000-000000000001')),
  'regenerar devuelve un código nuevo de cuatro cifras'
);

select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000003', 'aal1');
select is(
  (select status from public.create_order('a0000000-0000-4000-8000-000000000001', '1234', 'Barra', '[{"product_id":"test-tostada","quantity":1}]'::jsonb)),
  'invalid_code',
  'el código anterior deja de funcionar al regenerarlo'
);

reset role;
select results_eq(
  $$select count(*) from private.order_code_attempts where user_id = 'a1000000-0000-4000-8000-000000000002' and not success$$,
  array[5::bigint],
  'los intentos fallidos persisten porque create_order no lanza excepciones'
);

-- ---------------------------------------------------------------------------
-- get_own_ordering_context: negocio Spirit Montcada localizado por nombre.
-- ---------------------------------------------------------------------------
create temporary table spirit_montcada on commit drop as
select id from public.businesses
where lower(btrim(name)) = lower(btrim('Cafetería Spirit - Montcada'));
grant select on spirit_montcada to authenticated;

update public.business_ordering_settings
set ordering_enabled = true, pilot_only = true
where business_id = (select id from spirit_montcada);
insert into public.ordering_pilot_members (business_id, user_id)
select id, 'a1000000-0000-4000-8000-000000000001' from spirit_montcada
on conflict do nothing;

select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_own_ordering_context()'::regprocedure),
  'get_own_ordering_context es SECURITY DEFINER con search_path vacío'
);

set local role authenticated;
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');
select results_eq(
  $$select business_id, ordering_enabled, eligible from public.get_own_ordering_context()$$,
  $$select id, true, true from spirit_montcada$$,
  'un miembro del piloto recibe el business_id de Spirit Montcada y es elegible'
);

select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000003', 'aal1');
select results_eq(
  $$select business_id, ordering_enabled, eligible from public.get_own_ordering_context()$$,
  $$select id, true, false from spirit_montcada$$,
  'un cliente fuera del piloto no es elegible'
);

reset role;
update public.business_ordering_settings set ordering_enabled = false
where business_id = (select id from spirit_montcada);
set local role authenticated;
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');
select results_eq(
  $$select ordering_enabled, eligible from public.get_own_ordering_context()$$,
  $$values (false, true)$$,
  'con los pedidos cerrados ordering_enabled es false'
);

reset role;
update public.business_ordering_settings set pilot_only = false
where business_id = (select id from spirit_montcada);
set local role authenticated;
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000003', 'aal1');
select results_eq(
  $$select eligible from public.get_own_ordering_context()$$,
  array[true],
  'sin modo piloto cualquier cliente autenticado es elegible'
);

select set_config('request.jwt.claims', '{}', true);
select is_empty(
  $$select * from public.get_own_ordering_context()$$,
  'sin auth.uid() no devuelve ninguna fila'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.get_own_ordering_context()$$,
  '42501', null, 'anon no puede ejecutar get_own_ordering_context'
);
reset role;

-- ---------------------------------------------------------------------------
-- Lecturas reales de la app como clientes (sin rol en el equipo ni tarjeta):
-- products, orders y order_items propios, y aislamiento entre clientes.
-- ---------------------------------------------------------------------------
-- Cliente D: sin pedidos, sin tarjeta, fuera de cualquier piloto y sin rol de equipo.
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000004', 'order-customer-d@spirit.test');
insert into public.businesses (id, name, active) values
  ('a0000000-0000-4000-8000-000000000003', 'Ordering Inactive Test', false);
insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents) values
  ('a0000000-0000-4000-8000-000000000003', 'inactivo-cafe', 'test', 'Café inactivo', 'Cafè inactiu', 200);

-- Pedido de B insertado directamente para comprobar que A no lo ve.
insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, total_cents) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 900, current_date, 'Mesa 9', 250);
insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'test-cafe', 1, 1, 250, 'Café test', 250);

create temporary table spirit_expected_reads on commit drop as
select
  customer.id as customer_id,
  (select count(*) from public.orders as o where o.customer_id = customer.id) as orders,
  (select count(*) from public.order_items as i join public.orders as o on o.id = i.order_id where o.customer_id = customer.id) as items
from (values ('a1000000-0000-4000-8000-000000000001'::uuid), ('a1000000-0000-4000-8000-000000000002'::uuid)) as customer(id);
grant select on spirit_expected_reads to authenticated;

select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.is_active_business(uuid)'::regprocedure),
  'is_active_business es SECURITY DEFINER con search_path vacío'
);

set local role authenticated;

-- Cliente D: fuera del piloto, sin tarjeta, sin pedidos.
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000004', 'aal1');
select results_eq(
  $$select count(*) from public.products where business_id = 'a0000000-0000-4000-8000-000000000001'$$,
  array[4::bigint],
  'un cliente sin tarjeta ni rol de equipo lee los productos de un negocio activo'
);
select ok(
  (select count(*) from public.products where business_id = (select id from spirit_montcada)) > 100,
  'un cliente sin tarjeta lee la carta sincronizada de Spirit Montcada'
);
select results_eq(
  $$select count(*) from public.products where business_id = 'a0000000-0000-4000-8000-000000000003'$$,
  array[0::bigint],
  'los productos de un negocio inactivo no son visibles'
);
select results_eq('select count(*) from public.orders', array[0::bigint], 'un cliente sin pedidos no ve pedidos ajenos');
select results_eq('select count(*) from public.order_items', array[0::bigint], 'un cliente sin pedidos no ve líneas ajenas');

-- Cliente A: en el piloto, con pedidos propios.
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000001', 'aal1');
select results_eq(
  'select count(*) from public.orders',
  $$select orders from spirit_expected_reads where customer_id = 'a1000000-0000-4000-8000-000000000001' and orders > 0$$,
  'un cliente del piloto lee todos sus pedidos'
);
select results_eq(
  $$select count(*) from public.orders where customer_id is distinct from 'a1000000-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'un cliente del piloto no ve pedidos de otros clientes'
);
select results_eq(
  'select count(*) from public.order_items',
  $$select items from spirit_expected_reads where customer_id = 'a1000000-0000-4000-8000-000000000001' and items > 0$$,
  'un cliente del piloto lee las líneas de sus pedidos'
);
select results_eq(
  $$select count(*) from public.order_items where order_id = 'a3000000-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'un cliente del piloto no ve las líneas del pedido de otro cliente'
);

-- Cliente B: en el piloto, con un pedido propio.
select pg_temp.set_test_auth('a1000000-0000-4000-8000-000000000002', 'aal1');
select results_eq(
  'select id from public.orders',
  $$values ('a3000000-0000-4000-8000-000000000001'::uuid)$$,
  'otro cliente ve exactamente su propio pedido'
);
select results_eq(
  'select count(*) from public.order_items',
  $$select items from spirit_expected_reads where customer_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'otro cliente ve solo las líneas de su pedido'
);

reset role;
set local role anon;
select throws_ok($$select * from public.products$$, '42501', null, 'anon no puede leer productos');
select throws_ok(
  $$select public.is_active_business('a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon no puede ejecutar is_active_business'
);
reset role;

set local role anon;
select throws_ok($$select * from public.orders$$, '42501', null, 'anon no puede leer pedidos');

select * from finish();
rollback;

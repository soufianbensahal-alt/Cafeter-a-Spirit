begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- Sesión de prueba. p_anonymous replica el claim is_anonymous del JWT de un
-- inicio de sesión anónimo de Supabase.
create function pg_temp.set_test_auth(p_user_id uuid, p_aal text default 'aal2', p_anonymous boolean default false)
returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'aal', p_aal,
    'is_anonymous', p_anonymous,
    'session_id', gen_random_uuid()
  )::text, true)
$$;

-- Prefijo d0…/d1…/d2…/d3… exclusivo de este fichero.
-- G invitado, H otro invitado, R cliente registrado, E employee, M manager.
insert into auth.users (id, email, is_anonymous) values
  ('d1000000-0000-4000-8000-000000000001', null, true),
  ('d1000000-0000-4000-8000-000000000002', null, true),
  ('d1000000-0000-4000-8000-000000000003', 'guest-registered@spirit.test', false),
  ('d2000000-0000-4000-8000-000000000001', 'guest-employee@spirit.test', false),
  ('d2000000-0000-4000-8000-000000000002', 'guest-manager@spirit.test', false);

insert into public.businesses (id, name, active) values
  ('d0000000-0000-4000-8000-000000000001', 'Guest Test', true);

insert into public.business_members (business_id, user_id, role, active) values
  ('d0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'employee', true),
  ('d0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'manager', true);

insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents) values
  ('d0000000-0000-4000-8000-000000000001', 'guest-cafe', 'test', 'Café invitado', 'Cafè convidat', 250);

-- Pedidos abiertos, sólo piloto (los invitados no dependen del piloto) y código.
insert into public.business_ordering_settings (business_id, ordering_enabled, pilot_only) values
  ('d0000000-0000-4000-8000-000000000001', true, true);
insert into private.business_order_codes (business_id, code, expires_at) values
  ('d0000000-0000-4000-8000-000000000001', '4826', now() + interval '1 hour');

-- ---------------------------------------------------------------------------
-- Datos y permisos.
-- ---------------------------------------------------------------------------
select is(
  (select guest_ordering_enabled from public.business_ordering_settings where business_id = 'd0000000-0000-4000-8000-000000000001'),
  false,
  '«Pedidos sin cuenta» está apagado por defecto'
);
select ok(not exists (select 1 from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 'un invitado no tiene perfil');
select ok(exists (select 1 from public.profiles where id = 'd1000000-0000-4000-8000-000000000003'), 'un registrado sí tiene perfil');
select ok(not has_function_privilege('anon', 'public.create_order(uuid, text, text, jsonb, text, text)', 'execute'), 'sin sesión no se puede pedir');
select ok(has_function_privilege('anon', 'public.get_guest_ordering_status()', 'execute'), 'sin sesión se puede saber si se admite pedir sin cuenta');
select ok(not has_function_privilege('anon', 'public.set_guest_ordering_enabled(uuid, boolean)', 'execute'), 'anon no gestiona el interruptor');
select ok(not has_function_privilege('authenticated', 'private.purge_stale_guests(timestamptz)', 'execute'), 'la limpieza no es invocable desde la app');
select ok(exists (select 1 from cron.job where jobname = 'purge-stale-guests' and schedule = '0 3 * * *'), 'la limpieza está programada a diario');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Interruptor apagado: el invitado no puede pedir.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000001', 'aal1', true);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Laura')),
  'guest_ordering_disabled',
  'con el interruptor apagado el invitado no puede pedir'
);
select results_eq(
  $$select ordering_enabled, eligible from public.get_ordering_status('d0000000-0000-4000-8000-000000000001')$$,
  $$values (true, false)$$,
  'con el interruptor apagado el invitado no es elegible'
);

-- ---------------------------------------------------------------------------
-- Interruptor: sólo owner/manager con AAL2.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('d2000000-0000-4000-8000-000000000001');
select is(public.set_guest_ordering_enabled('d0000000-0000-4000-8000-000000000001', true), 'not_authorized', 'un employee no activa «Pedidos sin cuenta»');
select pg_temp.set_test_auth('d2000000-0000-4000-8000-000000000002', 'aal1');
select is(public.set_guest_ordering_enabled('d0000000-0000-4000-8000-000000000001', true), 'not_authorized', 'un manager sin AAL2 tampoco');
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000001', 'aal1', true);
select is(public.set_guest_ordering_enabled('d0000000-0000-4000-8000-000000000001', true), 'not_authorized', 'un invitado tampoco');
select pg_temp.set_test_auth('d2000000-0000-4000-8000-000000000002');
select is(public.set_guest_ordering_enabled('d0000000-0000-4000-8000-000000000001', true), 'ok', 'el manager activa «Pedidos sin cuenta»');

-- ---------------------------------------------------------------------------
-- Interruptor activo: el invitado pide (aunque el piloto esté limitado).
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000001', 'aal1', true);
select results_eq(
  $$select ordering_enabled, eligible from public.get_ordering_status('d0000000-0000-4000-8000-000000000001')$$,
  $$values (true, true)$$,
  'con el interruptor activo el invitado es elegible aunque no esté en el piloto'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, null)),
  'invalid_guest_name',
  'el nombre para el pedido es obligatorio para el invitado'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, ' L ')),
  'invalid_guest_name',
  'un nombre de 1 carácter no vale'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, repeat('a', 31))),
  'invalid_guest_name',
  'un nombre de 31 caracteres no vale'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '0000', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Laura')),
  'invalid_code',
  'el invitado también necesita el código del día'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":2}]', null, '  Laura   Gómez ')),
  'ok',
  'el invitado pide con nombre, código y mesa'
);
select results_eq(
  $$select guest_name, customer_id, total_cents from public.orders where business_id = 'd0000000-0000-4000-8000-000000000001' and customer_id = 'd1000000-0000-4000-8000-000000000001'$$,
  $$values ('Laura Gómez'::text, 'd1000000-0000-4000-8000-000000000001'::uuid, 500)$$,
  'el pedido guarda el nombre normalizado y pertenece al invitado'
);
select results_eq(
  $$select count(*) from public.orders where business_id = 'd0000000-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'el invitado ve su propio pedido (RLS de «Mis pedidos»)'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Laura')),
  'ok',
  'segundo pedido activo del invitado'
);
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Laura')),
  'active_order_limit',
  'el invitado tiene el mismo límite de 2 pedidos activos'
);

-- Otro invitado no ve los pedidos del primero.
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000002', 'aal1', true);
select is_empty(
  $$select 1 from public.orders where business_id = 'd0000000-0000-4000-8000-000000000001'$$,
  'un invitado no ve los pedidos de otro'
);

-- El registrado sigue sujeto al piloto y no puede usar el nombre de invitado.
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000003', 'aal1');
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Barra', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Otro')),
  'not_in_pilot',
  'el filtro de piloto se sigue aplicando a los registrados'
);
reset role;
insert into public.ordering_pilot_members (business_id, user_id) values ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000003', 'aal1');
select is(
  (select status from public.create_order('d0000000-0000-4000-8000-000000000001', '4826', 'Mesa 2', '[{"product_id":"guest-cafe","quantity":1}]', null, 'Otro')),
  'ok',
  'el registrado del piloto pide'
);
select is(
  (select guest_name from public.orders where customer_id = 'd1000000-0000-4000-8000-000000000003'),
  null,
  'un registrado nunca guarda nombre de invitado'
);

-- ---------------------------------------------------------------------------
-- Panel: «Nombre · Invitado».
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('d2000000-0000-4000-8000-000000000001');
select results_eq(
  $$select customer_masked from public.list_business_orders('d0000000-0000-4000-8000-000000000001') where customer_masked like '%Invitado' order by order_number$$,
  array['Laura Gómez · Invitado'::text, 'Laura · Invitado'::text],
  'el panel muestra los pedidos del invitado como «Nombre · Invitado»'
);
select results_eq(
  $$select count(*) from public.list_business_orders_by_date('d0000000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Madrid')::date) where customer_masked like '% · Invitado'$$,
  array[2::bigint],
  'también en el historial por día'
);

-- ---------------------------------------------------------------------------
-- Sin fidelización para invitados.
-- ---------------------------------------------------------------------------
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000001', 'aal1', true);
select throws_ok($$select * from public.ensure_own_customer_card()$$, '42501', 'guest_not_allowed', 'un invitado no obtiene tarjeta (ensure_own_customer_card)');
select throws_ok($$select * from public.create_own_customer_membership()$$, '42501', 'guest_not_allowed', 'un invitado no se adhiere a la fidelización');
select throws_ok($$select * from public.create_stamp_request(gen_random_uuid())$$, '42501', 'guest_not_allowed', 'un invitado no pide sellos');
select throws_ok($$select * from public.create_reward_redemption_request(gen_random_uuid())$$, '42501', 'guest_not_allowed', 'un invitado no canjea recompensas');
select throws_ok($$select * from public.get_own_stamp_history(gen_random_uuid(), 10, null)$$, '42501', 'guest_not_allowed', 'un invitado no tiene historial de sellos');
select throws_ok($$select public.register_own_push_subscription('https://push.example/x', 'key', 'auth', 'es')$$, '42501', 'guest_not_allowed', 'un invitado no se suscribe a avisos de fidelización');
select throws_ok(
  $$insert into public.profiles (id, display_name) values ('d1000000-0000-4000-8000-000000000001', 'Laura')$$,
  '42501',
  null,
  'un invitado no puede crearse un perfil'
);
select is_empty($$select 1 from public.customer_cards where customer_id = 'd1000000-0000-4000-8000-000000000001'$$, 'el invitado no tiene tarjeta');

-- ---------------------------------------------------------------------------
-- Conversión a cuenta normal (email verificado): misma fila, mismos pedidos.
-- ---------------------------------------------------------------------------
reset role;
update auth.users
set is_anonymous = false,
    email = 'laura-convertida@spirit.test',
    email_confirmed_at = now(),
    raw_user_meta_data = '{"display_name":"Laura Gómez","privacy_consent":true,"privacy_policy_version":"2026-08-05"}'::jsonb
where id = 'd1000000-0000-4000-8000-000000000001';

select is((select display_name from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 'Laura Gómez', 'al convertirse se crea su perfil');
select is((select policy_version from public.privacy_consents where user_id = 'd1000000-0000-4000-8000-000000000001'), '2026-08-05', 'y se registra su consentimiento');
select results_eq(
  $$select count(*) from public.orders where customer_id = 'd1000000-0000-4000-8000-000000000001'$$,
  array[2::bigint],
  'conserva sus pedidos como invitado'
);

set local role authenticated;
select pg_temp.set_test_auth('d1000000-0000-4000-8000-000000000001', 'aal1', false);
select results_eq(
  $$select count(*) from public.orders where business_id = 'd0000000-0000-4000-8000-000000000001'$$,
  array[2::bigint],
  'ya registrado, sigue viendo sus pedidos'
);
select results_eq(
  $$select current_stamps, available_rewards from public.create_own_customer_membership()$$,
  $$values (0, 0)$$,
  'ya registrado se adhiere a la tarjeta con 0 sellos: sin sellos retroactivos por sus pedidos'
);
select is_empty(
  $$select 1 from public.stamp_transactions where customer_card_id in (select id from public.customer_cards where customer_id = 'd1000000-0000-4000-8000-000000000001')$$,
  'ningún pedido genera transacciones de sellos'
);

-- ---------------------------------------------------------------------------
-- Limpieza: última actividad (último pedido o último inicio de sesión) de más
-- de 30 días y sin pedidos activos.
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email, is_anonymous, created_at, last_sign_in_at) values
  -- A: 40 días sin actividad ni pedidos → se borra.
  ('d3000000-0000-4000-8000-00000000000a', null, true, now() - interval '40 days', now() - interval '40 days'),
  -- B: creado hace 40 días, pedido servido hace 2 → se conserva.
  ('d3000000-0000-4000-8000-00000000000b', null, true, now() - interval '40 days', now() - interval '40 days'),
  -- C: pedido activo antiguo (35 días) → se conserva.
  ('d3000000-0000-4000-8000-00000000000c', null, true, now() - interval '40 days', now() - interval '40 days'),
  -- D: creado hace 40 días pero inició sesión hace 3 → se conserva.
  ('d3000000-0000-4000-8000-00000000000d', null, true, now() - interval '40 days', now() - interval '3 days'),
  -- F: pedido servido hace 35 días → se borra, el pedido se conserva.
  ('d3000000-0000-4000-8000-00000000000f', null, true, now() - interval '40 days', now() - interval '40 days'),
  -- R: registrado sin actividad → nunca se borra.
  ('d3000000-0000-4000-8000-0000000000aa', 'old-registered@spirit.test', false, now() - interval '400 days', now() - interval '400 days');

insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, status, total_cents, guest_name, created_at, updated_at, served_at) values
  ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-00000000000b', 101, current_date - 2, 'Barra', 'served', 250, 'Bea', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'),
  ('d4000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-00000000000c', 102, current_date - 35, 'Barra', 'pending', 250, 'Carla', now() - interval '35 days', now() - interval '35 days', null),
  ('d4000000-0000-4000-8000-00000000000f', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-00000000000f', 103, current_date - 35, 'Barra', 'served', 250, 'Fran', now() - interval '35 days', now() - interval '35 days', now() - interval '35 days');

select ok(private.purge_stale_guests() >= 2, 'la limpieza borra los invitados inactivos');
select ok(not exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-00000000000a'), 'A (40 días sin actividad) se borra');
select ok(exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-00000000000b'), 'B (creado hace 40 días, pedido servido hace 2) se conserva');
select ok(exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-00000000000c'), 'C (con un pedido activo) se conserva');
select ok(exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-00000000000d'), 'D (inició sesión hace 3 días) se conserva');
select ok(not exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-00000000000f'), 'F (último pedido hace 35 días) se borra');
select results_eq(
  $$select customer_id, guest_name, status from public.orders where id = 'd4000000-0000-4000-8000-00000000000f'$$,
  $$values (null::uuid, 'Fran'::text, 'served'::text)$$,
  'el pedido de F se conserva sin cliente y con su nombre de invitado'
);
select ok(exists (select 1 from auth.users where id = 'd3000000-0000-4000-8000-0000000000aa'), 'los registrados nunca se borran');

select * from finish();
rollback;

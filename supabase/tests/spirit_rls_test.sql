begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'customer-one@spirit.test'),
  ('10000000-0000-4000-8000-000000000002', 'customer-two@spirit.test'),
  ('20000000-0000-4000-8000-000000000001', 'employee@spirit.test'),
  ('20000000-0000-4000-8000-000000000002', 'outsider@spirit.test'),
  ('20000000-0000-4000-8000-000000000003', 'inactive@spirit.test'),
  ('20000000-0000-4000-8000-000000000004', 'inactive-business@spirit.test');

update public.profiles
set display_name = case id
  when '10000000-0000-4000-8000-000000000001' then 'Cliente Uno'
  when '10000000-0000-4000-8000-000000000002' then 'Cliente Dos'
  when '20000000-0000-4000-8000-000000000001' then 'Empleado Spirit'
  when '20000000-0000-4000-8000-000000000002' then 'Empleado Externo'
  else display_name
end;

insert into public.businesses (id, name, active) values
  ('00000000-0000-4000-8000-000000000002', 'Otro negocio', true),
  ('00000000-0000-4000-8000-000000000003', 'Negocio inactivo', false);

insert into public.business_members (id, business_id, user_id, role, active)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'employee', true),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'employee', true),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'employee', false),
  ('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'manager', true);

insert into public.customer_cards (id, customer_id, loyalty_program_id, current_stamps)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    4
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000101',
    7
  );

insert into public.stamp_sessions (
  id,
  customer_card_id,
  token_hash,
  short_code,
  expires_at,
  used_at
)
values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  '123456',
  now() + interval '10 minutes',
  now()
);

insert into public.stamp_transactions (
  id,
  customer_card_id,
  business_id,
  employee_id,
  stamp_session_id,
  quantity,
  transaction_type,
  status
)
values (
  '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  1,
  'stamp',
  'confirmed'
);

select results_eq(
  $$select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('profiles', 'businesses', 'business_members', 'loyalty_programs', 'customer_cards', 'stamp_sessions', 'stamp_transactions') and relrowsecurity$$,
  array[7::bigint],
  'RLS está activa en las siete tablas públicas'
);
select results_eq(
  $$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stamp_transactions'$$,
  array[1::bigint],
  'Realtime publica únicamente el evento necesario para actualizar la tarjeta'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_stamp_session(uuid)', 'execute'),
  'anon no puede confirmar sellos'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_stamp_session(uuid)', 'execute'),
  'authenticated puede invocar la confirmación protegida'
);
select ok(
  not has_function_privilege('anon', 'public.ensure_own_customer_card()', 'execute'),
  'anon no puede inicializar tarjetas'
);
select ok(
  has_function_privilege('authenticated', 'public.ensure_own_customer_card()', 'execute'),
  'authenticated puede inicializar exclusivamente su propia tarjeta'
);
select results_eq('select count(*) from public.profiles', array[6::bigint], 'el trigger Auth crea un perfil por usuario');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq('select count(*) from public.profiles', array[1::bigint], 'el cliente ve sólo su perfil');
select results_eq('select count(*) from public.customer_cards', array[1::bigint], 'el cliente ve sólo su tarjeta');
select results_eq('select count(*) from public.loyalty_programs', array[1::bigint], 'el cliente ve sólo el programa asociado a su tarjeta');
select results_eq('select count(*) from public.stamp_transactions', array[1::bigint], 'el cliente ve sólo sus transacciones');
select results_eq('select count(*) from public.businesses', array[0::bigint], 'el cliente no accede al negocio');
select throws_ok(
  $$update public.customer_cards set current_stamps = 99$$,
  '42501',
  null,
  'el frontend no puede alterar los sellos'
);
select throws_ok(
  $$insert into public.stamp_transactions (customer_card_id, business_id, employee_id, quantity, transaction_type) values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'stamp')$$,
  '42501',
  null,
  'el frontend no puede insertar transacciones'
);
select throws_ok(
  $$select * from public.stamp_sessions$$,
  '42501',
  null,
  'las sesiones de sellado no se exponen directamente'
);
select results_eq(
  $$select count(*) from public.ensure_own_customer_card()$$,
  array[1::bigint],
  'la inicialización devuelve la tarjeta del usuario autenticado'
);
select results_eq(
  $$select count(distinct card.id) from public.ensure_own_customer_card() as ensured join public.customer_cards as card on card.id = ensured.id where card.customer_id = '10000000-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'repetir la inicialización no duplica la tarjeta del cliente'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';

select results_eq('select count(*) from public.business_members', array[1::bigint], 'el empleado ve sólo su pertenencia');
select results_eq('select count(*) from public.businesses', array[1::bigint], 'el empleado ve su negocio');
select results_eq('select count(*) from public.loyalty_programs', array[1::bigint], 'el empleado ve los programas de su negocio');
select results_eq('select count(*) from public.stamp_transactions', array[1::bigint], 'el empleado ve las transacciones de su negocio');
select results_eq('select count(*) from public.profiles', array[0::bigint], 'el empleado no puede consultar perfiles ajenos');
select results_eq('select count(*) from public.customer_cards', array[0::bigint], 'el empleado no consulta tarjetas directamente');
select throws_ok(
  $$update public.customer_cards set current_stamps = current_stamps + 1$$,
  '42501',
  null,
  'el empleado no puede modificar saldos'
);
select throws_ok(
  $$insert into public.stamp_transactions (customer_card_id, business_id, employee_id, quantity, transaction_type) values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'stamp')$$,
  '42501',
  null,
  'el empleado no puede insertar transacciones directamente'
);
select throws_ok(
  $$update public.stamp_sessions set used_at = now()$$,
  '42501',
  null,
  'el empleado no puede marcar sesiones como usadas'
);

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select results_eq('select count(*) from public.business_members', array[1::bigint], 'un empleado externo sólo ve su propia pertenencia');
select results_eq($$select count(*) from public.business_members where business_id = '00000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'otro negocio no ve pertenencias de Spirit');
select results_eq($$select count(*) from public.businesses where id = '00000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'otro negocio no ve Cafetería Spirit');
select results_eq($$select count(*) from public.stamp_transactions where business_id = '00000000-0000-4000-8000-000000000001'$$, array[0::bigint], 'otro negocio no ve transacciones de Spirit');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';

select results_eq('select count(*) from public.business_members', array[1::bigint], 'el empleado inactivo ve su propia pertenencia');
select results_eq('select count(*) from public.businesses', array[0::bigint], 'la pertenencia inactiva no abre acceso al negocio');

reset role;
set local role anon;

select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'anon no tiene acceso a perfiles privados'
);

select * from finish();
rollback;

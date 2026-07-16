begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'customer-one@spirit.test'),
  ('10000000-0000-4000-8000-000000000002', 'customer-two@spirit.test'),
  ('20000000-0000-4000-8000-000000000001', 'employee@spirit.test'),
  ('20000000-0000-4000-8000-000000000002', 'outsider@spirit.test');

insert into public.profiles (id, display_name) values
  ('10000000-0000-4000-8000-000000000001', 'Cliente Uno'),
  ('10000000-0000-4000-8000-000000000002', 'Cliente Dos'),
  ('20000000-0000-4000-8000-000000000001', 'Empleado Spirit'),
  ('20000000-0000-4000-8000-000000000002', 'Empleado Externo');

insert into public.business_members (id, business_id, user_id, role, active)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'employee',
  true
);

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

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq('select count(*) from public.profiles', array[1::bigint], 'el cliente ve sólo su perfil');
select results_eq('select count(*) from public.customer_cards', array[1::bigint], 'el cliente ve sólo su tarjeta');
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

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';

select results_eq('select count(*) from public.business_members', array[1::bigint], 'el empleado ve sólo su pertenencia');
select results_eq('select count(*) from public.businesses', array[1::bigint], 'el empleado ve su negocio');
select results_eq('select count(*) from public.loyalty_programs', array[1::bigint], 'el empleado ve los programas de su negocio');
select results_eq('select count(*) from public.stamp_transactions', array[1::bigint], 'el empleado ve las transacciones de su negocio');
select results_eq('select count(*) from public.profiles', array[0::bigint], 'el empleado no puede consultar perfiles ajenos');
select results_eq('select count(*) from public.customer_cards', array[0::bigint], 'el empleado no consulta tarjetas directamente');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';

select results_eq('select count(*) from public.business_members', array[0::bigint], 'un empleado externo no ve pertenencias de Spirit');
select results_eq('select count(*) from public.businesses', array[0::bigint], 'un empleado externo no ve Cafetería Spirit');
select results_eq('select count(*) from public.stamp_transactions', array[0::bigint], 'un empleado externo no ve transacciones de Spirit');

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

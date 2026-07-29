begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'delete-customer@spirit.test'),
  ('81000000-0000-4000-8000-000000000002', 'preserved-customer@spirit.test'),
  ('82000000-0000-4000-8000-000000000001', 'delete-employee@spirit.test');

insert into public.businesses (id, name, active)
values ('83000000-0000-4000-8000-000000000001', 'Spirit Delete Test', true);

insert into public.loyalty_programs (
  id, business_id, name, description, stamps_required, reward_description, active
) values (
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'Tarjeta Delete Test',
  'Prueba aislada de eliminación',
  10,
  'Café gratuito',
  true
);

insert into public.business_members (id, business_id, user_id, role, active)
values (
  '85000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'employee',
  true
);

insert into public.customer_cards (
  id, customer_id, loyalty_program_id, current_stamps
) values
  (
    '86000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    3
  ),
  (
    '86000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '84000000-0000-4000-8000-000000000001',
    2
  );

insert into public.stamp_sessions (
  id, customer_card_id, business_id, session_type, token_hash,
  short_code, expires_at, used_at
) values
  (
    '87000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'stamp',
    repeat('8', 64),
    '810001',
    now() + interval '90 seconds',
    now()
  ),
  (
    '87000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000001',
    'stamp',
    repeat('9', 64),
    '810002',
    now() + interval '90 seconds',
    now()
  );

insert into public.stamp_transactions (
  id, customer_card_id, business_id, employee_id, stamp_session_id,
  quantity, transaction_type, status
) values
  (
    '88000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000001',
    1,
    'stamp',
    'completed'
  ),
  (
    '88000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000002',
    1,
    'stamp',
    'completed'
  );

delete from auth.users where id = '81000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.profiles where id = '81000000-0000-4000-8000-000000000001'),
  0::bigint,
  'el perfil se elimina en cascada'
);
select is(
  (select count(*) from public.customer_cards where customer_id = '81000000-0000-4000-8000-000000000001'),
  0::bigint,
  'la tarjeta se elimina en cascada'
);
select is(
  (select count(*) from public.stamp_sessions where id = '87000000-0000-4000-8000-000000000001'),
  0::bigint,
  'la sesión de la tarjeta se elimina en cascada'
);
select is(
  (select count(*) from public.stamp_transactions where id = '88000000-0000-4000-8000-000000000001'),
  0::bigint,
  'el historial privado del cliente se elimina en cascada'
);

delete from auth.users where id = '82000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.business_members where user_id = '82000000-0000-4000-8000-000000000001'),
  0::bigint,
  'la membresía de empleado se elimina'
);
select is(
  (select count(*) from public.stamp_transactions where id = '88000000-0000-4000-8000-000000000002'),
  1::bigint,
  'la transacción de otro cliente conserva su auditoría'
);
select is(
  (select employee_id from public.stamp_transactions where id = '88000000-0000-4000-8000-000000000002'),
  null::uuid,
  'la atribución del empleado eliminado queda anonimizada'
);
select is(
  (select count(*) from auth.users where id in (
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001'
  )),
  0::bigint,
  'los usuarios objetivo ya no existen en Auth'
);

select * from finish();
rollback;

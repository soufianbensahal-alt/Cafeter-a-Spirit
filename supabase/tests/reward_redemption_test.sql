begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('71000000-0000-4000-8000-000000000001', 'reward-customer@spirit.test'),
  ('71000000-0000-4000-8000-000000000002', 'reward-empty@spirit.test'),
  ('72000000-0000-4000-8000-000000000001', 'reward-employee-one@spirit.test'),
  ('72000000-0000-4000-8000-000000000002', 'reward-employee-two@spirit.test'),
  ('72000000-0000-4000-8000-000000000003', 'reward-outsider@spirit.test'),
  ('72000000-0000-4000-8000-000000000004', 'reward-other-business@spirit.test');

update public.profiles
set display_name = case id
  when '71000000-0000-4000-8000-000000000001' then 'Cliente Premio'
  when '71000000-0000-4000-8000-000000000002' then 'Cliente Sin Premio'
  when '72000000-0000-4000-8000-000000000001' then 'Empleado Uno'
  when '72000000-0000-4000-8000-000000000002' then 'Empleado Dos'
  else display_name
end;

insert into public.businesses (id, name, active) values
  ('73000000-0000-4000-8000-000000000001', 'Spirit Reward Test', true),
  ('73000000-0000-4000-8000-000000000002', 'Otro Reward Test', true);

insert into public.loyalty_programs (
  id, business_id, name, description, stamps_required, reward_description, active
) values
  (
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'Tarjeta Café Spirit Test',
    'Prueba aislada de canjes',
    10,
    'Café gratuito',
    true
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'Tarjeta Otro Negocio',
    'Prueba aislada de negocio cruzado',
    10,
    'Café gratuito',
    true
  );

insert into public.business_members (id, business_id, user_id, role, active) values
  ('75000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'employee', true),
  ('75000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', 'manager', true),
  ('75000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000004', 'employee', true);

insert into public.customer_cards (
  id, customer_id, loyalty_program_id, current_stamps, available_rewards
) values
  ('76000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', 9, 0),
  ('76000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000001', 2, 0),
  ('76000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000002', 0, 1);

insert into public.stamp_sessions (
  id, customer_card_id, business_id, session_type, token_hash, short_code, expires_at
) values (
  '77000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'stamp',
  repeat('1', 64),
  '710001',
  clock_timestamp() + interval '5 minutes'
);

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select status || '|' || current_stamps || '|' || available_rewards || '|' || reward_earned from public.confirm_stamp_session('77000000-0000-4000-8000-000000000001')$$,
  array['confirmed|0|1|1'::text],
  'el décimo sello reinicia el ciclo y crea exactamente una recompensa'
);
select results_eq(
  $$select count(*) from public.stamp_transactions where stamp_session_id = '77000000-0000-4000-8000-000000000001' and transaction_type = 'stamp' and (metadata ->> 'reward_earned')::integer = 1$$,
  array[1::bigint],
  'el décimo sello deja una sola transacción auditable'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.create_reward_redemption_request('76000000-0000-4000-8000-000000000002')$$,
  'P0001',
  'no_rewards_available',
  'un cliente sin recompensas no puede crear una sesión de canje'
);

create temp table reward_request_test as
select * from public.create_reward_redemption_request('76000000-0000-4000-8000-000000000003') with no data;
truncate reward_request_test;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
insert into reward_request_test
select * from public.create_reward_redemption_request('76000000-0000-4000-8000-000000000001');

select results_eq(
  $$select available_rewards from public.customer_cards where id = '76000000-0000-4000-8000-000000000001'$$,
  array[1],
  'crear la sesión no descuenta la recompensa'
);
select results_eq(
  $$select count(*) from public.stamp_sessions where customer_card_id = '76000000-0000-4000-8000-000000000001' and session_type = 'reward_redemption' and used_at is null$$,
  array[1::bigint],
  'la sesión creada representa un único canje activo'
);
select ok(
  (select token ~ '^[0-9a-f]{64}$' and short_code ~ '^[0-9]{6}$' and expires_at <= clock_timestamp() + interval '90 seconds' from reward_request_test limit 1),
  'la sesión usa token de 256 bits, código de seis dígitos y caducidad breve'
);

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select session_type || '|' || available_rewards from public.validate_loyalty_code('73000000-0000-4000-8000-000000000001', (select short_code from reward_request_test limit 1))$$,
  array['reward_redemption|1'::text],
  'el código manual detecta el tipo sin consumir el premio'
);
select results_eq(
  $$select session_type || '|' || available_rewards from public.validate_loyalty_qr('73000000-0000-4000-8000-000000000001', 'SPIRIT:REWARD:V1:' || (select token from reward_request_test limit 1))$$,
  array['reward_redemption|1'::text],
  'el QR versionado detecta el tipo sin consumir el premio'
);

create temp table reward_confirmation_test as
select * from public.redeem_reward_session(
  (select id from public.stamp_sessions where token_hash = encode(extensions.digest((select token from reward_request_test limit 1), 'sha256'), 'hex'))
) with no data;
insert into reward_confirmation_test
select * from public.redeem_reward_session(
  (select id from public.stamp_sessions where token_hash = encode(extensions.digest((select token from reward_request_test limit 1), 'sha256'), 'hex'))
);

select results_eq(
  $$select status || '|' || available_rewards from reward_confirmation_test$$,
  array['confirmed|0'::text],
  'la confirmación válida descuenta exactamente una recompensa'
);
select results_eq(
  $$select count(*) from public.stamp_transactions where customer_card_id = '76000000-0000-4000-8000-000000000001' and employee_id = '72000000-0000-4000-8000-000000000001' and transaction_type = 'redemption' and quantity = 1 and status = 'completed'$$,
  array[1::bigint],
  'el historial registra cliente, empleado, cantidad, tipo y estado correctos'
);
select results_eq(
  $$select status from public.redeem_reward_session((select id from public.stamp_sessions where token_hash = encode(extensions.digest((select token from reward_request_test limit 1), 'sha256'), 'hex')))$$,
  array['already_processed'::text],
  'un doble clic es idempotente y no vuelve a descontar'
);

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select status || '|' || (select count(*) from public.stamp_transactions where customer_card_id = '76000000-0000-4000-8000-000000000001' and transaction_type = 'redemption') from public.redeem_reward_session((select id from public.stamp_sessions where token_hash = encode(extensions.digest((select token from reward_request_test limit 1), 'sha256'), 'hex')))$$,
  array['already_processed|1'::text],
  'un segundo empleado obtiene el resultado idempotente y existe un solo canje'
);

insert into public.stamp_sessions (
  id, customer_card_id, business_id, session_type, token_hash, short_code, expires_at, used_at, created_at
) values
  ('77000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'reward_redemption', repeat('2', 64), '710002', clock_timestamp() - interval '1 minute', null, clock_timestamp() - interval '2 minutes'),
  ('77000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'reward_redemption', repeat('3', 64), '710003', clock_timestamp() + interval '5 minutes', clock_timestamp(), clock_timestamp() - interval '1 second'),
  ('77000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000002', 'reward_redemption', repeat('4', 64), '710004', clock_timestamp() + interval '5 minutes', null, clock_timestamp()),
  ('77000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000002', 'reward_redemption', repeat('5', 64), '710005', clock_timestamp() + interval '5 minutes', null, clock_timestamp());

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select status from public.redeem_reward_session('77000000-0000-4000-8000-000000000002')$$,
  array['expired'::text],
  'una sesión caducada falla'
);
select results_eq(
  $$select status from public.redeem_reward_session('77000000-0000-4000-8000-000000000003')$$,
  array['used'::text],
  'una sesión utilizada sin transacción no puede reutilizarse'
);
select results_eq(
  $$select status from public.redeem_reward_session('77000000-0000-4000-8000-000000000004')$$,
  array['not_authorized'::text],
  'un empleado de otro negocio no puede confirmar el canje'
);
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000003', true);
select results_eq(
  $$select status from public.redeem_reward_session('77000000-0000-4000-8000-000000000005')$$,
  array['not_authorized'::text],
  'un usuario sin membresía no puede confirmar el canje'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.customer_cards set available_rewards = 99 where id = '76000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'el cliente no puede modificar available_rewards directamente'
);
select throws_ok(
  $$insert into public.stamp_transactions (customer_card_id, business_id, employee_id, quantity, transaction_type, status) values ('76000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 1, 'redemption', 'completed')$$,
  '42501',
  null,
  'el frontend no puede insertar un canje directamente'
);
select results_eq(
  $$select count(*) from public.stamp_transactions where customer_card_id = '76000000-0000-4000-8000-000000000001' and transaction_type = 'redemption'$$,
  array[1::bigint],
  'Realtime y RLS exponen el canje únicamente al cliente propietario'
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select count(*) from public.stamp_transactions where customer_card_id = '76000000-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'otro cliente no recibe el evento ni el historial del canje'
);
reset role;

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select (select status from public.validate_loyalty_code('73000000-0000-4000-8000-000000000001', (select short_code from reward_request_test limit 1))) || '|' || (select status from public.validate_loyalty_qr('73000000-0000-4000-8000-000000000001', 'SPIRIT:REWARD:V1:' || (select token from reward_request_test limit 1)))$$,
  array['used|used'::text],
  'QR y código quedan inutilizados después del canje'
);

select ok(
  not has_function_privilege('anon', 'public.redeem_reward_session(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.redeem_reward_session(uuid)', 'execute'),
  'la RPC no es ejecutable por anon y mantiene permisos mínimos'
);

select * from finish();
rollback;

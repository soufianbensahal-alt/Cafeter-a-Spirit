begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000001', 'reward-email-customer@spirit.test'),
  ('82000000-0000-4000-8000-000000000001', 'reward-email-employee@spirit.test');

update public.profiles
set display_name = case id
  when '81000000-0000-4000-8000-000000000001' then 'Cliente Email'
  when '82000000-0000-4000-8000-000000000001' then 'Empleado Email'
  else display_name
end;

insert into public.businesses (id, name, active)
values ('83000000-0000-4000-8000-000000000001', 'Spirit Email Test', true);

insert into public.loyalty_programs (
  id, business_id, name, description, stamps_required, reward_description, active
) values (
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'Tarjeta Email Test',
  'Prueba aislada del outbox de recompensas',
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
  id, customer_id, loyalty_program_id, current_stamps, available_rewards
) values (
  '86000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  9,
  0
);

insert into public.stamp_sessions (
  id, customer_card_id, business_id, session_type, token_hash, short_code, expires_at
) values (
  '87000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'stamp',
  repeat('8', 64),
  '810001',
  clock_timestamp() + interval '5 minutes'
);

select is(
  (select count(*) from public.reward_notifications),
  0::bigint,
  'crear una tarjeta sin recompensas no encola emails'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '82000000-0000-4000-8000-000000000001',
  'aal', 'aal2',
  'session_id', '82100000-0000-4000-8000-000000000001'
)::text, true);
select results_eq(
  $$select status || '|' || reward_earned from public.confirm_stamp_session('87000000-0000-4000-8000-000000000001')$$,
  array['confirmed|1'::text],
  'el décimo sello confirma una recompensa'
);
select results_eq(
  $$select current_stamps || '|' || available_rewards || '|' || total_rewards_earned from public.customer_cards where id = '86000000-0000-4000-8000-000000000001'$$,
  array['0|1|1'::text],
  'el saldo y la secuencia histórica avanzan juntos'
);
select results_eq(
  $$select status || '|' || reward_sequence || '|' || reward_description from public.reward_notifications where customer_card_id = '86000000-0000-4000-8000-000000000001'$$,
  array['pending|1|Café gratuito'::text],
  'la confirmación crea un único trabajo pendiente con snapshot del premio'
);

select results_eq(
  $$select status from public.confirm_stamp_session('87000000-0000-4000-8000-000000000001')$$,
  array['already_processed'::text],
  'repetir la confirmación conserva la idempotencia original'
);
select is(
  (select count(*) from public.reward_notifications),
  1::bigint,
  'repetir la confirmación no duplica el email'
);

update public.customer_cards
set current_stamps = 1
where id = '86000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.reward_notifications),
  1::bigint,
  'un cambio no relacionado no crea notificaciones'
);

update public.customer_cards
set available_rewards = 0
where id = '86000000-0000-4000-8000-000000000001';
select is(
  (select total_rewards_earned from public.customer_cards where id = '86000000-0000-4000-8000-000000000001'),
  1::bigint,
  'canjear una recompensa no reduce la secuencia histórica'
);
select is(
  (select count(*) from public.reward_notifications),
  1::bigint,
  'reducir el saldo no crea un email'
);

update public.customer_cards
set available_rewards = 2
where id = '86000000-0000-4000-8000-000000000001';
select results_eq(
  $$select available_rewards || '|' || total_rewards_earned from public.customer_cards where id = '86000000-0000-4000-8000-000000000001'$$,
  array['2|3'::text],
  'un incremento de dos genera dos secuencias nuevas'
);
select results_eq(
  $$select reward_sequence from public.reward_notifications order by reward_sequence$$,
  array[1::bigint, 2::bigint, 3::bigint],
  'cada unidad del incremento tiene una secuencia única'
);
select throws_ok(
  $$insert into public.reward_notifications (customer_id, customer_card_id, reward_sequence, reward_description) values ('81000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', 1, 'Café gratuito')$$,
  '23505',
  null,
  'la restricción impide duplicar tarjeta y secuencia'
);

reset role;
select results_eq(
  $$select reward_sequence || '|' || claim_attempt from public.claim_reward_email_notification((select id from public.reward_notifications where reward_sequence = 1), 5)$$,
  array['1|1'::text],
  'el worker reclama atómicamente el primer trabajo'
);
select is(
  (select count(*) from public.claim_reward_email_notification(
    (select id from public.reward_notifications where reward_sequence = 1),
    5
  )),
  0::bigint,
  'un segundo worker no reclama el mismo trabajo activo'
);
select is(
  public.complete_reward_email_notification(
    (select id from public.reward_notifications where reward_sequence = 1),
    2::smallint,
    'wrong-attempt'
  ),
  false,
  'un intento obsoleto no puede completar el trabajo'
);
select is(
  public.complete_reward_email_notification(
    (select id from public.reward_notifications where reward_sequence = 1),
    1::smallint,
    'resend-message-1'
  ),
  true,
  'el intento vigente marca el trabajo como enviado'
);
select is(
  public.complete_reward_email_notification(
    (select id from public.reward_notifications where reward_sequence = 1),
    1::smallint,
    'resend-message-duplicate'
  ),
  false,
  'un trabajo enviado no puede completarse de nuevo'
);

select results_eq(
  $$select reward_sequence || '|' || claim_attempt from public.claim_reward_email_notification((select id from public.reward_notifications where reward_sequence = 2), 5)$$,
  array['2|1'::text],
  'el siguiente trabajo puede reclamarse sin esperar al anterior'
);
select is(
  public.fail_reward_email_notification(
    (select id from public.reward_notifications where reward_sequence = 2),
    1::smallint,
    E'error\ncontrolado'
  ),
  true,
  'un error libera el trabajo para reintento'
);
select results_eq(
  $$select status || '|' || attempts || '|' || last_error from public.reward_notifications where reward_sequence = 2$$,
  array['failed|1|error controlado'::text],
  'el fallo se registra sin caracteres de control'
);
select results_eq(
  $$select reward_sequence || '|' || claim_attempt from public.claim_reward_email_notification((select id from public.reward_notifications where reward_sequence = 2), 5)$$,
  array['2|2'::text],
  'el reintento incrementa su número sin duplicar el trabajo'
);

select ok(
  not has_table_privilege('anon', 'public.reward_notifications', 'select')
    and not has_table_privilege('authenticated', 'public.reward_notifications', 'select')
    and not has_table_privilege('authenticated', 'public.reward_notifications', 'insert')
    and not has_table_privilege('authenticated', 'public.reward_notifications', 'update'),
  'anon y authenticated no pueden leer ni escribir el outbox'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_reward_email_notification(uuid,integer)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.claim_reward_email_notification(uuid,integer)',
      'execute'
    ),
  'la RPC de claim es exclusivamente interna'
);

select * from finish();
rollback;

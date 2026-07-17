drop function public.validate_stamp_code(uuid, text);
drop function public.validate_stamp_qr(uuid, text);

create function public.validate_stamp_code(p_business_id uuid, p_code text)
returns table(
  status text,
  customer_masked text,
  program_name text,
  current_progress integer,
  next_progress integer,
  goal integer,
  reward_description text,
  stamp_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_attempt_id bigint;
  v_attempt_count integer;
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  select count(*) into v_attempt_count
  from private.stamp_validation_attempts attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'code'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 10 then
    return query select 'rate_limited'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'code', false)
  returning id into v_attempt_id;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return query select 'invalid_code'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  select session.id, session.expires_at, session.used_at, profile.display_name,
    program.name, card.current_stamps, program.stamps_required, program.reward_description
  into v_session
  from public.stamp_sessions session
  join public.customer_cards card on card.id = session.customer_card_id
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  left join public.profiles profile on profile.id = card.customer_id
  where session.business_id = p_business_id and session.short_code = p_code
  order by (session.used_at is null and session.expires_at > clock_timestamp()) desc, session.created_at desc
  limit 1;

  if v_session.id is null then
    return query select 'invalid_code'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  elsif v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  elsif v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  else
    update private.stamp_validation_attempts set success = true where id = v_attempt_id;
    return query select 'ok'::text, private.mask_customer_name(v_session.display_name), v_session.name::text,
      v_session.current_stamps::integer, (v_session.current_stamps + 1)::integer,
      v_session.stamps_required::integer, v_session.reward_description::text, v_session.id::uuid;
  end if;
end;
$$;

revoke all on function public.validate_stamp_code(uuid, text) from public, anon;
grant execute on function public.validate_stamp_code(uuid, text) to authenticated;

create function public.validate_stamp_qr(p_business_id uuid, p_qr text)
returns table(
  status text,
  customer_masked text,
  program_name text,
  current_progress integer,
  next_progress integer,
  goal integer,
  reward_description text,
  stamp_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_token_hash text;
  v_session record;
  v_attempt_id bigint;
  v_attempt_count integer;
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  select count(*) into v_attempt_count
  from private.stamp_validation_attempts attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'qr'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 30 then
    return query select 'rate_limited'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'qr', false)
  returning id into v_attempt_id;

  if p_qr is null or p_qr !~ '^SPIRIT:STAMP:' then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  elsif p_qr !~ '^SPIRIT:STAMP:V1:' then
    return query select 'invalid_version'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  elsif p_qr !~ '^SPIRIT:STAMP:V1:[0-9a-f]{64}$' then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  v_token := pg_catalog.substring(p_qr, 17);
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select session.id, session.business_id, session.expires_at, session.used_at, profile.display_name,
    program.name, card.current_stamps, program.stamps_required, program.reward_description
  into v_session
  from public.stamp_sessions session
  join public.customer_cards card on card.id = session.customer_card_id
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  left join public.profiles profile on profile.id = card.customer_id
  where session.token_hash = v_token_hash
  limit 1;

  if v_session.id is null then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  elsif v_session.business_id <> p_business_id then
    return query select 'wrong_business'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  elsif v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  elsif v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text, null::uuid;
  else
    update private.stamp_validation_attempts set success = true where id = v_attempt_id;
    return query select 'ok'::text, private.mask_customer_name(v_session.display_name), v_session.name::text,
      v_session.current_stamps::integer, (v_session.current_stamps + 1)::integer,
      v_session.stamps_required::integer, v_session.reward_description::text, v_session.id::uuid;
  end if;
end;
$$;

revoke all on function public.validate_stamp_qr(uuid, text) from public, anon;
grant execute on function public.validate_stamp_qr(uuid, text) to authenticated;

create function public.confirm_stamp_session(p_stamp_session_id uuid)
returns table(
  status text,
  transaction_id uuid,
  current_stamps integer,
  available_rewards integer,
  reward_earned integer,
  stamps_required integer,
  reward_description text,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_card record;
  v_existing record;
  v_transaction_id uuid;
  v_confirmed_at timestamptz := clock_timestamp();
  v_total integer;
  v_new_stamps integer;
  v_new_rewards integer;
  v_reward_earned integer;
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  select session.id, session.customer_card_id, session.business_id, session.expires_at, session.used_at
  into v_session
  from public.stamp_sessions session
  where session.id = p_stamp_session_id
  for update;

  if v_session.id is null then
    return query select 'not_found'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  if not private.is_active_business_member(v_user_id, v_session.business_id) then
    return query select 'not_authorized'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  select tx.id, tx.created_at,
    nullif(tx.metadata ->> 'current_stamps', '')::integer as current_stamps,
    nullif(tx.metadata ->> 'available_rewards', '')::integer as available_rewards,
    nullif(tx.metadata ->> 'reward_earned', '')::integer as reward_earned,
    nullif(tx.metadata ->> 'stamps_required', '')::integer as stamps_required,
    tx.metadata ->> 'reward_description' as reward_description
  into v_existing
  from public.stamp_transactions tx
  where tx.stamp_session_id = v_session.id
  limit 1;

  if v_existing.id is not null then
    return query select 'already_processed'::text, v_existing.id::uuid, v_existing.current_stamps,
      v_existing.available_rewards, v_existing.reward_earned, v_existing.stamps_required,
      v_existing.reward_description, v_existing.created_at::timestamptz;
    return;
  end if;

  if v_session.used_at is not null then
    return query select 'used'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  if v_session.expires_at <= v_confirmed_at then
    return query select 'expired'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  select card.id, card.current_stamps, card.available_rewards, program.id as program_id,
    program.stamps_required, program.reward_description, program.business_id
  into v_card
  from public.customer_cards card
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  join public.businesses business on business.id = program.business_id
  where card.id = v_session.customer_card_id
    and program.active
    and business.active
    and program.business_id = v_session.business_id
  for update of card;

  if v_card.id is null then
    return query select 'inactive_program'::text, null::uuid, null::integer, null::integer, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  v_total := v_card.current_stamps + 1;
  v_reward_earned := v_total / v_card.stamps_required;
  v_new_stamps := v_total % v_card.stamps_required;
  v_new_rewards := v_card.available_rewards + v_reward_earned;

  update public.stamp_sessions set used_at = v_confirmed_at where id = v_session.id;

  update public.customer_cards
  set current_stamps = v_new_stamps,
      available_rewards = v_new_rewards
  where id = v_card.id;

  insert into public.stamp_transactions (
    customer_card_id, business_id, employee_id, stamp_session_id,
    quantity, transaction_type, status, metadata
  ) values (
    v_card.id, v_session.business_id, v_user_id, v_session.id,
    1, 'stamp', 'confirmed',
    pg_catalog.jsonb_build_object(
      'current_stamps', v_new_stamps,
      'available_rewards', v_new_rewards,
      'reward_earned', v_reward_earned,
      'stamps_required', v_card.stamps_required,
      'reward_description', v_card.reward_description
    )
  ) returning id into v_transaction_id;

  return query select 'confirmed'::text, v_transaction_id, v_new_stamps, v_new_rewards,
    v_reward_earned, v_card.stamps_required::integer, v_card.reward_description::text, v_confirmed_at;
end;
$$;

revoke all on function public.confirm_stamp_session(uuid) from public, anon;
grant execute on function public.confirm_stamp_session(uuid) to authenticated;

create function public.get_business_stamp_history(p_business_id uuid, p_limit integer default 10)
returns table(
  transaction_id uuid,
  occurred_at timestamptz,
  customer_masked text,
  result text,
  current_stamps integer,
  stamps_required integer,
  reward_earned integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return;
  end if;

  return query
  select tx.id, tx.created_at, private.mask_customer_name(profile.display_name),
    case when coalesce((tx.metadata ->> 'reward_earned')::integer, 0) > 0
      then 'Sello añadido · Recompensa conseguida'
      else 'Sello añadido'
    end,
    nullif(tx.metadata ->> 'current_stamps', '')::integer,
    nullif(tx.metadata ->> 'stamps_required', '')::integer,
    coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0)
  from public.stamp_transactions tx
  join public.customer_cards card on card.id = tx.customer_card_id
  left join public.profiles profile on profile.id = card.customer_id
  where tx.business_id = p_business_id
    and tx.transaction_type = 'stamp'
    and tx.status = 'confirmed'
  order by tx.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_business_stamp_history(uuid, integer) from public, anon;
grant execute on function public.get_business_stamp_history(uuid, integer) to authenticated;

comment on function public.confirm_stamp_session(uuid) is
  'Confirma una sesión de sello con bloqueos de fila, autorización derivada de auth.uid e idempotencia por stamp_session_id.';

comment on function public.get_business_stamp_history(uuid, integer) is
  'Devuelve el historial mínimo de sellos de un negocio únicamente a sus miembros activos.';

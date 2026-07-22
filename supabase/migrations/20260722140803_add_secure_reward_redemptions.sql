alter table public.stamp_sessions
  add column session_type text not null default 'stamp';

alter table public.stamp_sessions
  add constraint stamp_sessions_session_type_check
  check (session_type in ('stamp', 'reward_redemption'));

create index stamp_sessions_card_type_created_idx
  on public.stamp_sessions (customer_card_id, session_type, created_at desc)
  where used_at is null;

alter table public.stamp_transactions
  drop constraint stamp_transactions_status_check;

alter table public.stamp_transactions
  add constraint stamp_transactions_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'reversed'));

create function private.create_loyalty_session(
  p_customer_card_id uuid,
  p_business_id uuid,
  p_session_type text
)
returns table(token text, short_code text, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
  v_token_hash text;
  v_code text;
  v_expires_at timestamptz := clock_timestamp() + interval '90 seconds';
  v_random bytea;
  v_random_value bigint;
  v_collision boolean;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if p_session_type not in ('stamp', 'reward_redemption') then
    raise exception using errcode = 'P0001', message = 'invalid_session_type';
  end if;

  if (
    select count(*)
    from public.stamp_sessions as session
    join public.customer_cards as card on card.id = session.customer_card_id
    where card.customer_id = v_user_id
      and session.created_at > clock_timestamp() - interval '5 minutes'
  ) >= 6 then
    raise exception using errcode = 'P0001', message = 'creation_rate_limited';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 0));

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 24 then
      raise exception using errcode = 'P0001', message = 'code_generation_failed';
    end if;

    loop
      v_random := extensions.gen_random_bytes(4);
      v_random_value :=
        pg_catalog.get_byte(v_random, 0)::bigint * 16777216
        + pg_catalog.get_byte(v_random, 1)::bigint * 65536
        + pg_catalog.get_byte(v_random, 2)::bigint * 256
        + pg_catalog.get_byte(v_random, 3)::bigint;
      exit when v_random_value < 4294000000;
    end loop;

    v_code := pg_catalog.lpad((v_random_value % 1000000)::text, 6, '0');
    select exists (
      select 1
      from public.stamp_sessions as session
      where session.business_id = p_business_id
        and session.short_code = v_code
        and session.used_at is null
        and session.expires_at > clock_timestamp()
    ) into v_collision;
    exit when not v_collision;
  end loop;

  update public.stamp_sessions as session
  set used_at = clock_timestamp()
  where session.customer_card_id = p_customer_card_id
    and session.session_type = p_session_type
    and session.used_at is null
    and session.expires_at > clock_timestamp();

  insert into public.stamp_sessions (
    customer_card_id,
    business_id,
    session_type,
    token_hash,
    short_code,
    expires_at
  ) values (
    p_customer_card_id,
    p_business_id,
    p_session_type,
    v_token_hash,
    v_code,
    v_expires_at
  );

  return query select v_token, v_code, v_expires_at;
end;
$$;

revoke all on function private.create_loyalty_session(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.create_stamp_request(p_customer_card_id uuid)
returns table(token text, short_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  select program.business_id
  into v_business_id
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = program.business_id
  where card.id = p_customer_card_id
    and card.customer_id = v_user_id
    and program.active
    and business.active;

  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'customer_card_not_available';
  end if;

  return query
  select session.token, session.short_code, session.expires_at
  from private.create_loyalty_session(p_customer_card_id, v_business_id, 'stamp') as session;
end;
$$;

revoke all on function public.create_stamp_request(uuid) from public, anon;
grant execute on function public.create_stamp_request(uuid) to authenticated;

create function public.create_reward_redemption_request(p_customer_card_id uuid)
returns table(
  token text,
  short_code text,
  expires_at timestamptz,
  reward_description text,
  available_rewards integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_card record;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  select
    card.id,
    card.available_rewards,
    program.business_id,
    program.reward_description
  into v_card
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = program.business_id
  where card.id = p_customer_card_id
    and card.customer_id = v_user_id
    and program.active
    and business.active;

  if v_card.id is null then
    raise exception using errcode = 'P0001', message = 'customer_card_not_available';
  end if;

  if v_card.available_rewards < 1 then
    raise exception using errcode = 'P0001', message = 'no_rewards_available';
  end if;

  return query
  select
    session.token,
    session.short_code,
    session.expires_at,
    v_card.reward_description::text,
    v_card.available_rewards::integer
  from private.create_loyalty_session(
    p_customer_card_id,
    v_card.business_id,
    'reward_redemption'
  ) as session;
end;
$$;

revoke all on function public.create_reward_redemption_request(uuid) from public, anon;
grant execute on function public.create_reward_redemption_request(uuid) to authenticated;

create function public.validate_loyalty_code(p_business_id uuid, p_code text)
returns table(
  status text,
  session_type text,
  customer_masked text,
  program_name text,
  current_progress integer,
  next_progress integer,
  goal integer,
  reward_description text,
  available_rewards integer,
  stamp_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
  v_attempt_id bigint;
  v_attempt_count integer;
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  select count(*) into v_attempt_count
  from private.stamp_validation_attempts as attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'code'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 10 then
    return query select 'rate_limited'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'code', false)
  returning id into v_attempt_id;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return query select 'invalid_code'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  select
    session.id,
    session.session_type,
    session.expires_at,
    session.used_at,
    profile.display_name,
    program.name,
    card.current_stamps,
    card.available_rewards,
    program.stamps_required,
    program.reward_description
  into v_session
  from public.stamp_sessions as session
  join public.customer_cards as card on card.id = session.customer_card_id
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  left join public.profiles as profile on profile.id = card.customer_id
  where session.business_id = p_business_id
    and session.short_code = p_code
  order by
    (session.used_at is null and session.expires_at > clock_timestamp()) desc,
    session.created_at desc
  limit 1;

  if v_session.id is null then
    return query select 'invalid_code'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.session_type = 'reward_redemption' and v_session.available_rewards < 1 then
    return query select 'no_rewards_available'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  update private.stamp_validation_attempts
  set success = true
  where id = v_attempt_id;

  return query select
    'ok'::text,
    v_session.session_type::text,
    private.mask_customer_name(v_session.display_name),
    v_session.name::text,
    v_session.current_stamps::integer,
    case
      when v_session.session_type = 'stamp' then v_session.current_stamps + 1
      else v_session.current_stamps
    end::integer,
    v_session.stamps_required::integer,
    v_session.reward_description::text,
    v_session.available_rewards::integer,
    v_session.id::uuid;
end;
$$;

revoke all on function public.validate_loyalty_code(uuid, text) from public, anon;
grant execute on function public.validate_loyalty_code(uuid, text) to authenticated;

create function public.validate_loyalty_qr(p_business_id uuid, p_qr text)
returns table(
  status text,
  session_type text,
  customer_masked text,
  program_name text,
  current_progress integer,
  next_progress integer,
  goal integer,
  reward_description text,
  available_rewards integer,
  stamp_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_expected_type text;
  v_token text;
  v_token_hash text;
  v_session record;
  v_attempt_id bigint;
  v_attempt_count integer;
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  select count(*) into v_attempt_count
  from private.stamp_validation_attempts as attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'qr'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 30 then
    return query select 'rate_limited'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'qr', false)
  returning id into v_attempt_id;

  if p_qr ~ '^SPIRIT:STAMP:V1:[0-9a-f]{64}$' then
    v_expected_type := 'stamp';
    v_token := pg_catalog.substring(p_qr, 17);
  elsif p_qr ~ '^SPIRIT:REWARD:V1:[0-9a-f]{64}$' then
    v_expected_type := 'reward_redemption';
    v_token := pg_catalog.substring(p_qr, 18);
  elsif p_qr ~ '^SPIRIT:(STAMP|REWARD):' then
    return query select 'invalid_version'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  else
    return query select 'invalid_qr'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select
    session.id,
    session.session_type,
    session.business_id,
    session.expires_at,
    session.used_at,
    profile.display_name,
    program.name,
    card.current_stamps,
    card.available_rewards,
    program.stamps_required,
    program.reward_description
  into v_session
  from public.stamp_sessions as session
  join public.customer_cards as card on card.id = session.customer_card_id
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  left join public.profiles as profile on profile.id = card.customer_id
  where session.token_hash = v_token_hash
  limit 1;

  if v_session.id is null or v_session.session_type <> v_expected_type then
    return query select 'invalid_qr'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.business_id <> p_business_id then
    return query select 'wrong_business'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  elsif v_session.session_type = 'reward_redemption' and v_session.available_rewards < 1 then
    return query select 'no_rewards_available'::text, null::text, null::text, null::text,
      null::integer, null::integer, null::integer, null::text, null::integer, null::uuid;
    return;
  end if;

  update private.stamp_validation_attempts
  set success = true
  where id = v_attempt_id;

  return query select
    'ok'::text,
    v_session.session_type::text,
    private.mask_customer_name(v_session.display_name),
    v_session.name::text,
    v_session.current_stamps::integer,
    case
      when v_session.session_type = 'stamp' then v_session.current_stamps + 1
      else v_session.current_stamps
    end::integer,
    v_session.stamps_required::integer,
    v_session.reward_description::text,
    v_session.available_rewards::integer,
    v_session.id::uuid;
end;
$$;

revoke all on function public.validate_loyalty_qr(uuid, text) from public, anon;
grant execute on function public.validate_loyalty_qr(uuid, text) to authenticated;

create function public.redeem_reward_session(p_stamp_session_id uuid)
returns table(
  status text,
  transaction_id uuid,
  current_stamps integer,
  available_rewards integer,
  reward_description text,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
  v_card record;
  v_existing record;
  v_transaction_id uuid;
  v_confirmed_at timestamptz := clock_timestamp();
  v_new_rewards integer;
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  select
    session.id,
    session.customer_card_id,
    session.business_id,
    session.session_type,
    session.expires_at,
    session.used_at
  into v_session
  from public.stamp_sessions as session
  where session.id = p_stamp_session_id
  for update;

  if v_session.id is null then
    return query select 'not_found'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  if v_session.session_type <> 'reward_redemption' then
    return query select 'invalid_session_type'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  if not private.is_active_business_member(v_user_id, v_session.business_id) then
    return query select 'not_authorized'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  select
    tx.id,
    tx.created_at,
    nullif(tx.metadata ->> 'current_stamps', '')::integer as current_stamps,
    nullif(tx.metadata ->> 'available_rewards', '')::integer as available_rewards,
    tx.metadata ->> 'reward_description' as reward_description
  into v_existing
  from public.stamp_transactions as tx
  where tx.stamp_session_id = v_session.id
    and tx.transaction_type = 'redemption'
  limit 1;

  if v_existing.id is not null then
    return query select
      'already_processed'::text,
      v_existing.id::uuid,
      v_existing.current_stamps,
      v_existing.available_rewards,
      v_existing.reward_description,
      v_existing.created_at::timestamptz;
    return;
  end if;

  if v_session.used_at is not null then
    return query select 'used'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  if v_session.expires_at <= v_confirmed_at then
    return query select 'expired'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  select
    card.id,
    card.current_stamps,
    card.available_rewards,
    program.stamps_required,
    program.reward_description,
    program.business_id
  into v_card
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = program.business_id
  where card.id = v_session.customer_card_id
    and program.active
    and business.active
    and program.business_id = v_session.business_id
  for update of card;

  if v_card.id is null then
    return query select 'inactive_program'::text, null::uuid, null::integer,
      null::integer, null::text, null::timestamptz;
    return;
  end if;

  if v_card.available_rewards < 1 then
    return query select 'no_rewards_available'::text, null::uuid, v_card.current_stamps,
      v_card.available_rewards, v_card.reward_description::text, null::timestamptz;
    return;
  end if;

  v_new_rewards := v_card.available_rewards - 1;

  update public.stamp_sessions
  set used_at = v_confirmed_at
  where id = v_session.id;

  update public.customer_cards
  set available_rewards = v_new_rewards
  where id = v_card.id;

  insert into public.stamp_transactions (
    customer_card_id,
    business_id,
    employee_id,
    stamp_session_id,
    quantity,
    transaction_type,
    status,
    metadata
  ) values (
    v_card.id,
    v_session.business_id,
    v_user_id,
    v_session.id,
    1,
    'redemption',
    'completed',
    pg_catalog.jsonb_build_object(
      'current_stamps', v_card.current_stamps,
      'available_rewards', v_new_rewards,
      'reward_redeemed', 1,
      'stamps_required', v_card.stamps_required,
      'reward_description', v_card.reward_description
    )
  ) returning id into v_transaction_id;

  return query select
    'confirmed'::text,
    v_transaction_id,
    v_card.current_stamps::integer,
    v_new_rewards,
    v_card.reward_description::text,
    v_confirmed_at;
end;
$$;

revoke all on function public.redeem_reward_session(uuid) from public, anon;
grant execute on function public.redeem_reward_session(uuid) to authenticated;

create function private.enforce_loyalty_transaction_session_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_type text;
begin
  if new.transaction_type not in ('stamp', 'redemption') then
    return new;
  end if;

  if new.stamp_session_id is null then
    raise exception using errcode = '23514', message = 'loyalty_transaction_requires_session';
  end if;

  select session.session_type
  into v_session_type
  from public.stamp_sessions as session
  where session.id = new.stamp_session_id;

  if v_session_type is null
    or (new.transaction_type = 'stamp' and v_session_type <> 'stamp')
    or (new.transaction_type = 'redemption' and v_session_type <> 'reward_redemption')
  then
    raise exception using errcode = '23514', message = 'loyalty_transaction_session_type_mismatch';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_loyalty_transaction_session_type()
  from public, anon, authenticated;

create trigger stamp_transactions_enforce_session_type
before insert or update of transaction_type, stamp_session_id
on public.stamp_transactions
for each row execute function private.enforce_loyalty_transaction_session_type();

drop function public.get_business_stamp_history_filtered(
  uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text
);

create function public.get_business_stamp_history_filtered(
  p_business_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_customer text default null,
  p_employee text default null,
  p_type text default null
)
returns table (
  transaction_id uuid,
  occurred_at timestamptz,
  customer_masked text,
  program_name text,
  transaction_type text,
  transaction_status text,
  result text,
  current_stamps integer,
  stamps_required integer,
  reward_earned integer,
  available_rewards integer,
  reward_description text,
  employee_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return;
  end if;

  return query
  select
    tx.id,
    tx.created_at,
    private.mask_customer_name(customer_profile.display_name),
    program.name,
    tx.transaction_type,
    tx.status,
    case
      when tx.transaction_type = 'redemption' and tx.status = 'completed'
        then 'Café gratuito canjeado'
      when tx.status not in ('confirmed', 'completed') then 'No confirmado'
      when coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0) > 0
        then 'Sello añadido · Recompensa conseguida'
      when tx.transaction_type = 'stamp' then 'Sello añadido'
      else 'Movimiento registrado'
    end,
    nullif(tx.metadata ->> 'current_stamps', '')::integer,
    coalesce(nullif(tx.metadata ->> 'stamps_required', '')::integer, program.stamps_required),
    coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0),
    nullif(tx.metadata ->> 'available_rewards', '')::integer,
    coalesce(tx.metadata ->> 'reward_description', program.reward_description),
    coalesce(employee_profile.display_name, 'Equipo Spirit')
  from public.stamp_transactions as tx
  join public.customer_cards as card on card.id = tx.customer_card_id
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  left join public.profiles as customer_profile on customer_profile.id = card.customer_id
  left join public.profiles as employee_profile on employee_profile.id = tx.employee_id
  where tx.business_id = p_business_id
    and (p_before is null or tx.created_at < p_before)
    and (p_from is null or tx.created_at >= p_from)
    and (p_to is null or tx.created_at < p_to)
    and (nullif(pg_catalog.btrim(p_customer), '') is null
      or coalesce(customer_profile.display_name, '') ilike '%' || pg_catalog.btrim(p_customer) || '%')
    and (nullif(pg_catalog.btrim(p_employee), '') is null
      or coalesce(employee_profile.display_name, '') ilike '%' || pg_catalog.btrim(p_employee) || '%')
    and (nullif(pg_catalog.btrim(p_type), '') is null
      or tx.transaction_type = pg_catalog.btrim(p_type))
  order by tx.created_at desc, tx.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_business_stamp_history_filtered(
  uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text
) from public, anon;
grant execute on function public.get_business_stamp_history_filtered(
  uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text
) to authenticated;

comment on column public.stamp_sessions.session_type is
  'Distingue solicitudes de sello y canjes de recompensa sin almacenar datos personales.';

comment on function public.create_reward_redemption_request(uuid) is
  'Crea para auth.uid una sesión efímera de canje sin descontar la recompensa.';

comment on function public.validate_loyalty_code(uuid, text) is
  'Valida códigos de sello o recompensa para miembros activos, con rate limiting y sin consumir saldo.';

comment on function public.validate_loyalty_qr(uuid, text) is
  'Valida QR versionados SPIRIT:STAMP:V1 y SPIRIT:REWARD:V1 sin consumir saldo.';

comment on function public.redeem_reward_session(uuid) is
  'Canje atómico e idempotente: bloquea sesión y tarjeta, descuenta una recompensa e inserta la auditoría.';

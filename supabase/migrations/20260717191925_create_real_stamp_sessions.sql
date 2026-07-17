alter table public.stamp_sessions
  add column business_id uuid references public.businesses (id) on delete restrict;

update public.stamp_sessions session
set business_id = program.business_id
from public.customer_cards card
join public.loyalty_programs program on program.id = card.loyalty_program_id
where card.id = session.customer_card_id
  and session.business_id is null;

alter table public.stamp_sessions
  alter column business_id set not null;

create index stamp_sessions_business_code_idx
  on public.stamp_sessions (business_id, short_code, created_at desc);

create table private.stamp_validation_attempts (
  id bigint generated always as identity primary key,
  employee_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  method text not null check (method in ('code', 'qr')),
  success boolean not null default false,
  attempted_at timestamptz not null default clock_timestamp()
);

create index stamp_validation_attempts_rate_idx
  on private.stamp_validation_attempts (employee_id, business_id, method, attempted_at desc);

alter table private.stamp_validation_attempts enable row level security;
revoke all on table private.stamp_validation_attempts from public, anon, authenticated;
revoke all on sequence private.stamp_validation_attempts_id_seq from public, anon, authenticated;

create function private.is_active_business_member(p_user_id uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members membership
    join public.businesses business on business.id = membership.business_id
    where membership.user_id = p_user_id
      and membership.business_id = p_business_id
      and membership.role in ('owner', 'manager', 'employee')
      and membership.active
      and business.active
  );
$$;

revoke all on function private.is_active_business_member(uuid, uuid) from public, anon, authenticated;

create function private.mask_customer_name(p_display_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(pg_catalog.btrim(p_display_name), '') is null then 'Cliente Spirit'
    else 'Cliente ' || pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(p_display_name), 1)) || '••••'
  end;
$$;

revoke all on function private.mask_customer_name(text) from public, anon, authenticated;

create function public.create_stamp_request(p_customer_card_id uuid)
returns table(token text, short_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_token text;
  v_token_hash text;
  v_code text;
  v_expires_at timestamptz := clock_timestamp() + interval '60 seconds';
  v_random bytea;
  v_random_value bigint;
  v_collision boolean;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  select program.business_id
  into v_business_id
  from public.customer_cards card
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  join public.businesses business on business.id = program.business_id
  where card.id = p_customer_card_id
    and card.customer_id = v_user_id
    and program.active
    and business.active;

  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'customer_card_not_available';
  end if;

  if (
    select count(*)
    from public.stamp_sessions session
    join public.customer_cards card on card.id = session.customer_card_id
    where card.customer_id = v_user_id
      and session.created_at > clock_timestamp() - interval '5 minutes'
  ) >= 6 then
    raise exception using errcode = 'P0001', message = 'creation_rate_limited';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_business_id::text, 0));

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
      from public.stamp_sessions session
      where session.business_id = v_business_id
        and session.short_code = v_code
        and session.used_at is null
        and session.expires_at > clock_timestamp()
    ) into v_collision;
    exit when not v_collision;
  end loop;

  update public.stamp_sessions session
  set used_at = clock_timestamp()
  from public.customer_cards card
  where session.customer_card_id = card.id
    and card.customer_id = v_user_id
    and session.used_at is null
    and session.expires_at > clock_timestamp();

  insert into public.stamp_sessions (
    customer_card_id,
    business_id,
    token_hash,
    short_code,
    expires_at
  ) values (
    p_customer_card_id,
    v_business_id,
    v_token_hash,
    v_code,
    v_expires_at
  );

  return query select v_token, v_code, v_expires_at;
end;
$$;

revoke all on function public.create_stamp_request(uuid) from public, anon;
grant execute on function public.create_stamp_request(uuid) to authenticated;

create function public.validate_stamp_code(p_business_id uuid, p_code text)
returns table(
  status text,
  customer_masked text,
  program_name text,
  current_progress integer,
  next_progress integer,
  goal integer,
  reward_description text
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
    return query select 'not_authorized'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  select count(*)
  into v_attempt_count
  from private.stamp_validation_attempts attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'code'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 10 then
    return query select 'rate_limited'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'code', false)
  returning id into v_attempt_id;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return query select 'invalid_code'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  select
    session.id,
    session.expires_at,
    session.used_at,
    profile.display_name,
    program.name,
    card.current_stamps,
    program.stamps_required,
    program.reward_description
  into v_session
  from public.stamp_sessions session
  join public.customer_cards card on card.id = session.customer_card_id
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  left join public.profiles profile on profile.id = card.customer_id
  where session.business_id = p_business_id
    and session.short_code = p_code
  order by
    (session.used_at is null and session.expires_at > clock_timestamp()) desc,
    session.created_at desc
  limit 1;

  if v_session.id is null then
    return query select 'invalid_code'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  update private.stamp_validation_attempts
  set success = true
  where id = v_attempt_id;

  return query select
    'ok'::text,
    private.mask_customer_name(v_session.display_name),
    v_session.name::text,
    v_session.current_stamps::integer,
    (v_session.current_stamps + 1)::integer,
    v_session.stamps_required::integer,
    v_session.reward_description::text;
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
  reward_description text
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
    return query select 'not_authorized'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  select count(*)
  into v_attempt_count
  from private.stamp_validation_attempts attempt
  where attempt.employee_id = v_user_id
    and attempt.business_id = p_business_id
    and attempt.method = 'qr'
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_attempt_count >= 30 then
    return query select 'rate_limited'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
  values (v_user_id, p_business_id, 'qr', false)
  returning id into v_attempt_id;

  if p_qr is null or p_qr !~ '^SPIRIT:STAMP:' then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if p_qr !~ '^SPIRIT:STAMP:V1:' then
    return query select 'invalid_version'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if p_qr !~ '^SPIRIT:STAMP:V1:[0-9a-f]{64}$' then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  v_token := pg_catalog.substring(p_qr, 17);
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select
    session.id,
    session.business_id,
    session.expires_at,
    session.used_at,
    profile.display_name,
    program.name,
    card.current_stamps,
    program.stamps_required,
    program.reward_description
  into v_session
  from public.stamp_sessions session
  join public.customer_cards card on card.id = session.customer_card_id
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  left join public.profiles profile on profile.id = card.customer_id
  where session.token_hash = v_token_hash
  limit 1;

  if v_session.id is null then
    return query select 'invalid_qr'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if v_session.business_id <> p_business_id then
    return query select 'wrong_business'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if v_session.used_at is not null then
    return query select 'used'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  if v_session.expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::text, null::text, null::integer, null::integer, null::integer, null::text;
    return;
  end if;

  update private.stamp_validation_attempts set success = true where id = v_attempt_id;

  return query select
    'ok'::text,
    private.mask_customer_name(v_session.display_name),
    v_session.name::text,
    v_session.current_stamps::integer,
    (v_session.current_stamps + 1)::integer,
    v_session.stamps_required::integer,
    v_session.reward_description::text;
end;
$$;

revoke all on function public.validate_stamp_qr(uuid, text) from public, anon;
grant execute on function public.validate_stamp_qr(uuid, text) to authenticated;

comment on function public.create_stamp_request(uuid) is
  'Crea una solicitud efímera de sello para una tarjeta del usuario autenticado. El token sin hash solo se devuelve en esta respuesta.';

comment on function public.validate_stamp_code(uuid, text) is
  'Valida un código temporal para un miembro activo del mismo negocio sin modificar sellos ni consumir la sesión.';

comment on function public.validate_stamp_qr(uuid, text) is
  'Valida un QR SPIRIT:STAMP:V1 para un miembro activo del mismo negocio sin modificar sellos ni consumir la sesión.';

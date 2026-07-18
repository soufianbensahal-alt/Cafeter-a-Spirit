create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := pg_catalog.left(
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
      'Cliente Spirit'
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

comment on function private.handle_new_auth_user() is
  'Crea el perfil de presentación para altas por email, Google o Apple. Los metadatos sólo se usan como nombre visible y nunca para autorización.';

create or replace function public.ensure_own_customer_card()
returns table (
  id uuid,
  current_stamps integer,
  available_rewards integer,
  updated_at timestamptz,
  program_name text,
  stamps_required integer,
  reward_description text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
begin
  if v_customer_id is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  return query
  select
    card.id,
    card.current_stamps,
    card.available_rewards,
    card.updated_at,
    program.name,
    program.stamps_required,
    program.reward_description
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = program.business_id
  where card.customer_id = v_customer_id
    and program.active
    and business.active
    and pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
    and pg_catalog.lower(pg_catalog.btrim(program.name)) = pg_catalog.lower(pg_catalog.btrim('Tarjeta Café Spirit'))
  order by card.created_at
  limit 1;
end;
$$;

revoke all on function public.ensure_own_customer_card() from public, anon;
grant execute on function public.ensure_own_customer_card() to authenticated;

comment on function public.ensure_own_customer_card() is
  'Lectura compatible de la membresía cliente de auth.uid(). Nunca crea tarjetas ni acepta identificadores de terceros.';

create or replace function public.create_own_customer_membership()
returns table (
  id uuid,
  current_stamps integer,
  available_rewards integer,
  updated_at timestamptz,
  program_name text,
  stamps_required integer,
  reward_description text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
  v_program_id uuid;
begin
  if v_customer_id is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  select program.id
  into v_program_id
  from public.loyalty_programs as program
  join public.businesses as business on business.id = program.business_id
  where pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
    and business.active
    and pg_catalog.lower(pg_catalog.btrim(program.name)) = pg_catalog.lower(pg_catalog.btrim('Tarjeta Café Spirit'))
    and program.active
  limit 1;

  if v_program_id is null then
    raise exception using errcode = 'P0001', message = 'loyalty_program_unavailable';
  end if;

  insert into public.customer_cards (customer_id, loyalty_program_id)
  values (v_customer_id, v_program_id)
  on conflict (customer_id, loyalty_program_id) do nothing;

  return query
  select
    card.id,
    card.current_stamps,
    card.available_rewards,
    card.updated_at,
    program.name,
    program.stamps_required,
    program.reward_description
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  where card.customer_id = v_customer_id
    and card.loyalty_program_id = v_program_id;
end;
$$;

revoke all on function public.create_own_customer_membership() from public, anon;
grant execute on function public.create_own_customer_membership() to authenticated;

comment on function public.create_own_customer_membership() is
  'Crea de forma explícita e idempotente la membresía cliente de auth.uid() en Spirit; no permite indicar otro usuario.';

create or replace function private.mask_customer_name(p_display_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_clean text := pg_catalog.btrim(coalesce(p_display_name, ''));
begin
  if v_clean = '' then
    return 'Cliente Spirit';
  end if;

  v_parts := pg_catalog.regexp_split_to_array(v_clean, E'\\s+');
  if pg_catalog.array_length(v_parts, 1) > 1 then
    return v_parts[1] || ' ' || pg_catalog.upper(pg_catalog.left(v_parts[pg_catalog.array_length(v_parts, 1)], 1)) || '.';
  end if;
  return v_parts[1];
end;
$$;

revoke all on function private.mask_customer_name(text) from public, anon, authenticated;

create or replace function public.get_own_stamp_history(
  p_customer_card_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  transaction_id uuid,
  occurred_at timestamptz,
  program_name text,
  business_name text,
  transaction_type text,
  status text,
  quantity integer,
  current_stamps integer,
  stamps_required integer,
  reward_earned integer,
  available_rewards integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.customer_cards as card
    where card.id = p_customer_card_id
      and card.customer_id = v_user_id
  ) then
    return;
  end if;

  return query
  select
    tx.id,
    tx.created_at,
    program.name,
    business.name,
    tx.transaction_type,
    tx.status,
    tx.quantity,
    nullif(tx.metadata ->> 'current_stamps', '')::integer,
    coalesce(nullif(tx.metadata ->> 'stamps_required', '')::integer, program.stamps_required),
    coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0),
    nullif(tx.metadata ->> 'available_rewards', '')::integer
  from public.stamp_transactions as tx
  join public.customer_cards as card on card.id = tx.customer_card_id
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  join public.businesses as business on business.id = tx.business_id
  where tx.customer_card_id = p_customer_card_id
    and card.customer_id = v_user_id
    and (p_before is null or tx.created_at < p_before)
  order by tx.created_at desc, tx.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_own_stamp_history(uuid, integer, timestamptz) from public, anon;
grant execute on function public.get_own_stamp_history(uuid, integer, timestamptz) to authenticated;

create or replace function public.get_business_stamp_history_filtered(
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
  result text,
  current_stamps integer,
  stamps_required integer,
  reward_earned integer,
  employee_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 50);
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
    case
      when tx.status <> 'confirmed' then 'No confirmado'
      when coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0) > 0
        then 'Sello añadido · Recompensa conseguida'
      when tx.transaction_type = 'stamp' then 'Sello añadido'
      else 'Movimiento registrado'
    end,
    nullif(tx.metadata ->> 'current_stamps', '')::integer,
    coalesce(nullif(tx.metadata ->> 'stamps_required', '')::integer, program.stamps_required),
    coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0),
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

revoke all on function public.get_business_stamp_history_filtered(uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.get_business_stamp_history_filtered(uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text) to authenticated;

create index if not exists stamp_transactions_business_type_created_idx
  on public.stamp_transactions (business_id, transaction_type, created_at desc);

comment on function public.get_own_stamp_history(uuid, integer, timestamptz) is
  'Historial paginado visible sólo para el propietario de la tarjeta indicada.';

comment on function public.get_business_stamp_history_filtered(uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text) is
  'Historial paginado y filtrable visible sólo para miembros activos del negocio indicado.';

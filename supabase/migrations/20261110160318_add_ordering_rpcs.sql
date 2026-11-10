-- RPC de pedidos. Todas son SECURITY DEFINER porque las tablas no conceden
-- escritura a roles web; todas fijan search_path = '' y validan auth.uid().
-- La autorización del equipo procede exclusivamente de business_members
-- (private.is_active_business_member exige además sesión AAL2), nunca de
-- user_metadata.
--
-- Los errores esperables se devuelven como `status` en lugar de lanzarse, igual
-- que redeem_reward_session. Es imprescindible en create_order: un RAISE
-- desharía el registro del intento fallido y el límite de intentos no
-- funcionaría.

-- ---------------------------------------------------------------------------
-- Helpers privados.
-- ---------------------------------------------------------------------------
create function private.has_business_role(
  p_user_id uuid,
  p_business_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_business_member(p_user_id, p_business_id)
    and exists (
      select 1
      from public.business_members as membership
      where membership.user_id = p_user_id
        and membership.business_id = p_business_id
        and membership.active
        and membership.role = any (p_roles)
    );
$$;

revoke all on function private.has_business_role(uuid, uuid, text[])
  from public, anon, authenticated;

create function private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or pg_catalog.strpos(p_email, '@') < 2 then '***'
    else pg_catalog.left(p_email, 1) || '***' || pg_catalog.substr(p_email, pg_catalog.strpos(p_email, '@'))
  end;
$$;

revoke all on function private.mask_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cliente.
-- ---------------------------------------------------------------------------
create function public.get_ordering_status(p_business_id uuid)
returns table (ordering_enabled boolean, eligible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return query select false, false;
    return;
  end if;

  return query
  select
    settings.ordering_enabled,
    (
      not settings.pilot_only
      or exists (
        select 1 from public.ordering_pilot_members as pilot
        where pilot.business_id = settings.business_id
          and pilot.user_id = v_user_id
      )
    )
  from public.business_ordering_settings as settings
  join public.businesses as business on business.id = settings.business_id
  where settings.business_id = p_business_id
    and business.active;

  if not found then
    return query select false, false;
  end if;
end;
$$;

revoke all on function public.get_ordering_status(uuid) from public, anon;
grant execute on function public.get_ordering_status(uuid) to authenticated;

create function public.create_order(
  p_business_id uuid,
  p_order_code text,
  p_table_label text,
  p_items jsonb,
  p_note text default null
)
returns table (status text, order_id uuid, order_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_service_date date := (pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
  v_settings record;
  v_failed_attempts integer;
  v_table_label text := pg_catalog.btrim(coalesce(p_table_label, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_line_count integer;
  v_malformed integer;
  v_bad_quantity integer;
  v_product_ids text[];
  v_quantities integer[];
  v_available integer;
  v_active_orders integer;
  v_total integer;
  v_order_id uuid;
  v_number integer;
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::uuid, null::integer;
    return;
  end if;

  select settings.ordering_enabled, settings.pilot_only
  into v_settings
  from public.business_ordering_settings as settings
  join public.businesses as business on business.id = settings.business_id
  where settings.business_id = p_business_id
    and business.active;

  if not found then
    return query select 'ordering_unavailable'::text, null::uuid, null::integer;
    return;
  end if;

  if v_settings.pilot_only and not exists (
    select 1 from public.ordering_pilot_members as pilot
    where pilot.business_id = p_business_id and pilot.user_id = v_user_id
  ) then
    return query select 'not_in_pilot'::text, null::uuid, null::integer;
    return;
  end if;

  if not v_settings.ordering_enabled then
    return query select 'ordering_closed'::text, null::uuid, null::integer;
    return;
  end if;

  -- Límite de intentos fallidos: 5 por usuario y negocio cada 15 minutos.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('spirit-order-code:' || v_user_id::text || ':' || p_business_id::text, 0)
  );

  select count(*)
  into v_failed_attempts
  from private.order_code_attempts as attempt
  where attempt.user_id = v_user_id
    and attempt.business_id = p_business_id
    and not attempt.success
    and attempt.attempted_at > v_now - interval '15 minutes';

  if v_failed_attempts >= 5 then
    return query select 'code_rate_limited'::text, null::uuid, null::integer;
    return;
  end if;

  -- Código incorrecto y código caducado devuelven el mismo estado.
  if coalesce(p_order_code, '') !~ '^[0-9]{4}$' or not exists (
    select 1 from private.business_order_codes as order_code
    where order_code.business_id = p_business_id
      and order_code.code = p_order_code
      and order_code.expires_at > v_now
  ) then
    insert into private.order_code_attempts (user_id, business_id, success)
    values (v_user_id, p_business_id, false);
    return query select 'invalid_code'::text, null::uuid, null::integer;
    return;
  end if;

  if pg_catalog.char_length(v_table_label) not between 1 and 20 then
    return query select 'invalid_table_label'::text, null::uuid, null::integer;
    return;
  end if;

  if v_note is not null and pg_catalog.char_length(v_note) > 200 then
    return query select 'invalid_note'::text, null::uuid, null::integer;
    return;
  end if;

  -- Líneas: [{ "product_id": text, "quantity": 1..10 }]. Cualquier otro campo
  -- (por ejemplo un precio) se ignora: el total se calcula con public.products.
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    return query select 'invalid_items'::text, null::uuid, null::integer;
    return;
  end if;

  v_line_count := pg_catalog.jsonb_array_length(p_items);
  if v_line_count not between 1 and 20 then
    return query select 'invalid_items'::text, null::uuid, null::integer;
    return;
  end if;

  select
    count(*) filter (
      where pg_catalog.jsonb_typeof(item.elem) <> 'object'
        or pg_catalog.jsonb_typeof(item.elem -> 'product_id') is distinct from 'string'
        or pg_catalog.btrim(item.elem ->> 'product_id') = ''
        or pg_catalog.jsonb_typeof(item.elem -> 'quantity') is distinct from 'number'
    ),
    count(*) filter (
      where pg_catalog.jsonb_typeof(item.elem -> 'quantity') = 'number'
        and (item.elem ->> 'quantity') !~ '^(10|[1-9])$'
    )
  into v_malformed, v_bad_quantity
  from pg_catalog.jsonb_array_elements(p_items) as item(elem);

  if v_malformed > 0 then
    return query select 'invalid_items'::text, null::uuid, null::integer;
    return;
  end if;

  if v_bad_quantity > 0 then
    return query select 'invalid_quantity'::text, null::uuid, null::integer;
    return;
  end if;

  select
    pg_catalog.array_agg(item.elem ->> 'product_id' order by item.ord),
    pg_catalog.array_agg((item.elem ->> 'quantity')::integer order by item.ord)
  into v_product_ids, v_quantities
  from pg_catalog.jsonb_array_elements(p_items) with ordinality as item(elem, ord);

  if (select count(distinct product_id) from pg_catalog.unnest(v_product_ids) as product_id) <> v_line_count then
    return query select 'duplicate_product'::text, null::uuid, null::integer;
    return;
  end if;

  select count(*), sum(product.price_cents * line.quantity)
  into v_available, v_total
  from unnest(v_product_ids, v_quantities) as line(product_id, quantity)
  join public.products as product
    on product.business_id = p_business_id
   and product.id = line.product_id
   and product.in_catalog
   and product.is_available;

  if v_available <> v_line_count then
    return query select 'product_unavailable'::text, null::uuid, null::integer;
    return;
  end if;

  -- Máximo 2 pedidos activos por cliente y negocio; el bloqueo serializa
  -- pedidos simultáneos del mismo cliente.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('spirit-order-customer:' || v_user_id::text, 0)
  );

  select count(*)
  into v_active_orders
  from public.orders as existing
  where existing.customer_id = v_user_id
    and existing.business_id = p_business_id
    and existing.status in ('pending', 'accepted', 'preparing');

  if v_active_orders >= 2 then
    return query select 'active_order_limit'::text, null::uuid, null::integer;
    return;
  end if;

  insert into private.order_counters (business_id, service_date, last_number)
  values (p_business_id, v_service_date, 1)
  on conflict (business_id, service_date)
  do update set last_number = private.order_counters.last_number + 1
  returning last_number into v_number;

  insert into public.orders (
    business_id, customer_id, order_number, service_date,
    table_label, total_cents, note
  ) values (
    p_business_id, v_user_id, v_number, v_service_date,
    v_table_label, v_total, v_note
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, business_id, product_id, position, quantity,
    unit_price_cents, product_name, line_total_cents
  )
  select
    v_order_id, p_business_id, product.id, line.position::integer, line.quantity,
    product.price_cents, product.name_es, product.price_cents * line.quantity
  from unnest(v_product_ids, v_quantities) with ordinality as line(product_id, quantity, position)
  join public.products as product
    on product.business_id = p_business_id
   and product.id = line.product_id;

  return query select 'ok'::text, v_order_id, v_number;
end;
$$;

revoke all on function public.create_order(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.create_order(uuid, text, text, jsonb, text) to authenticated;

comment on function public.create_order(uuid, text, text, jsonb, text) is
  'Crea un pedido pay_at_venue. Valida piloto, apertura, código (5 fallos/15 min), disponibilidad y cantidades. El total se calcula en servidor.';

create function public.cancel_own_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select existing.status
  into v_status
  from public.orders as existing
  where existing.id = p_order_id
    and existing.customer_id = v_user_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status <> 'pending' then
    return 'invalid_transition';
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = pg_catalog.clock_timestamp()
  where id = p_order_id;

  return 'ok';
end;
$$;

revoke all on function public.cancel_own_order(uuid) from public, anon;
grant execute on function public.cancel_own_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipo (cualquier miembro activo con AAL2).
-- ---------------------------------------------------------------------------
create function public.update_order_status(
  p_order_id uuid,
  p_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order record;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  select existing.id, existing.business_id, existing.status
  into v_order
  from public.orders as existing
  where existing.id = p_order_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if not private.is_active_business_member(v_user_id, v_order.business_id) then
    return 'not_authorized';
  end if;

  if not (
    (v_order.status = 'pending' and p_status in ('accepted', 'rejected', 'cancelled'))
    or (v_order.status = 'accepted' and p_status in ('preparing', 'cancelled'))
    or (v_order.status = 'preparing' and p_status in ('served', 'cancelled'))
  ) then
    return 'invalid_transition';
  end if;

  if p_status = 'rejected' and (v_reason is null or pg_catalog.char_length(v_reason) > 200) then
    return 'reason_required';
  end if;

  update public.orders
  set status = p_status,
      handled_by = v_user_id,
      rejection_reason = case when p_status = 'rejected' then v_reason else rejection_reason end,
      accepted_at = case when p_status = 'accepted' then v_now else accepted_at end,
      preparing_at = case when p_status = 'preparing' then v_now else preparing_at end,
      served_at = case when p_status = 'served' then v_now else served_at end,
      rejected_at = case when p_status = 'rejected' then v_now else rejected_at end,
      cancelled_at = case when p_status = 'cancelled' then v_now else cancelled_at end
  where id = v_order.id;

  return 'ok';
end;
$$;

revoke all on function public.update_order_status(uuid, text, text) from public, anon;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;

create function public.set_product_availability(
  p_business_id uuid,
  p_product_id text,
  p_is_available boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not private.is_active_business_member(v_user_id, p_business_id) then
    return 'not_authorized';
  end if;

  if p_is_available is null then
    return 'invalid_value';
  end if;

  update public.products
  set is_available = p_is_available
  where business_id = p_business_id
    and id = p_product_id;

  if not found then
    return 'not_found';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.set_product_availability(uuid, text, boolean) from public, anon;
grant execute on function public.set_product_availability(uuid, text, boolean) to authenticated;

create function public.set_ordering_enabled(p_business_id uuid, p_enabled boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not private.is_active_business_member(v_user_id, p_business_id) then
    return 'not_authorized';
  end if;

  if p_enabled is null then
    return 'invalid_value';
  end if;

  insert into public.business_ordering_settings (business_id, ordering_enabled, updated_by)
  values (p_business_id, p_enabled, v_user_id)
  on conflict (business_id)
  do update set ordering_enabled = excluded.ordering_enabled,
                updated_by = excluded.updated_by;

  return 'ok';
end;
$$;

revoke all on function public.set_ordering_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_ordering_enabled(uuid, boolean) to authenticated;

create function public.regenerate_order_code(
  p_business_id uuid,
  p_valid_minutes integer default 720
)
returns table (status text, order_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous text;
  v_bytes bytea;
  v_code text;
  v_expires_at timestamptz;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::text, null::timestamptz;
    return;
  end if;

  if not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::timestamptz;
    return;
  end if;

  if p_valid_minutes is null or p_valid_minutes not between 5 and 1440 then
    return query select 'invalid_duration'::text, null::text, null::timestamptz;
    return;
  end if;

  select current_code.code
  into v_previous
  from private.business_order_codes as current_code
  where current_code.business_id = p_business_id
  for update;

  loop
    v_attempt := v_attempt + 1;
    v_bytes := extensions.gen_random_bytes(4);
    v_code := pg_catalog.lpad(
      (
        (pg_catalog.get_byte(v_bytes, 0)::bigint << 24
         | pg_catalog.get_byte(v_bytes, 1)::bigint << 16
         | pg_catalog.get_byte(v_bytes, 2)::bigint << 8
         | pg_catalog.get_byte(v_bytes, 3)::bigint) % 10000
      )::text,
      4,
      '0'
    );
    exit when v_previous is null or v_code <> v_previous or v_attempt >= 5;
  end loop;

  v_expires_at := pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => p_valid_minutes);

  insert into private.business_order_codes (business_id, code, expires_at, created_by, created_at)
  values (p_business_id, v_code, v_expires_at, v_user_id, pg_catalog.clock_timestamp())
  on conflict (business_id)
  do update set code = excluded.code,
                expires_at = excluded.expires_at,
                created_by = excluded.created_by,
                created_at = excluded.created_at;

  return query select 'ok'::text, v_code, v_expires_at;
end;
$$;

revoke all on function public.regenerate_order_code(uuid, integer) from public, anon;
grant execute on function public.regenerate_order_code(uuid, integer) to authenticated;

create function public.get_current_order_code(p_business_id uuid)
returns table (status text, order_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::text, null::timestamptz;
    return;
  end if;

  if not private.is_active_business_member(v_user_id, p_business_id) then
    return query select 'not_authorized'::text, null::text, null::timestamptz;
    return;
  end if;

  return query
  select 'ok'::text, current_code.code, current_code.expires_at
  from private.business_order_codes as current_code
  where current_code.business_id = p_business_id
    and current_code.expires_at > pg_catalog.clock_timestamp();

  if not found then
    return query select 'no_active_code'::text, null::text, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.get_current_order_code(uuid) from public, anon;
grant execute on function public.get_current_order_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Piloto (sólo owner / manager con AAL2).
-- ---------------------------------------------------------------------------
create function public.add_ordering_pilot_member(p_business_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target uuid;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager']) then
    return 'not_authorized';
  end if;

  select auth_user.id
  into v_target
  from auth.users as auth_user
  where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')))
  limit 1;

  if v_target is null then
    return 'user_not_found';
  end if;

  insert into public.ordering_pilot_members (business_id, user_id, added_by)
  values (p_business_id, v_target, v_user_id)
  on conflict (business_id, user_id) do nothing;

  if not found then
    return 'already_member';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.add_ordering_pilot_member(uuid, text) from public, anon;
grant execute on function public.add_ordering_pilot_member(uuid, text) to authenticated;

create function public.remove_ordering_pilot_member(p_business_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager']) then
    return 'not_authorized';
  end if;

  delete from public.ordering_pilot_members
  where business_id = p_business_id
    and user_id = p_user_id;

  if not found then
    return 'not_found';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.remove_ordering_pilot_member(uuid, uuid) from public, anon;
grant execute on function public.remove_ordering_pilot_member(uuid, uuid) to authenticated;

create function public.list_ordering_pilot_members(p_business_id uuid)
returns table (user_id uuid, customer_masked text, email_masked text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager'])
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return query
  select
    pilot.user_id,
    private.mask_customer_name(profile.display_name),
    private.mask_email(auth_user.email::text),
    pilot.created_at
  from public.ordering_pilot_members as pilot
  join auth.users as auth_user on auth_user.id = pilot.user_id
  left join public.profiles as profile on profile.id = pilot.user_id
  where pilot.business_id = p_business_id
  order by pilot.created_at;
end;
$$;

revoke all on function public.list_ordering_pilot_members(uuid) from public, anon;
grant execute on function public.list_ordering_pilot_members(uuid) to authenticated;

create function public.set_ordering_pilot_only(p_business_id uuid, p_pilot_only boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager']) then
    return 'not_authorized';
  end if;

  if p_pilot_only is null then
    return 'invalid_value';
  end if;

  insert into public.business_ordering_settings (business_id, pilot_only, updated_by)
  values (p_business_id, p_pilot_only, v_user_id)
  on conflict (business_id)
  do update set pilot_only = excluded.pilot_only,
                updated_by = excluded.updated_by;

  return 'ok';
end;
$$;

revoke all on function public.set_ordering_pilot_only(uuid, boolean) from public, anon;
grant execute on function public.set_ordering_pilot_only(uuid, boolean) to authenticated;

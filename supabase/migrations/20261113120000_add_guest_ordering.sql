-- Pedir sin cuenta: invitados con inicio de sesión anónimo de Supabase.
--
-- Un invitado es un usuario de auth.users con is_anonymous: reutiliza
-- create_order, la RLS de orders, Realtime de «Mis pedidos» y el límite de
-- pedidos activos. No tiene perfil ni fidelización. Al convertirse en cuenta
-- normal (email verificado) conserva la misma fila y, por tanto, sus pedidos.

-- ---------------------------------------------------------------------------
-- Datos.
-- ---------------------------------------------------------------------------
alter table public.business_ordering_settings
  add column guest_ordering_enabled boolean not null default false;

comment on column public.business_ordering_settings.guest_ordering_enabled is
  'true = los invitados (sesión anónima) pueden pedir con los pedidos abiertos y el código del día. Lo gestionan owner y manager.';

alter table public.orders
  add column guest_name text,
  add constraint orders_guest_name_check check (
    guest_name is null
    or (
      pg_catalog.char_length(guest_name) between 2 and 30
      and guest_name = pg_catalog.btrim(guest_name)
      and guest_name !~ '[[:cntrl:]]'
    )
  );

comment on column public.orders.guest_name is
  'Nombre que el invitado da al pedir. El panel lo muestra como «Nombre · Invitado». null en pedidos de clientes registrados.';

-- ---------------------------------------------------------------------------
-- create_order: nueva firma con p_guest_name.
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, text, text, jsonb, text);

CREATE FUNCTION public.create_order(p_business_id uuid, p_order_code text, p_table_label text, p_items jsonb, p_note text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text)
 RETURNS TABLE(status text, order_id uuid, order_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Invitado: sesión anónima de Supabase (is_anonymous en el JWT).
  v_is_guest boolean := coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true';
  v_guest_name text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_guest_name, '')), '\s+', ' ', 'g'), '');
begin
  if v_user_id is null then
    return query select 'not_authenticated'::text, null::uuid, null::integer;
    return;
  end if;

  select settings.ordering_enabled, settings.pilot_only, settings.guest_ordering_enabled
  into v_settings
  from public.business_ordering_settings as settings
  join public.businesses as business on business.id = settings.business_id
  where settings.business_id = p_business_id
    and business.active;

  if not found then
    return query select 'ordering_unavailable'::text, null::uuid, null::integer;
    return;
  end if;

  -- Los invitados sólo pueden pedir con «Pedidos sin cuenta» activo; el filtro
  -- de piloto se aplica sólo a los usuarios registrados.
  if v_is_guest and not v_settings.guest_ordering_enabled then
    return query select 'guest_ordering_disabled'::text, null::uuid, null::integer;
    return;
  end if;

  if not v_is_guest and v_settings.pilot_only and not exists (
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

  -- Nombre para el pedido: obligatorio para invitados (2–30 caracteres). Un
  -- usuario registrado no lo envía: su nombre sale del perfil.
  if v_is_guest then
    if v_guest_name is null
      or pg_catalog.char_length(v_guest_name) not between 2 and 30
      or v_guest_name ~ '[[:cntrl:]]'
    then
      return query select 'invalid_guest_name'::text, null::uuid, null::integer;
      return;
    end if;
  else
    v_guest_name := null;
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
    table_label, total_cents, note, guest_name
  ) values (
    p_business_id, v_user_id, v_number, v_service_date,
    v_table_label, v_total, v_note, v_guest_name
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
$function$;

revoke all on function public.create_order(uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.create_order(uuid, text, text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Contexto de pedidos: el invitado es elegible si «Pedidos sin cuenta» está
-- activo; el piloto sólo filtra a los registrados.
-- ---------------------------------------------------------------------------
create or replace function public.get_own_ordering_context()
returns table (business_id uuid, ordering_enabled boolean, eligible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_guest boolean := coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true';
begin
  if v_user_id is null then
    return;
  end if;

  return query
  select
    business.id,
    settings.ordering_enabled,
    case
      when v_is_guest then settings.guest_ordering_enabled
      else (
        not settings.pilot_only
        or exists (
          select 1 from public.ordering_pilot_members as pilot
          where pilot.business_id = business.id
            and pilot.user_id = v_user_id
        )
      )
    end
  from public.businesses as business
  join public.business_ordering_settings as settings on settings.business_id = business.id
  where business.active
    -- Un único local por ahora (ver 20261110190000_add_own_ordering_context).
    and pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
  limit 1;
end;
$$;

create or replace function public.get_ordering_status(p_business_id uuid)
returns table (ordering_enabled boolean, eligible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_guest boolean := coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true';
begin
  if v_user_id is null then
    return query select false, false;
    return;
  end if;

  return query
  select
    settings.ordering_enabled,
    case
      when v_is_guest then settings.guest_ordering_enabled
      else (
        not settings.pilot_only
        or exists (
          select 1 from public.ordering_pilot_members as pilot
          where pilot.business_id = settings.business_id
            and pilot.user_id = v_user_id
        )
      )
    end
  from public.business_ordering_settings as settings
  join public.businesses as business on business.id = settings.business_id
  where settings.business_id = p_business_id
    and business.active;

  if not found then
    return query select false, false;
  end if;
end;
$$;

-- Sin sesión: ¿se puede pedir sin cuenta ahora mismo? Sólo para mostrar el
-- botón «Pedir sin cuenta»; no expone nada más del local.
create function public.get_guest_ordering_status()
returns table (business_id uuid, available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select business.id, settings.ordering_enabled and settings.guest_ordering_enabled
  from public.businesses as business
  join public.business_ordering_settings as settings on settings.business_id = business.id
  where business.active
    and pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
  limit 1;
$$;

revoke all on function public.get_guest_ordering_status() from public;
grant execute on function public.get_guest_ordering_status() to anon, authenticated;

-- Interruptor del panel: sólo owner y manager (con AAL2).
create function public.set_guest_ordering_enabled(p_business_id uuid, p_enabled boolean)
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

  if p_enabled is null then
    return 'invalid_value';
  end if;

  insert into public.business_ordering_settings (business_id, guest_ordering_enabled, updated_by)
  values (p_business_id, p_enabled, v_user_id)
  on conflict (business_id)
  do update set guest_ordering_enabled = excluded.guest_ordering_enabled,
                updated_by = excluded.updated_by;

  return 'ok';
end;
$$;

revoke all on function public.set_guest_ordering_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_guest_ordering_enabled(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Panel: «Nombre · Invitado» en los pedidos de invitados.
-- ---------------------------------------------------------------------------
create or replace function public.list_business_orders(p_business_id uuid)
returns table (
  id uuid,
  order_number integer,
  service_date date,
  status text,
  table_label text,
  total_cents integer,
  note text,
  rejection_reason text,
  customer_masked text,
  items jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  served_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
  if v_user_id is null
    or not private.is_active_business_member(v_user_id, p_business_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.service_date,
    o.status,
    o.table_label,
    o.total_cents,
    o.note,
    o.rejection_reason,
    case
      when o.guest_name is not null then o.guest_name || ' · Invitado'
      else private.mask_customer_name(profile.display_name)
    end,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'product_id', item.product_id,
            'product_name', item.product_name,
            'quantity', item.quantity,
            'line_total_cents', item.line_total_cents
          )
          order by item.position
        )
        from public.order_items as item
        where item.order_id = o.id
      ),
      '[]'::jsonb
    ),
    o.created_at,
    o.updated_at,
    o.accepted_at,
    o.preparing_at,
    o.served_at,
    o.rejected_at,
    o.cancelled_at
  from public.orders as o
  left join public.profiles as profile on profile.id = o.customer_id
  where o.business_id = p_business_id
    and (
      o.service_date = v_today
      or o.status in ('pending', 'accepted', 'preparing')
    )
  order by o.created_at
  limit 500;
end;
$$;

create or replace function public.list_business_orders_by_date(p_business_id uuid, p_service_date date)
returns table (
  id uuid,
  order_number integer,
  service_date date,
  status text,
  table_label text,
  total_cents integer,
  note text,
  rejection_reason text,
  customer_masked text,
  items jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  served_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
  if v_user_id is null
    or not private.is_active_business_member(v_user_id, p_business_id)
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_service_date is null or p_service_date > v_today then
    raise exception using errcode = '22023', message = 'invalid_date';
  end if;

  if p_service_date < v_today - 30
    and not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager'])
  then
    raise exception using errcode = '42501', message = 'history_out_of_range';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.service_date,
    o.status,
    o.table_label,
    o.total_cents,
    o.note,
    o.rejection_reason,
    case
      when o.guest_name is not null then o.guest_name || ' · Invitado'
      else private.mask_customer_name(profile.display_name)
    end,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'product_id', item.product_id,
            'product_name', item.product_name,
            'quantity', item.quantity,
            'line_total_cents', item.line_total_cents
          )
          order by item.position
        )
        from public.order_items as item
        where item.order_id = o.id
      ),
      '[]'::jsonb
    ),
    o.created_at,
    o.updated_at,
    o.accepted_at,
    o.preparing_at,
    o.served_at,
    o.rejected_at,
    o.cancelled_at
  from public.orders as o
  left join public.profiles as profile on profile.id = o.customer_id
  where o.business_id = p_business_id
    and o.service_date = p_service_date
  order by o.created_at, o.order_number
  limit 1000;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sin fidelización para invitados: tarjeta, sellos, recompensas y avisos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_own_customer_card()
 RETURNS TABLE(id uuid, current_stamps integer, available_rewards integer, updated_at timestamp with time zone, program_name text, stamps_required integer, reward_description text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid := (select auth.uid());
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_own_customer_membership()
 RETURNS TABLE(id uuid, current_stamps integer, available_rewards integer, updated_at timestamp with time zone, program_name text, stamps_required integer, reward_description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid := (select auth.uid());
  v_program_id uuid;
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_stamp_request(p_customer_card_id uuid)
 RETURNS TABLE(token text, short_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_redemption_request(p_customer_card_id uuid)
 RETURNS TABLE(token text, short_code text, expires_at timestamp with time zone, reward_description text, available_rewards integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_card record;
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_own_stamp_history(p_customer_card_id uuid, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(transaction_id uuid, occurred_at timestamp with time zone, program_name text, business_name text, transaction_type text, status text, quantity integer, current_stamps integer, stamps_required integer, reward_earned integer, available_rewards integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.register_own_push_subscription(p_endpoint text, p_p256dh text, p_auth_key text, p_language text DEFAULT 'es'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requester_id uuid := (select auth.uid());
  subscription_id uuid;
begin
  -- Invitados (inicio de sesión anónimo): sin fidelización.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception using errcode = '42501', message = 'guest_not_allowed';
  end if;
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if char_length(coalesce(p_endpoint, '')) not between 20 and 4096
    or char_length(coalesce(p_p256dh, '')) not between 20 and 512
    or char_length(coalesce(p_auth_key, '')) not between 8 and 256
    or p_language not in ('es', 'ca')
  then
    raise exception 'Invalid push subscription'
      using errcode = '22023';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    language,
    enabled,
    last_notified_at,
    delivery_claimed_at
  )
  values (
    requester_id,
    p_endpoint,
    p_p256dh,
    p_auth_key,
    p_language,
    true,
    now(),
    null
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      language = excluded.language,
      enabled = true,
      last_notified_at = case
        when public.push_subscriptions.user_id is distinct from excluded.user_id
          or not public.push_subscriptions.enabled
        then now()
        else public.push_subscriptions.last_notified_at
      end,
      delivery_claimed_at = null,
      updated_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$function$;

-- Un invitado no tiene perfil: ni lo crea ni lo edita.
alter policy profiles_insert_own on public.profiles
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

alter policy profiles_update_own on public.profiles
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

-- ---------------------------------------------------------------------------
-- Perfil y consentimiento: no para anónimos; sí al convertirse en cuenta
-- normal (misma fila de auth.users, mismos pedidos).
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

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

create or replace function private.capture_signup_privacy_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'privacy_policy_version'), '');
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  if coalesce((new.raw_user_meta_data ->> 'privacy_consent')::boolean, false)
    and v_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    insert into public.privacy_consents (user_id, policy_version)
    values (new.id, v_version)
    on conflict (user_id, policy_version) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_converted
after update of is_anonymous on auth.users
for each row
when (old.is_anonymous and not new.is_anonymous)
execute function private.handle_new_auth_user();

create trigger on_auth_user_converted_capture_privacy_consent
after update of is_anonymous on auth.users
for each row
when (old.is_anonymous and not new.is_anonymous)
execute function private.capture_signup_privacy_consent();

-- ---------------------------------------------------------------------------
-- Limpieza: invitados cuya última actividad (último pedido o último inicio de
-- sesión, lo más reciente) tiene más de 30 días y sin pedidos activos. Sus
-- pedidos se conservan: orders.customer_id pasa a null (on delete set null) y
-- guest_name sigue identificándolos en el panel.
-- ---------------------------------------------------------------------------
create function private.purge_stale_guests(p_now timestamptz default pg_catalog.now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with stale as (
    select guest.id
    from auth.users as guest
    where guest.is_anonymous
      and greatest(
        coalesce(guest.last_sign_in_at, guest.created_at),
        coalesce((
          select pg_catalog.max(greatest(o.created_at, o.updated_at))
          from public.orders as o
          where o.customer_id = guest.id
        ), guest.created_at)
      ) < p_now - interval '30 days'
      and not exists (
        select 1 from public.orders as active
        where active.customer_id = guest.id
          and active.status in ('pending', 'accepted', 'preparing')
      )
  )
  delete from auth.users as guest
  using stale
  where guest.id = stale.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.purge_stale_guests(timestamptz) from public, anon, authenticated;

comment on function private.purge_stale_guests(timestamptz) is
  'Borra invitados (anónimos) con más de 30 días sin actividad y sin pedidos activos. Programada a diario con pg_cron.';

-- A diario a las 03:00 UTC (04:00 o 05:00 en Madrid).
select cron.schedule('purge-stale-guests', '0 3 * * *', 'select private.purge_stale_guests()');

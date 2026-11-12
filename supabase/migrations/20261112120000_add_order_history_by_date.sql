-- Historial de pedidos del panel: los pedidos de un día de servicio concreto
-- (Europe/Madrid), en solo lectura.
--
-- Misma autorización y mismas columnas que list_business_orders (cliente
-- enmascarado, líneas con nombre y total congelados, horas de cada estado):
--   * miembro activo de un negocio activo con sesión AAL2;
--   * owner y manager: cualquier día hasta hoy;
--   * resto de roles (employee): hoy y los 30 días anteriores.

create function public.list_business_orders_by_date(p_business_id uuid, p_service_date date)
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
    private.mask_customer_name(profile.display_name),
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

revoke all on function public.list_business_orders_by_date(uuid, date) from public, anon;
grant execute on function public.list_business_orders_by_date(uuid, date) to authenticated;

comment on function public.list_business_orders_by_date(uuid, date) is
  'Historial del panel: pedidos de un día de servicio (Madrid), con líneas y cliente enmascarado. Miembro activo con AAL2; employee sólo hoy y los 30 días anteriores; owner y manager sin límite.';

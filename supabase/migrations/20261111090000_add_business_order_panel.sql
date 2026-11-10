-- Panel de pedidos del equipo.
--
-- A) list_business_orders: el empleado necesita el nombre enmascarado del
--    cliente, pero la RLS de public.profiles sólo permite leer el perfil propio.
--    La función SECURITY DEFINER devuelve en una sola llamada los pedidos del
--    panel con sus líneas y el cliente enmascarado (mismo formato que el
--    historial de sellos). Nunca devuelve el correo ni el customer_id.
--
-- B) La rama de miembro del equipo en las políticas de lectura de orders y
--    order_items no exigía AAL2, a diferencia de todas las RPC del equipo.
--    Realtime aplica esta misma RLS a los eventos de Postgres Changes, así que
--    una sesión de empleado sin segundo factor podía recibir pedidos. La rama
--    del cliente (customer_id = auth.uid()) no cambia: los clientes operan en
--    AAL1.

-- ---------------------------------------------------------------------------
-- A) Listado del panel.
-- ---------------------------------------------------------------------------
create function public.list_business_orders(p_business_id uuid)
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

  -- Pedidos del día de servicio (Madrid) y, además, cualquier pedido activo de
  -- días anteriores para que nada quede sin atender tras la medianoche.
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
    and (
      o.service_date = v_today
      or o.status in ('pending', 'accepted', 'preparing')
    )
  order by o.created_at
  limit 500;
end;
$$;

revoke all on function public.list_business_orders(uuid) from public, anon;
grant execute on function public.list_business_orders(uuid) to authenticated;

comment on function public.list_business_orders(uuid) is
  'Pedidos del día (Madrid) y activos anteriores para el panel del equipo, con líneas y cliente enmascarado. Exige miembro activo con AAL2.';

-- ---------------------------------------------------------------------------
-- B) AAL2 para la lectura del equipo (consulta directa y Realtime).
-- ---------------------------------------------------------------------------
drop policy "orders_select_customer_or_member" on public.orders;

create policy "orders_select_customer_or_member"
on public.orders
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    customer_id = (select auth.uid())
    or (
      coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      and exists (
        select 1 from public.business_members as membership
        where membership.business_id = orders.business_id
          and membership.user_id = (select auth.uid())
          and membership.active
      )
    )
  )
);

drop policy "order_items_select_customer_or_member" on public.order_items;

create policy "order_items_select_customer_or_member"
on public.order_items
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.orders as parent
    where parent.id = order_items.order_id
      and (
        parent.customer_id = (select auth.uid())
        or (
          coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
          and exists (
            select 1 from public.business_members as membership
            where membership.business_id = parent.business_id
              and membership.user_id = (select auth.uid())
              and membership.active
          )
        )
      )
  )
);

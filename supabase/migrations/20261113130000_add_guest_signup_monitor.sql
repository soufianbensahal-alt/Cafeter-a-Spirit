-- Vigilancia de abuso de «Pedidos sin cuenta»: invitados (usuarios anónimos)
-- creados por día en Madrid durante los últimos 14 días, y cuántos de ellos
-- llegaron a pedir en el local. Sólo owner y manager con AAL2.
--
-- Cuenta los invitados que siguen existiendo y siguen siendo anónimos: los que
-- ya crearon su cuenta no aparecen (dejaron de ser invitados) y la limpieza de
-- 30 días no afecta a esta ventana de 14.

create function public.get_guest_signups_by_day(p_business_id uuid)
returns table (day date, guests integer, guests_with_orders integer)
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
    or not private.has_business_role(v_user_id, p_business_id, array['owner', 'manager'])
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return query
  with days as (
    select (v_today - offset_days)::date as day
    from pg_catalog.generate_series(0, 13) as offset_days
  ),
  guests as (
    select
      (guest.created_at at time zone 'Europe/Madrid')::date as day,
      exists (
        select 1 from public.orders as o
        where o.customer_id = guest.id
          and o.business_id = p_business_id
      ) as ordered
    from auth.users as guest
    where guest.is_anonymous
      and guest.created_at >= ((v_today - 13)::timestamp at time zone 'Europe/Madrid')
  )
  select
    days.day,
    count(guests.day)::integer,
    count(guests.day) filter (where guests.ordered)::integer
  from days
  left join guests on guests.day = days.day
  group by days.day
  order by days.day desc;
end;
$$;

revoke all on function public.get_guest_signups_by_day(uuid) from public, anon;
grant execute on function public.get_guest_signups_by_day(uuid) to authenticated;

comment on function public.get_guest_signups_by_day(uuid) is
  'Vigilancia de «Pedidos sin cuenta»: invitados creados por día (Madrid, 14 días) y cuántos pidieron. Sólo owner/manager con AAL2.';

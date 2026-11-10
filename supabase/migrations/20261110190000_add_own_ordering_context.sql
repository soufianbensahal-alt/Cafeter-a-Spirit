-- Contexto de pedidos para el cliente autenticado.
--
-- El cliente no puede leer public.businesses (la RLS sólo lo permite a
-- miembros del equipo), así que no conoce el business_id que necesitan
-- get_ordering_status y create_order. Esta función lo resuelve en servidor.
--
-- AVISO: get_own_ordering_context y ensure_own_customer_card localizan el
-- negocio por su NOMBRE ('Cafetería Spirit - Montcada'). Renombrar ese
-- negocio rompe ambas funciones (la tarjeta deja de encontrarse y los pedidos
-- dejan de estar disponibles). No cambiar el nombre sin migrar antes las dos.

create function public.get_own_ordering_context()
returns table (business_id uuid, ordering_enabled boolean, eligible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return;
  end if;

  return query
  select
    business.id,
    settings.ordering_enabled,
    (
      not settings.pilot_only
      or exists (
        select 1 from public.ordering_pilot_members as pilot
        where pilot.business_id = business.id
          and pilot.user_id = v_user_id
      )
    )
  from public.businesses as business
  join public.business_ordering_settings as settings on settings.business_id = business.id
  where business.active
    -- Ver AVISO al principio de esta migración.
    and pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
  limit 1;
end;
$$;

revoke all on function public.get_own_ordering_context() from public, anon;
grant execute on function public.get_own_ordering_context() to authenticated;

comment on function public.get_own_ordering_context() is
  'Devuelve business_id, apertura y elegibilidad de pedidos para auth.uid(). Localiza el negocio por nombre (''Cafetería Spirit - Montcada''): renombrarlo rompe esta función y ensure_own_customer_card.';

-- Mismo aviso junto a ensure_own_customer_card (se conserva el texto anterior).
comment on function public.ensure_own_customer_card() is
  'Lectura compatible bajo RLS de la membresía cliente de auth.uid(). Nunca crea tarjetas ni acepta identificadores de terceros. Localiza el negocio por nombre (''Cafetería Spirit - Montcada''): renombrarlo rompe esta función y get_own_ordering_context.';

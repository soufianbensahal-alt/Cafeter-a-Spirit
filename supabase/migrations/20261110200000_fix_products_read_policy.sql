-- Corrige la lectura de public.products por clientes.
--
-- La política original comprobaba que el negocio estuviera activo con una
-- subconsulta a public.businesses. Pero la RLS de businesses solo deja leer a
-- miembros del equipo y a clientes con tarjeta de fidelización en ese negocio:
-- para un cliente sin tarjeta la subconsulta devolvía 0 filas y no veía
-- ningún producto, así que la carta nunca mostraba los controles de pedido.
--
-- Revisión del resto de políticas de pedidos (mismo patrón):
--   * business_ordering_settings, ordering_pilot_members y orders consultan
--     business_members filtrando por user_id = auth.uid(); la política
--     business_members_select_own permite leer esas filas propias. Correctas.
--   * order_items consulta public.orders exigiendo parent.customer_id =
--     auth.uid() (o membresía propia); el cliente puede leer sus pedidos.
--     Correcta.
--   * Todas las funciones de pedidos son SECURITY DEFINER (no dependen de la
--     RLS del invocador), salvo private.mask_email, que es un formateador puro.
-- Solo products necesita cambio.

-- SECURITY DEFINER para que la comprobación no dependa de la RLS de
-- businesses. Vive en public porque las políticas se evalúan con el rol del
-- invocador, que no tiene USAGE sobre el esquema private. Solo revela si un
-- uuid corresponde a un negocio activo.
create function public.is_active_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses as business
    where business.id = p_business_id
      and business.active
  );
$$;

revoke all on function public.is_active_business(uuid) from public, anon;
grant execute on function public.is_active_business(uuid) to authenticated;

comment on function public.is_active_business(uuid) is
  'true si el negocio existe y está activo. SECURITY DEFINER para usarse en políticas RLS sin depender de la RLS de public.businesses.';

drop policy "products_select_active_business" on public.products;

create policy "products_select_active_business"
on public.products
for select
to authenticated
using (
  (select auth.uid()) is not null
  and public.is_active_business(products.business_id)
);

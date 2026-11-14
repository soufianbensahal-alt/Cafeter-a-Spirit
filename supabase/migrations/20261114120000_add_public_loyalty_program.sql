-- Datos públicos del programa de fidelización para la pantalla de inicio de
-- sesión («Con {n} sellos, tu próximo café es gratis»), sin sesión.
--
-- Devuelve SOLO los sellos necesarios y la descripción de la recompensa del
-- programa activo del local (lo mismo que el cartel de la barra). Nada de
-- identificadores, clientes ni otros programas.

create function public.get_public_loyalty_program()
returns table (stamps_required integer, reward_description text)
language sql
stable
security definer
set search_path = ''
as $$
  select program.stamps_required, program.reward_description
  from public.loyalty_programs as program
  join public.businesses as business on business.id = program.business_id
  where program.active
    and business.active
    -- Un único local por ahora (ver 20261110190000_add_own_ordering_context).
    and pg_catalog.lower(pg_catalog.btrim(business.name)) = pg_catalog.lower(pg_catalog.btrim('Cafetería Spirit - Montcada'))
  order by program.created_at
  limit 1;
$$;

revoke all on function public.get_public_loyalty_program() from public;
grant execute on function public.get_public_loyalty_program() to anon, authenticated;

comment on function public.get_public_loyalty_program() is
  'Sellos necesarios y recompensa del programa activo del local, para la captación sin sesión. Sólo esos dos campos.';

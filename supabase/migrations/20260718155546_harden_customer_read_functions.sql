create policy "businesses_select_own_customer_program"
on public.businesses
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.customer_cards as card
    join public.loyalty_programs as program on program.id = card.loyalty_program_id
    where card.customer_id = (select auth.uid())
      and program.business_id = businesses.id
  )
);

alter function public.ensure_own_customer_card() security invoker;
alter function public.get_own_stamp_history(uuid, integer, timestamptz) security invoker;

comment on function public.ensure_own_customer_card() is
  'Lectura compatible bajo RLS de la membresía cliente de auth.uid(). Nunca crea tarjetas ni acepta identificadores de terceros.';

comment on function public.get_own_stamp_history(uuid, integer, timestamptz) is
  'Historial paginado bajo RLS visible sólo para el propietario de la tarjeta indicada.';

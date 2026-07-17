drop policy "loyalty_programs_select_active_members" on public.loyalty_programs;
drop policy "loyalty_programs_select_customers" on public.loyalty_programs;

create policy "loyalty_programs_select_authorized"
on public.loyalty_programs
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    exists (
      select 1
      from public.business_members membership
      where membership.business_id = loyalty_programs.business_id
        and membership.user_id = (select auth.uid())
        and membership.active
    )
    or exists (
      select 1
      from public.customer_cards card
      where card.loyalty_program_id = loyalty_programs.id
        and card.customer_id = (select auth.uid())
    )
  )
);

comment on policy "loyalty_programs_select_authorized" on public.loyalty_programs is
  'Permite leer un programa a miembros activos del negocio o al cliente propietario de una tarjeta asociada.';

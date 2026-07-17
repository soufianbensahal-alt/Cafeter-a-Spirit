create policy "loyalty_programs_select_customers"
on public.loyalty_programs
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.customer_cards card
    where card.loyalty_program_id = loyalty_programs.id
      and card.customer_id = (select auth.uid())
  )
);

alter publication supabase_realtime add table public.stamp_transactions;

comment on policy "loyalty_programs_select_customers" on public.loyalty_programs is
  'Permite que cada cliente lea únicamente el programa asociado a su propia tarjeta.';

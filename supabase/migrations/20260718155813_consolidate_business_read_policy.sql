drop policy "businesses_select_active_members" on public.businesses;
drop policy "businesses_select_own_customer_program" on public.businesses;

create policy "businesses_select_authorized_contexts"
on public.businesses
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    exists (
      select 1
      from public.business_members as membership
      where membership.business_id = businesses.id
        and membership.user_id = (select auth.uid())
        and membership.active
    )
    or exists (
      select 1
      from public.customer_cards as card
      join public.loyalty_programs as program on program.id = card.loyalty_program_id
      where card.customer_id = (select auth.uid())
        and program.business_id = businesses.id
    )
  )
);

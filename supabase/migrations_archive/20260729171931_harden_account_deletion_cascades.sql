-- Account deletion is performed by deleting the authenticated Auth user.
-- Keep customer-owned data private and removable while preserving business
-- transaction history created by an employee who later deletes their account.

alter table public.customer_cards
  drop constraint if exists customer_cards_customer_id_fkey,
  add constraint customer_cards_customer_id_fkey
    foreign key (customer_id)
    references auth.users (id)
    on delete cascade;

alter table public.stamp_sessions
  drop constraint if exists stamp_sessions_customer_card_id_fkey,
  add constraint stamp_sessions_customer_card_id_fkey
    foreign key (customer_card_id)
    references public.customer_cards (id)
    on delete cascade;

-- A customer deletion removes their own loyalty ledger. Employee attribution
-- on transactions belonging to other customers is anonymized instead.
alter table public.stamp_transactions
  alter column employee_id drop not null,
  drop constraint if exists stamp_transactions_customer_card_id_fkey,
  add constraint stamp_transactions_customer_card_id_fkey
    foreign key (customer_card_id)
    references public.customer_cards (id)
    on delete cascade,
  drop constraint if exists stamp_transactions_employee_id_fkey,
  add constraint stamp_transactions_employee_id_fkey
    foreign key (employee_id)
    references auth.users (id)
    on delete set null,
  drop constraint if exists stamp_transactions_business_id_employee_id_fkey,
  add constraint stamp_transactions_business_id_employee_id_fkey
    foreign key (business_id, employee_id)
    references public.business_members (business_id, user_id)
    on delete set null (employee_id),
  drop constraint if exists stamp_transactions_stamp_session_id_fkey,
  add constraint stamp_transactions_stamp_session_id_fkey
    foreign key (stamp_session_id)
    references public.stamp_sessions (id)
    on delete set null;

-- A referential SET NULL is the only legitimate way for a completed
-- transaction to lose its session reference. Direct client updates remain
-- blocked by grants/RLS and all new stamp/redemption rows still require a
-- matching single-use session.
create or replace function private.enforce_loyalty_transaction_session_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_type text;
begin
  if new.transaction_type not in ('stamp', 'redemption') then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.stamp_session_id is not null
    and new.stamp_session_id is null
    and new.transaction_type = old.transaction_type
  then
    return new;
  end if;

  if new.stamp_session_id is null then
    raise exception using
      errcode = '23514',
      message = 'loyalty_transaction_requires_session';
  end if;

  select session.session_type
  into v_session_type
  from public.stamp_sessions as session
  where session.id = new.stamp_session_id;

  if v_session_type is null
    or (new.transaction_type = 'stamp' and v_session_type <> 'stamp')
    or (
      new.transaction_type = 'redemption'
      and v_session_type <> 'reward_redemption'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'loyalty_transaction_session_type_mismatch';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_loyalty_transaction_session_type()
  from public, anon, authenticated;

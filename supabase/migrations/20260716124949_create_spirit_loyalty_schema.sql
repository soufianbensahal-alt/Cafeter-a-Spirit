create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  stamps_required integer not null check (stamps_required > 0),
  reward_description text not null check (char_length(btrim(reward_description)) between 1 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete restrict,
  loyalty_program_id uuid not null references public.loyalty_programs (id) on delete restrict,
  current_stamps integer not null default 0 check (current_stamps >= 0),
  available_rewards integer not null default 0 check (available_rewards >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, loyalty_program_id)
);

create table public.stamp_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_card_id uuid not null references public.customer_cards (id) on delete restrict,
  token_hash text not null unique check (char_length(token_hash) between 32 and 256),
  short_code text not null check (short_code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create table public.stamp_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_card_id uuid not null references public.customer_cards (id) on delete restrict,
  business_id uuid not null references public.businesses (id) on delete restrict,
  employee_id uuid not null references auth.users (id) on delete restrict,
  stamp_session_id uuid references public.stamp_sessions (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  transaction_type text not null check (transaction_type in ('stamp', 'redemption', 'reversal')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled', 'reversed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (business_id, employee_id)
    references public.business_members (business_id, user_id)
    on delete restrict
);

create index business_members_user_id_idx on public.business_members (user_id);
create index business_members_business_active_idx on public.business_members (business_id) where active;
create index loyalty_programs_business_id_idx on public.loyalty_programs (business_id);
create index customer_cards_customer_id_idx on public.customer_cards (customer_id);
create index customer_cards_program_id_idx on public.customer_cards (loyalty_program_id);
create index stamp_sessions_card_id_idx on public.stamp_sessions (customer_card_id);
create index stamp_sessions_short_code_idx on public.stamp_sessions (short_code);
create index stamp_sessions_expires_at_idx on public.stamp_sessions (expires_at) where used_at is null;
create index stamp_transactions_card_created_idx on public.stamp_transactions (customer_card_id, created_at desc);
create index stamp_transactions_business_created_idx on public.stamp_transactions (business_id, created_at desc);
create index stamp_transactions_employee_id_idx on public.stamp_transactions (employee_id);
create unique index stamp_transactions_session_unique_idx
  on public.stamp_transactions (stamp_session_id)
  where stamp_session_id is not null;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function private.set_updated_at();

create trigger business_members_set_updated_at
before update on public.business_members
for each row execute function private.set_updated_at();

create trigger loyalty_programs_set_updated_at
before update on public.loyalty_programs
for each row execute function private.set_updated_at();

create trigger customer_cards_set_updated_at
before update on public.customer_cards
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.customer_cards enable row level security;
alter table public.stamp_sessions enable row level security;
alter table public.stamp_transactions enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_members from anon, authenticated;
revoke all on table public.loyalty_programs from anon, authenticated;
revoke all on table public.customer_cards from anon, authenticated;
revoke all on table public.stamp_sessions from anon, authenticated;
revoke all on table public.stamp_transactions from anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.businesses to authenticated;
grant select on table public.business_members to authenticated;
grant select on table public.loyalty_programs to authenticated;
grant select on table public.customer_cards to authenticated;
grant select on table public.stamp_transactions to authenticated;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = id)
with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "businesses_select_active_members"
on public.businesses
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.business_members membership
    where membership.business_id = businesses.id
      and membership.user_id = (select auth.uid())
      and membership.active
  )
);

create policy "business_members_select_own"
on public.business_members
for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "loyalty_programs_select_active_members"
on public.loyalty_programs
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.business_members membership
    where membership.business_id = loyalty_programs.business_id
      and membership.user_id = (select auth.uid())
      and membership.active
  )
);

create policy "customer_cards_select_own"
on public.customer_cards
for select
to authenticated
using ((select auth.uid()) is not null and customer_id = (select auth.uid()));

create policy "stamp_transactions_select_customer_or_member"
on public.stamp_transactions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    exists (
      select 1
      from public.customer_cards card
      where card.id = stamp_transactions.customer_card_id
        and card.customer_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.business_members membership
      where membership.business_id = stamp_transactions.business_id
        and membership.user_id = (select auth.uid())
        and membership.active
    )
  )
);

comment on table public.stamp_sessions is
  'Sesiones efímeras de sellado. Guarda hashes, nunca tokens QR en texto plano.';

comment on table public.stamp_transactions is
  'Libro de operaciones inmutable desde el frontend; las escrituras se implementarán mediante una RPC atómica.';

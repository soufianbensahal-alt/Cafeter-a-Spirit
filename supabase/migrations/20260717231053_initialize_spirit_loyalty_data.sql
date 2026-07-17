create unique index if not exists businesses_normalized_name_key
  on public.businesses (lower(btrim(name)));

create unique index if not exists loyalty_programs_business_normalized_name_key
  on public.loyalty_programs (business_id, lower(btrim(name)));

do $$
declare
  v_business_id uuid;
  v_program_id uuid;
begin
  select business.id
  into v_business_id
  from public.businesses as business
  where lower(btrim(business.name)) = lower(btrim('Cafetería Spirit - Montcada'))
  limit 1;

  if v_business_id is null then
    insert into public.businesses (name, active)
    values ('Cafetería Spirit - Montcada', true)
    returning id into v_business_id;
  else
    update public.businesses
    set name = 'Cafetería Spirit - Montcada',
        active = true
    where id = v_business_id;
  end if;

  select program.id
  into v_program_id
  from public.loyalty_programs as program
  where program.business_id = v_business_id
    and lower(btrim(program.name)) = lower(btrim('Tarjeta Café Spirit'))
  limit 1;

  if v_program_id is null then
    insert into public.loyalty_programs (
      business_id,
      name,
      description,
      stamps_required,
      reward_description,
      active
    )
    values (
      v_business_id,
      'Tarjeta Café Spirit',
      'Programa de fidelización de Cafetería Spirit',
      10,
      'Café gratuito',
      true
    )
    returning id into v_program_id;
  else
    update public.loyalty_programs
    set name = 'Tarjeta Café Spirit',
        description = 'Programa de fidelización de Cafetería Spirit',
        stamps_required = 10,
        reward_description = 'Café gratuito',
        active = true
    where id = v_program_id;
  end if;

  insert into public.customer_cards (customer_id, loyalty_program_id)
  select auth_user.id, v_program_id
  from auth.users as auth_user
  on conflict (customer_id, loyalty_program_id) do nothing;
end;
$$;

create or replace function public.ensure_own_customer_card()
returns table (
  id uuid,
  current_stamps integer,
  available_rewards integer,
  updated_at timestamptz,
  program_name text,
  stamps_required integer,
  reward_description text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
  v_program_id uuid;
begin
  if v_customer_id is null then
    raise exception using
      errcode = '28000',
      message = 'not_authenticated';
  end if;

  select program.id
  into v_program_id
  from public.loyalty_programs as program
  join public.businesses as business on business.id = program.business_id
  where lower(btrim(business.name)) = lower(btrim('Cafetería Spirit - Montcada'))
    and business.active
    and lower(btrim(program.name)) = lower(btrim('Tarjeta Café Spirit'))
    and program.active
  limit 1;

  if v_program_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'loyalty_program_unavailable';
  end if;

  insert into public.customer_cards (customer_id, loyalty_program_id)
  values (v_customer_id, v_program_id)
  on conflict (customer_id, loyalty_program_id) do nothing;

  return query
  select
    card.id,
    card.current_stamps,
    card.available_rewards,
    card.updated_at,
    program.name,
    program.stamps_required,
    program.reward_description
  from public.customer_cards as card
  join public.loyalty_programs as program on program.id = card.loyalty_program_id
  where card.customer_id = v_customer_id
    and card.loyalty_program_id = v_program_id;
end;
$$;

revoke all on function public.ensure_own_customer_card() from public;
revoke all on function public.ensure_own_customer_card() from anon;
grant execute on function public.ensure_own_customer_card() to authenticated;

comment on function public.ensure_own_customer_card() is
  'Creates at most one card for auth.uid() in the active Spirit program and returns that card. No user identifier is accepted from the caller.';

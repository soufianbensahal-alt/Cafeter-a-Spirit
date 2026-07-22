create or replace function public.create_stamp_request(p_customer_card_id uuid)
returns table(token text, short_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_token text;
  v_token_hash text;
  v_code text;
  v_expires_at timestamptz := clock_timestamp() + interval '90 seconds';
  v_random bytea;
  v_random_value bigint;
  v_collision boolean;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  select program.business_id
  into v_business_id
  from public.customer_cards card
  join public.loyalty_programs program on program.id = card.loyalty_program_id
  join public.businesses business on business.id = program.business_id
  where card.id = p_customer_card_id
    and card.customer_id = v_user_id
    and program.active
    and business.active;

  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'customer_card_not_available';
  end if;

  if (
    select count(*)
    from public.stamp_sessions session
    join public.customer_cards card on card.id = session.customer_card_id
    where card.customer_id = v_user_id
      and session.created_at > clock_timestamp() - interval '5 minutes'
  ) >= 6 then
    raise exception using errcode = 'P0001', message = 'creation_rate_limited';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_business_id::text, 0));

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 24 then
      raise exception using errcode = 'P0001', message = 'code_generation_failed';
    end if;

    loop
      v_random := extensions.gen_random_bytes(4);
      v_random_value :=
        pg_catalog.get_byte(v_random, 0)::bigint * 16777216
        + pg_catalog.get_byte(v_random, 1)::bigint * 65536
        + pg_catalog.get_byte(v_random, 2)::bigint * 256
        + pg_catalog.get_byte(v_random, 3)::bigint;
      exit when v_random_value < 4294000000;
    end loop;

    v_code := pg_catalog.lpad((v_random_value % 1000000)::text, 6, '0');
    select exists (
      select 1
      from public.stamp_sessions session
      where session.business_id = v_business_id
        and session.short_code = v_code
        and session.used_at is null
        and session.expires_at > clock_timestamp()
    ) into v_collision;
    exit when not v_collision;
  end loop;

  update public.stamp_sessions session
  set used_at = clock_timestamp()
  from public.customer_cards card
  where session.customer_card_id = card.id
    and card.customer_id = v_user_id
    and session.used_at is null
    and session.expires_at > clock_timestamp();

  insert into public.stamp_sessions (
    customer_card_id,
    business_id,
    token_hash,
    short_code,
    expires_at
  ) values (
    p_customer_card_id,
    v_business_id,
    v_token_hash,
    v_code,
    v_expires_at
  );

  return query select v_token, v_code, v_expires_at;
end;
$$;

revoke all on function public.create_stamp_request(uuid) from public, anon;
grant execute on function public.create_stamp_request(uuid) to authenticated;

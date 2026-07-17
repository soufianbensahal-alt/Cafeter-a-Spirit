create or replace function public.get_business_stamp_history(p_business_id uuid, p_limit integer default 10)
returns table(
  transaction_id uuid,
  occurred_at timestamptz,
  customer_masked text,
  result text,
  current_stamps integer,
  stamps_required integer,
  reward_earned integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if v_user_id is null or not private.is_active_business_member(v_user_id, p_business_id) then
    return;
  end if;

  return query
  select tx.id, tx.created_at, private.mask_customer_name(profile.display_name),
    case when coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0) > 0
      then 'Sello añadido · Recompensa conseguida'
      else 'Sello añadido'
    end,
    nullif(tx.metadata ->> 'current_stamps', '')::integer,
    nullif(tx.metadata ->> 'stamps_required', '')::integer,
    coalesce(nullif(tx.metadata ->> 'reward_earned', '')::integer, 0)
  from public.stamp_transactions tx
  join public.customer_cards card on card.id = tx.customer_card_id
  left join public.profiles profile on profile.id = card.customer_id
  where tx.business_id = p_business_id
    and tx.transaction_type = 'stamp'
    and tx.status = 'confirmed'
  order by tx.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_business_stamp_history(uuid, integer) from public, anon;
grant execute on function public.get_business_stamp_history(uuid, integer) to authenticated;

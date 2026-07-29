-- Transactional outbox for the email sent when a customer earns a reward.
-- Delivery remains outside the stamp-confirmation transaction: this migration
-- only records durable work for an internal Edge Function worker.

alter table public.customer_cards
  add column total_rewards_earned bigint not null default 0;

comment on column public.customer_cards.total_rewards_earned is
  'Monotonic reward sequence. Unlike available_rewards, this value never decreases after a redemption.';

with earned_rewards as (
  select
    transaction.customer_card_id,
    coalesce(
      sum(
        case
          when transaction.transaction_type = 'stamp'
            and transaction.status in ('confirmed', 'completed')
          then greatest(
            coalesce(nullif(transaction.metadata ->> 'reward_earned', '')::bigint, 0),
            0
          )
          else 0
        end
      ),
      0
    ) as reward_count
  from public.stamp_transactions as transaction
  group by transaction.customer_card_id
)
update public.customer_cards as card
set total_rewards_earned = greatest(
  card.available_rewards::bigint,
  coalesce(earned_rewards.reward_count, 0)
)
from earned_rewards
where earned_rewards.customer_card_id = card.id;

update public.customer_cards
set total_rewards_earned = available_rewards::bigint
where total_rewards_earned < available_rewards;

alter table public.customer_cards
  add constraint customer_cards_total_rewards_earned_check
  check (
    total_rewards_earned >= 0
    and total_rewards_earned >= available_rewards::bigint
  );

create table public.reward_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  customer_card_id uuid not null references public.customer_cards (id) on delete cascade,
  reward_sequence bigint not null check (reward_sequence > 0),
  reward_description text not null
    check (char_length(btrim(reward_description)) between 1 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  processing_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_notifications_card_sequence_key
    unique (customer_card_id, reward_sequence),
  constraint reward_notifications_state_check check (
    (status = 'pending' and processing_at is null and sent_at is null)
    or (status = 'processing' and processing_at is not null and sent_at is null)
    or (status = 'failed' and processing_at is null and sent_at is null)
    or (status = 'sent' and processing_at is null and sent_at is not null)
  )
);

comment on table public.reward_notifications is
  'Internal transactional outbox. One durable email notification per card and monotonic reward sequence.';

create index reward_notifications_customer_id_idx
  on public.reward_notifications (customer_id);

create index reward_notifications_claimable_idx
  on public.reward_notifications (created_at, id)
  where status in ('pending', 'failed', 'processing') and attempts < 5;

create trigger reward_notifications_set_updated_at
before update on public.reward_notifications
for each row execute function private.set_updated_at();

alter table public.reward_notifications enable row level security;

revoke all on table public.reward_notifications
  from public, anon, authenticated;
grant select, insert, update, delete on table public.reward_notifications
  to service_role;

create function private.track_reward_sequence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reward_delta bigint;
begin
  if tg_op = 'INSERT' then
    new.total_rewards_earned := greatest(
      coalesce(new.total_rewards_earned, 0),
      new.available_rewards::bigint
    );
    return new;
  end if;

  reward_delta := greatest(
    new.available_rewards::bigint - old.available_rewards::bigint,
    0
  );

  -- The sequence is database-owned. Decreases caused by redemptions keep it
  -- unchanged, while each newly earned reward advances it exactly once.
  new.total_rewards_earned := old.total_rewards_earned + reward_delta;
  return new;
end;
$$;

create trigger customer_cards_track_reward_sequence
before insert or update on public.customer_cards
for each row execute function private.track_reward_sequence();

create function private.enqueue_earned_reward_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reward_description_snapshot text;
begin
  if new.available_rewards <= old.available_rewards then
    return null;
  end if;

  select program.reward_description
  into reward_description_snapshot
  from public.loyalty_programs as program
  where program.id = new.loyalty_program_id;

  if reward_description_snapshot is null then
    raise exception 'Active reward description is unavailable'
      using errcode = '23514';
  end if;

  insert into public.reward_notifications (
    customer_id,
    customer_card_id,
    reward_sequence,
    reward_description
  )
  select
    new.customer_id,
    new.id,
    sequence_number,
    reward_description_snapshot
  from generate_series(
    old.total_rewards_earned + 1,
    new.total_rewards_earned
  ) as sequence_number
  on conflict (customer_card_id, reward_sequence) do nothing;

  return null;
end;
$$;

create trigger customer_cards_enqueue_reward_email
after update of available_rewards on public.customer_cards
for each row
when (new.available_rewards > old.available_rewards)
execute function private.enqueue_earned_reward_emails();

create function public.claim_reward_email_notification(
  p_notification_id uuid default null,
  p_max_attempts integer default 5
)
returns table (
  id uuid,
  customer_id uuid,
  customer_card_id uuid,
  reward_sequence bigint,
  reward_description text,
  claim_attempt smallint
)
language sql
security invoker
set search_path = ''
as $$
  with exhausted as (
    update public.reward_notifications as notification
    set status = 'failed',
        processing_at = null,
        last_error = coalesce(
          notification.last_error,
          'Delivery claim expired after the final permitted attempt'
        )
    where notification.status = 'processing'
      and notification.processing_at < now() - interval '15 minutes'
      and (
        notification.attempts >= least(greatest(coalesce(p_max_attempts, 5), 1), 5)
        or notification.last_attempt_at <= now() - interval '23 hours'
      )
    returning notification.id
  ),
  candidate as (
    select notification.id
    from public.reward_notifications as notification
    where (p_notification_id is null or notification.id = p_notification_id)
      and notification.attempts < least(greatest(coalesce(p_max_attempts, 5), 1), 5)
      and (
        notification.status = 'pending'
        or (
          notification.status = 'failed'
          and notification.last_attempt_at > now() - interval '23 hours'
        )
        or (
          notification.status = 'processing'
          and notification.processing_at < now() - interval '15 minutes'
          and notification.last_attempt_at > now() - interval '23 hours'
        )
      )
      and not exists (
        select 1 from exhausted where exhausted.id = notification.id
      )
    order by notification.created_at, notification.id
    for update skip locked
    limit 1
  ),
  claimed as (
    update public.reward_notifications as notification
    set status = 'processing',
        attempts = notification.attempts + 1,
        processing_at = now(),
        last_attempt_at = now(),
        last_error = null
    from candidate
    where notification.id = candidate.id
    returning
      notification.id,
      notification.customer_id,
      notification.customer_card_id,
      notification.reward_sequence,
      notification.reward_description,
      notification.attempts
  )
  select
    claimed.id,
    claimed.customer_id,
    claimed.customer_card_id,
    claimed.reward_sequence,
    claimed.reward_description,
    claimed.attempts::smallint
  from claimed;
$$;

create function public.complete_reward_email_notification(
  p_notification_id uuid,
  p_claim_attempt smallint,
  p_provider_message_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.reward_notifications
  set status = 'sent',
      processing_at = null,
      sent_at = now(),
      provider_message_id = left(nullif(btrim(p_provider_message_id), ''), 255),
      last_error = null
  where id = p_notification_id
    and status = 'processing'
    and attempts = p_claim_attempt;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create function public.fail_reward_email_notification(
  p_notification_id uuid,
  p_claim_attempt smallint,
  p_error text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.reward_notifications
  set status = 'failed',
      processing_at = null,
      last_error = left(
        regexp_replace(coalesce(p_error, 'Unknown delivery error'), '[[:cntrl:]]', ' ', 'g'),
        500
      )
  where id = p_notification_id
    and status = 'processing'
    and attempts = p_claim_attempt;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.claim_reward_email_notification(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.complete_reward_email_notification(uuid, smallint, text)
  from public, anon, authenticated;
revoke all on function public.fail_reward_email_notification(uuid, smallint, text)
  from public, anon, authenticated;

grant execute on function public.claim_reward_email_notification(uuid, integer)
  to service_role;
grant execute on function public.complete_reward_email_notification(uuid, smallint, text)
  to service_role;
grant execute on function public.fail_reward_email_notification(uuid, smallint, text)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'spirit_reward_email_worker_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'spirit_reward_email_worker_secret',
      'Authenticates the internal Spirit reward-email worker.'
    );
  end if;
end;
$$;

create function public.verify_reward_email_worker_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'spirit_reward_email_worker_secret'
      and decrypted_secret = p_secret
      and nullif(p_secret, '') is not null
  );
$$;

revoke all on function public.verify_reward_email_worker_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_reward_email_worker_secret(text)
  to service_role;

comment on function public.claim_reward_email_notification(uuid, integer) is
  'Atomically claims one pending, failed, or stale reward email outbox row using SKIP LOCKED.';
comment on function public.complete_reward_email_notification(uuid, smallint, text) is
  'Marks only the currently claimed attempt as delivered.';
comment on function public.fail_reward_email_notification(uuid, smallint, text) is
  'Releases only the currently claimed attempt for a bounded retry.';

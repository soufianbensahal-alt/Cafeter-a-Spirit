create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 4096),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth_key text not null check (char_length(auth_key) between 8 and 256),
  language text not null default 'es' check (language in ('es', 'ca')),
  enabled boolean not null default true,
  last_notified_at timestamptz not null default now(),
  delivery_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push subscriptions consented to by authenticated Spirit customers, one row per browser/device endpoint.';

create index push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index push_subscriptions_due_idx
  on public.push_subscriptions (last_notified_at)
  where enabled;

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.push_subscriptions to authenticated;

create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create or replace function public.register_own_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_language text default 'es'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  subscription_id uuid;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if char_length(coalesce(p_endpoint, '')) not between 20 and 4096
    or char_length(coalesce(p_p256dh, '')) not between 20 and 512
    or char_length(coalesce(p_auth_key, '')) not between 8 and 256
    or p_language not in ('es', 'ca')
  then
    raise exception 'Invalid push subscription'
      using errcode = '22023';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    language,
    enabled,
    last_notified_at,
    delivery_claimed_at
  )
  values (
    requester_id,
    p_endpoint,
    p_p256dh,
    p_auth_key,
    p_language,
    true,
    now(),
    null
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      language = excluded.language,
      enabled = true,
      last_notified_at = case
        when public.push_subscriptions.user_id is distinct from excluded.user_id
          or not public.push_subscriptions.enabled
        then now()
        else public.push_subscriptions.last_notified_at
      end,
      delivery_claimed_at = null,
      updated_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;

revoke all on function public.register_own_push_subscription(text, text, text, text)
  from public, anon;
grant execute on function public.register_own_push_subscription(text, text, text, text)
  to authenticated;

create or replace function public.unregister_own_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  delete from public.push_subscriptions
  where user_id = requester_id
    and endpoint = p_endpoint;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.unregister_own_push_subscription(text)
  from public, anon;
grant execute on function public.unregister_own_push_subscription(text)
  to authenticated;

create or replace function public.claim_due_push_subscriptions(p_limit integer default 250)
returns table (
  id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  language text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with due as (
    select subscription.id
    from public.push_subscriptions as subscription
    where subscription.enabled
      and subscription.last_notified_at <= now() - interval '2 days'
      and (
        subscription.delivery_claimed_at is null
        or subscription.delivery_claimed_at < now() - interval '15 minutes'
      )
    order by subscription.last_notified_at, subscription.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 250), 1), 500)
  ),
  claimed as (
    update public.push_subscriptions as subscription
    set delivery_claimed_at = now(),
        updated_at = now()
    from due
    where subscription.id = due.id
    returning
      subscription.id,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth_key,
      subscription.language
  )
  select
    claimed.id,
    claimed.endpoint,
    claimed.p256dh,
    claimed.auth_key,
    claimed.language
  from claimed;
end;
$$;

revoke all on function public.claim_due_push_subscriptions(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_push_subscriptions(integer)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'spirit_push_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'spirit_push_cron_secret',
      'Authenticates the Spirit quick-access reminder cron request.'
    );
  end if;
end;
$$;

create or replace function public.verify_push_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'spirit_push_cron_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.verify_push_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_push_cron_secret(text)
  to service_role;

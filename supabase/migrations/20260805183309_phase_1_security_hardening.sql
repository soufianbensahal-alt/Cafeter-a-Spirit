-- Phase 1 security hardening. This migration is intentionally idempotent at
-- the data level and does not enable or configure any external secret.

create or replace function private.is_active_business_member(
  p_user_id uuid,
  p_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.business_members as membership
      join public.businesses as business on business.id = membership.business_id
      where membership.user_id = p_user_id
        and membership.business_id = p_business_id
        and membership.role in ('owner', 'manager', 'employee')
        and membership.active
        and business.active
    );
$$;

revoke all on function private.is_active_business_member(uuid, uuid)
  from public, anon, authenticated;

comment on function private.is_active_business_member(uuid, uuid) is
  'Autoriza operaciones del equipo sólo para miembros activos con sesión MFA AAL2.';

create function private.enforce_atomic_session_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_count integer;
begin
  select card.customer_id
  into v_customer_id
  from public.customer_cards as card
  where card.id = new.customer_card_id;

  if v_customer_id is null then
    raise exception using errcode = '23503', message = 'customer_card_not_available';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('spirit-session:' || v_customer_id::text, 0)
  );

  select count(*)
  into v_count
  from public.stamp_sessions as session
  join public.customer_cards as card on card.id = session.customer_card_id
  where card.customer_id = v_customer_id
    and session.created_at > clock_timestamp() - interval '5 minutes';

  if v_count >= 6 then
    raise exception using errcode = 'P0001', message = 'creation_rate_limited';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_atomic_session_creation_limit()
  from public, anon, authenticated;

create trigger stamp_sessions_atomic_creation_limit
before insert on public.stamp_sessions
for each row execute function private.enforce_atomic_session_creation_limit();

create function private.enforce_atomic_validation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := case when new.method = 'code' then 10 else 30 end;
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'spirit-validation:' || new.employee_id::text || ':' ||
      new.business_id::text || ':' || new.method,
      0
    )
  );

  select count(*)
  into v_count
  from private.stamp_validation_attempts as attempt
  where attempt.employee_id = new.employee_id
    and attempt.business_id = new.business_id
    and attempt.method = new.method
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_atomic_validation_limit()
  from public, anon, authenticated;

create trigger stamp_validation_attempts_atomic_limit
before insert on private.stamp_validation_attempts
for each row execute function private.enforce_atomic_validation_limit();

create table public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  policy_version text not null
    check (policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  source text not null default 'customer_signup'
    check (source in ('customer_signup', 'profile_update')),
  unique (user_id, policy_version)
);

comment on table public.privacy_consents is
  'Registro técnico e inmutable del consentimiento presentado durante el alta. No sustituye la revisión legal de la política.';

alter table public.privacy_consents enable row level security;
revoke all on table public.privacy_consents from public, anon, authenticated;
grant select on table public.privacy_consents to authenticated;

create policy "privacy_consents_select_own"
on public.privacy_consents
for select
to authenticated
using ((select auth.uid()) = user_id);

create function private.capture_signup_privacy_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'privacy_policy_version'), '');
begin
  if coalesce((new.raw_user_meta_data ->> 'privacy_consent')::boolean, false)
    and v_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    insert into public.privacy_consents (user_id, policy_version)
    values (new.id, v_version)
    on conflict (user_id, policy_version) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_signup_privacy_consent()
  from public, anon, authenticated;

create trigger on_auth_user_capture_privacy_consent
after insert on auth.users
for each row execute function private.capture_signup_privacy_consent();

create table private.security_alerts (
  id bigint generated always as identity primary key,
  event_type text not null
    check (event_type in ('redemption_failure', 'validation_failure', 'auth_failure', 'outbox_failure')),
  severity text not null default 'warning'
    check (severity in ('warning', 'critical')),
  business_id uuid references public.businesses (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  event_code text not null check (char_length(event_code) between 1 and 80),
  context jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  constraint security_alerts_context_object check (jsonb_typeof(context) = 'object')
);

create index security_alerts_open_idx
  on private.security_alerts (severity, detected_at desc)
  where acknowledged_at is null;

alter table private.security_alerts enable row level security;
revoke all on table private.security_alerts from public, anon, authenticated;
revoke all on sequence private.security_alerts_id_seq from public, anon, authenticated;
grant select, insert, update on table private.security_alerts to service_role;
grant usage, select on sequence private.security_alerts_id_seq to service_role;

create function private.alert_failed_reward_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'failed'
    and new.attempts >= 5
    and (old.status, old.attempts) is distinct from (new.status, new.attempts)
  then
    insert into private.security_alerts (
      event_type, severity, actor_id, event_code, context
    ) values (
      'outbox_failure',
      'critical',
      new.customer_id,
      'reward_email_delivery_exhausted',
      jsonb_build_object('notification_id', new.id, 'attempts', new.attempts)
    );
  end if;
  return null;
end;
$$;

revoke all on function private.alert_failed_reward_outbox()
  from public, anon, authenticated;

create trigger reward_notifications_alert_final_failure
after update of status, attempts on public.reward_notifications
for each row execute function private.alert_failed_reward_outbox();

create function public.report_business_security_failure(
  p_business_id uuid,
  p_event_type text,
  p_event_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_type text := nullif(pg_catalog.btrim(p_event_type), '');
  v_code text := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_event_code), ''), 'unknown'), 80);
begin
  if v_user_id is null
    or not private.is_active_business_member(v_user_id, p_business_id)
    or v_type not in ('redemption_failure', 'validation_failure')
  then
    return false;
  end if;

  if exists (
    select 1
    from private.security_alerts as alert
    where alert.actor_id = v_user_id
      and alert.business_id = p_business_id
      and alert.event_type = v_type
      and alert.event_code = v_code
      and alert.detected_at > clock_timestamp() - interval '5 minutes'
  ) then
    return true;
  end if;

  insert into private.security_alerts (
    event_type, severity, business_id, actor_id, event_code
  ) values (
    v_type,
    case when v_type = 'redemption_failure' then 'critical' else 'warning' end,
    p_business_id,
    v_user_id,
    v_code
  );
  return true;
end;
$$;

revoke all on function public.report_business_security_failure(uuid, text, text)
  from public, anon;
grant execute on function public.report_business_security_failure(uuid, text, text)
  to authenticated;

comment on function public.report_business_security_failure(uuid, text, text) is
  'Registra señales sanitizadas del modo cafetería. Requiere membresía activa y AAL2.';

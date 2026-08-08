-- Phase 2: privileged employee sessions and per-employee fraud controls.
-- Customer sessions are intentionally unaffected by these limits.

create table private.privileged_business_sessions (
  session_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  primary key (session_id, business_id),
  constraint privileged_business_sessions_valid_window check (
    expires_at > started_at
    and expires_at <= started_at + interval '8 hours'
  ),
  constraint privileged_business_sessions_activity_after_start check (
    last_activity_at >= started_at
  )
);

create index privileged_business_sessions_active_user_idx
  on private.privileged_business_sessions (user_id, business_id, last_activity_at desc)
  where ended_at is null;

alter table private.privileged_business_sessions enable row level security;
revoke all on table private.privileged_business_sessions from public, anon, authenticated;

comment on table private.privileged_business_sessions is
  'Sesiones AAL2 del modo cafetería: máximo 8 horas y 30 minutos de inactividad.';

create function private.current_auth_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session_id text := nullif((select auth.jwt()) ->> 'session_id', '');
begin
  if v_session_id is null
    or v_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return null;
  end if;
  return v_session_id::uuid;
end;
$$;

revoke all on function private.current_auth_session_id()
  from public, anon, authenticated;

create function public.start_privileged_business_session(p_business_id uuid)
returns table(status text, expires_at timestamptz, inactivity_timeout_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_auth_session_id();
  v_now timestamptz := clock_timestamp();
  v_existing private.privileged_business_sessions%rowtype;
begin
  if v_user_id is null or v_session_id is null or (select auth.jwt()) ->> 'aal' <> 'aal2' then
    return query select 'not_authorized'::text, null::timestamptz, 1800;
    return;
  end if;

  if not exists (
    select 1
    from public.business_members as membership
    join public.businesses as business on business.id = membership.business_id
    where membership.user_id = v_user_id
      and membership.business_id = p_business_id
      and membership.role in ('owner', 'manager', 'employee')
      and membership.active
      and business.active
  ) then
    return query select 'not_authorized'::text, null::timestamptz, 1800;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('spirit-privileged-session:' || v_session_id::text, 0)
  );

  select session.*
  into v_existing
  from private.privileged_business_sessions as session
  where session.session_id = v_session_id
    and session.business_id = p_business_id
  for update;

  if v_existing.session_id is not null then
    if v_existing.user_id <> v_user_id
      or v_existing.ended_at is not null
      or v_existing.expires_at <= v_now
      or v_existing.last_activity_at <= v_now - interval '30 minutes'
    then
      return query select 'expired'::text, v_existing.expires_at, 1800;
      return;
    end if;

    update private.privileged_business_sessions
    set last_activity_at = v_now
    where session_id = v_session_id and business_id = p_business_id;

    return query select 'active'::text, v_existing.expires_at, 1800;
    return;
  end if;

  insert into private.privileged_business_sessions (
    session_id, business_id, user_id, started_at, last_activity_at, expires_at
  ) values (
    v_session_id, p_business_id, v_user_id, v_now, v_now, v_now + interval '8 hours'
  );

  return query select 'active'::text, v_now + interval '8 hours', 1800;
end;
$$;

create function public.touch_privileged_business_session(p_business_id uuid)
returns table(status text, expires_at timestamptz, inactivity_timeout_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_auth_session_id();
  v_now timestamptz := clock_timestamp();
  v_existing private.privileged_business_sessions%rowtype;
begin
  if v_user_id is null or v_session_id is null or (select auth.jwt()) ->> 'aal' <> 'aal2' then
    return query select 'not_authorized'::text, null::timestamptz, 1800;
    return;
  end if;

  select session.*
  into v_existing
  from private.privileged_business_sessions as session
  where session.session_id = v_session_id
    and session.business_id = p_business_id
    and session.user_id = v_user_id
  for update;

  if v_existing.session_id is null then
    return query select 'not_started'::text, null::timestamptz, 1800;
    return;
  end if;

  if v_existing.ended_at is not null
    or v_existing.expires_at <= v_now
    or v_existing.last_activity_at <= v_now - interval '30 minutes'
  then
    return query select 'expired'::text, v_existing.expires_at, 1800;
    return;
  end if;

  update private.privileged_business_sessions
  set last_activity_at = v_now
  where session_id = v_session_id and business_id = p_business_id;

  return query select 'active'::text, v_existing.expires_at, 1800;
end;
$$;

create function public.end_privileged_business_session(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := private.current_auth_session_id();
begin
  if v_user_id is null or v_session_id is null then
    return false;
  end if;

  update private.privileged_business_sessions
  set ended_at = coalesce(ended_at, clock_timestamp())
  where session_id = v_session_id
    and business_id = p_business_id
    and user_id = v_user_id;
  return found;
end;
$$;

revoke all on function public.start_privileged_business_session(uuid) from public, anon;
revoke all on function public.touch_privileged_business_session(uuid) from public, anon;
revoke all on function public.end_privileged_business_session(uuid) from public, anon;
grant execute on function public.start_privileged_business_session(uuid) to authenticated;
grant execute on function public.touch_privileged_business_session(uuid) to authenticated;
grant execute on function public.end_privileged_business_session(uuid) to authenticated;

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
    )
    and exists (
      select 1
      from private.privileged_business_sessions as session
      where session.session_id = private.current_auth_session_id()
        and session.user_id = p_user_id
        and session.business_id = p_business_id
        and session.ended_at is null
        and session.expires_at > clock_timestamp()
        and session.last_activity_at > clock_timestamp() - interval '30 minutes'
    );
$$;

revoke all on function private.is_active_business_member(uuid, uuid)
  from public, anon, authenticated;

comment on function private.is_active_business_member(uuid, uuid) is
  'Autoriza miembros activos con AAL2 y una sesión privilegiada vigente (8 h / 30 min de inactividad).';

alter table private.security_alerts
  drop constraint if exists security_alerts_event_type_check;

alter table private.security_alerts
  add constraint security_alerts_event_type_check check (
    event_type in (
      'redemption_failure',
      'validation_failure',
      'auth_failure',
      'outbox_failure',
      'employee_fraud_signal'
    )
  );

create function private.alert_employee_validation_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_warning integer := case when new.method = 'code' then 8 else 24 end;
  v_critical integer := case when new.method = 'code' then 10 else 30 end;
  v_severity text;
  v_code text;
begin
  select count(*) into v_count
  from private.stamp_validation_attempts as attempt
  where attempt.employee_id = new.employee_id
    and attempt.business_id = new.business_id
    and attempt.method = new.method
    and attempt.attempted_at > clock_timestamp() - interval '1 minute';

  if v_count not in (v_warning, v_critical) then
    return null;
  end if;

  v_severity := case when v_count = v_critical then 'critical' else 'warning' end;
  v_code := 'employee_' || new.method || '_validation_' || v_count::text || '_per_minute';

  if not exists (
    select 1 from private.security_alerts as alert
    where alert.actor_id = new.employee_id
      and alert.business_id = new.business_id
      and alert.event_type = 'employee_fraud_signal'
      and alert.event_code = v_code
      and alert.detected_at > clock_timestamp() - interval '5 minutes'
  ) then
    insert into private.security_alerts (
      event_type, severity, business_id, actor_id, event_code, context
    ) values (
      'employee_fraud_signal', v_severity, new.business_id, new.employee_id, v_code,
      pg_catalog.jsonb_build_object('method', new.method, 'attempts', v_count, 'window_seconds', 60)
    );
  end if;
  return null;
end;
$$;

revoke all on function private.alert_employee_validation_threshold()
  from public, anon, authenticated;

create trigger stamp_validation_attempts_employee_alert
after insert on private.stamp_validation_attempts
for each row execute function private.alert_employee_validation_threshold();

create index stamp_transactions_employee_activity_idx
  on public.stamp_transactions (employee_id, business_id, created_at desc)
  where employee_id is not null and transaction_type in ('stamp', 'redemption');

create function private.enforce_employee_transaction_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_five_minute_count integer;
  v_daily_count integer;
begin
  if new.employee_id is null
    or new.transaction_type not in ('stamp', 'redemption')
    or new.status not in ('confirmed', 'completed')
  then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'spirit-employee-transactions:' || new.employee_id::text || ':' || new.business_id::text,
      0
    )
  );

  select
    count(*) filter (where tx.created_at > clock_timestamp() - interval '5 minutes'),
    count(*) filter (where tx.created_at > clock_timestamp() - interval '24 hours')
  into v_five_minute_count, v_daily_count
  from public.stamp_transactions as tx
  where tx.employee_id = new.employee_id
    and tx.business_id = new.business_id
    and tx.transaction_type in ('stamp', 'redemption')
    and tx.status in ('confirmed', 'completed')
    and tx.created_at > clock_timestamp() - interval '24 hours';

  if v_five_minute_count >= 30 or v_daily_count >= 300 then
    raise exception using errcode = 'P0001', message = 'employee_operation_rate_limited';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_employee_transaction_limit()
  from public, anon, authenticated;

create trigger stamp_transactions_employee_limit
before insert on public.stamp_transactions
for each row execute function private.enforce_employee_transaction_limit();

create function private.alert_employee_transaction_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_five_minute_count integer;
  v_daily_count integer;
  v_code text;
  v_severity text;
begin
  if new.employee_id is null
    or new.transaction_type not in ('stamp', 'redemption')
    or new.status not in ('confirmed', 'completed')
  then
    return null;
  end if;

  select
    count(*) filter (where tx.created_at > clock_timestamp() - interval '5 minutes'),
    count(*) filter (where tx.created_at > clock_timestamp() - interval '24 hours')
  into v_five_minute_count, v_daily_count
  from public.stamp_transactions as tx
  where tx.employee_id = new.employee_id
    and tx.business_id = new.business_id
    and tx.transaction_type in ('stamp', 'redemption')
    and tx.status in ('confirmed', 'completed')
    and tx.created_at > clock_timestamp() - interval '24 hours';

  if v_five_minute_count in (24, 30) then
    v_code := 'employee_operations_' || v_five_minute_count::text || '_per_5_minutes';
    v_severity := case when v_five_minute_count = 30 then 'critical' else 'warning' end;
  elsif v_daily_count in (240, 300) then
    v_code := 'employee_operations_' || v_daily_count::text || '_per_24_hours';
    v_severity := case when v_daily_count = 300 then 'critical' else 'warning' end;
  else
    return null;
  end if;

  if not exists (
    select 1 from private.security_alerts as alert
    where alert.actor_id = new.employee_id
      and alert.business_id = new.business_id
      and alert.event_type = 'employee_fraud_signal'
      and alert.event_code = v_code
      and alert.detected_at > clock_timestamp() - interval '24 hours'
  ) then
    insert into private.security_alerts (
      event_type, severity, business_id, actor_id, event_code, context
    ) values (
      'employee_fraud_signal', v_severity, new.business_id, new.employee_id, v_code,
      pg_catalog.jsonb_build_object(
        'five_minute_count', v_five_minute_count,
        'daily_count', v_daily_count
      )
    );
  end if;
  return null;
end;
$$;

revoke all on function private.alert_employee_transaction_threshold()
  from public, anon, authenticated;

create trigger stamp_transactions_employee_alert
after insert on public.stamp_transactions
for each row execute function private.alert_employee_transaction_threshold();

comment on function private.enforce_employee_transaction_limit() is
  'Límite atómico por empleado: 30 operaciones/5 min y 300 operaciones/24 h.';

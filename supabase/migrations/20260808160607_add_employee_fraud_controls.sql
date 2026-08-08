-- Phase 2: per-employee fraud controls.
-- Privileged-session RPCs are intentionally excluded: business access continues
-- to rely on the existing active membership and AAL2 authorization model.

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

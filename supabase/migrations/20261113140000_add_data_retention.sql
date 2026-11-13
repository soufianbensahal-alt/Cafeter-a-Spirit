-- Plazos de conservación (propuestos, pendientes de validar con la cafetería;
-- se reflejan en el borrador de /privacidad):
--   * pedidos: 12 meses (nunca los que siguen en curso);
--   * intentos del código del día, solicitudes de sello/canje caducadas e
--     intentos de validación de sellos del equipo: 30 días;
--   * cola de correos de recompensa ya enviados o fallidos: 90 días;
--   * alertas de seguridad: 12 meses.
-- Además, al borrar una cuenta (también la limpieza de invitados) sus pedidos
-- pierden en ese momento la nota y el nombre de invitado.

-- ---------------------------------------------------------------------------
-- Pedidos de una cuenta borrada: sin nota ni nombre.
-- orders.customer_id es «on delete set null»: la acción referencial hace un
-- UPDATE que este trigger aprovecha para limpiar los textos personales.
-- ---------------------------------------------------------------------------
create function private.scrub_orphaned_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.customer_id is not null and new.customer_id is null then
    new.note := null;
    new.guest_name := null;
  end if;
  return new;
end;
$$;

revoke all on function private.scrub_orphaned_order() from public, anon, authenticated;

create trigger orders_scrub_on_customer_deleted
before update of customer_id on public.orders
for each row
execute function private.scrub_orphaned_order();

-- ---------------------------------------------------------------------------
-- Limpieza. p_dry_run = true sólo cuenta lo que se borraría.
-- ---------------------------------------------------------------------------
create function private.purge_expired_data(
  p_dry_run boolean default false,
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orders integer;
  v_code_attempts integer;
  v_stamp_sessions integer;
  v_validation_attempts integer;
  v_reward_notifications integer;
  v_security_alerts integer;
begin
  if p_dry_run then
    select count(*) into v_orders from public.orders
    where created_at < p_now - interval '12 months'
      and status not in ('pending', 'accepted', 'preparing');
    select count(*) into v_code_attempts from private.order_code_attempts
    where attempted_at < p_now - interval '30 days';
    select count(*) into v_stamp_sessions from public.stamp_sessions
    where expires_at < p_now - interval '30 days';
    select count(*) into v_validation_attempts from private.stamp_validation_attempts
    where attempted_at < p_now - interval '30 days';
    select count(*) into v_reward_notifications from public.reward_notifications
    where status in ('sent', 'failed') and created_at < p_now - interval '90 days';
    select count(*) into v_security_alerts from private.security_alerts
    where detected_at < p_now - interval '12 months';
  else
    delete from public.orders
    where created_at < p_now - interval '12 months'
      and status not in ('pending', 'accepted', 'preparing');
    get diagnostics v_orders = row_count;

    delete from private.order_code_attempts
    where attempted_at < p_now - interval '30 days';
    get diagnostics v_code_attempts = row_count;

    -- Las transacciones que usaron la solicitud conservan el sello
    -- (stamp_transactions.stamp_session_id es «on delete set null»).
    delete from public.stamp_sessions
    where expires_at < p_now - interval '30 days';
    get diagnostics v_stamp_sessions = row_count;

    delete from private.stamp_validation_attempts
    where attempted_at < p_now - interval '30 days';
    get diagnostics v_validation_attempts = row_count;

    delete from public.reward_notifications
    where status in ('sent', 'failed') and created_at < p_now - interval '90 days';
    get diagnostics v_reward_notifications = row_count;

    delete from private.security_alerts
    where detected_at < p_now - interval '12 months';
    get diagnostics v_security_alerts = row_count;
  end if;

  return pg_catalog.jsonb_build_object(
    'dry_run', p_dry_run,
    'orders', v_orders,
    'order_code_attempts', v_code_attempts,
    'stamp_sessions', v_stamp_sessions,
    'stamp_validation_attempts', v_validation_attempts,
    'reward_notifications', v_reward_notifications,
    'security_alerts', v_security_alerts
  );
end;
$$;

revoke all on function private.purge_expired_data(boolean, timestamptz) from public, anon, authenticated;

comment on function private.purge_expired_data(boolean, timestamptz) is
  'Plazos de conservación (pedidos y alertas 12 meses; intentos y solicitudes caducadas 30 días; correos de recompensa 90 días). Con p_dry_run sólo cuenta. Programada a diario con pg_cron.';

-- A diario a las 03:30 UTC, después de la limpieza de invitados (03:00).
select cron.schedule('purge-expired-data', '30 3 * * *', 'select private.purge_expired_data()');

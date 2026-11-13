begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Prefijo f0…/f1…/f2…/f3…/f4… exclusivo de este fichero.
-- Todos los plazos se prueban justo a cada lado del límite.
insert into public.businesses (id, name, active) values ('f0000000-0000-4000-8000-000000000001', 'Retention Test', true);
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'retention-customer@spirit.test'),
  ('f1000000-0000-4000-8000-000000000002', 'retention-deleted@spirit.test'),
  ('f2000000-0000-4000-8000-000000000001', 'retention-employee@spirit.test');
insert into public.loyalty_programs (id, business_id, name, stamps_required, reward_description) values
  ('f4000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Retention', 10, 'Café gratis');
insert into public.customer_cards (id, customer_id, loyalty_program_id) values
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001');

-- Pedidos: 12 meses (nunca los que siguen en curso).
insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, created_at, updated_at) values
  ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1, current_date - 400, 'Barra', 'served', 250, 'viejo', now() - interval '12 months 1 day', now() - interval '12 months 1 day'),
  ('f3000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 2, current_date - 360, 'Barra', 'served', 250, 'reciente', now() - interval '12 months' + interval '1 day', now()),
  ('f3000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 3, current_date - 401, 'Barra', 'pending', 250, 'olvidado', now() - interval '13 months', now() - interval '13 months');
insert into public.products (business_id, id, category_id, name_es, name_ca, price_cents) values
  ('f0000000-0000-4000-8000-000000000001', 'retention-cafe', 'test', 'Café', 'Cafè', 250);
insert into public.order_items (order_id, business_id, product_id, position, quantity, unit_price_cents, product_name, line_total_cents) values
  ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'retention-cafe', 1, 1, 250, 'Café', 250);

-- Intentos del código del día: 30 días.
insert into private.order_code_attempts (user_id, business_id, success, attempted_at) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', false, now() - interval '31 days'),
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', false, now() - interval '29 days');

-- Solicitudes de sello/canje caducadas: 30 días.
insert into public.stamp_sessions (id, customer_card_id, token_hash, short_code, created_at, expires_at, business_id, session_type) values
  ('f3000000-0000-4000-8000-000000000011', 'f4000000-0000-4000-8000-000000000002', repeat('a', 64), '111111', now() - interval '31 days 5 minutes', now() - interval '31 days', 'f0000000-0000-4000-8000-000000000001', 'stamp'),
  ('f3000000-0000-4000-8000-000000000012', 'f4000000-0000-4000-8000-000000000002', repeat('b', 64), '222222', now() - interval '29 days 5 minutes', now() - interval '29 days', 'f0000000-0000-4000-8000-000000000001', 'reward_redemption');

-- Intentos de validación del equipo: 30 días.
insert into private.stamp_validation_attempts (employee_id, business_id, method, success, attempted_at) values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'code', false, now() - interval '31 days'),
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'qr', true, now() - interval '29 days');

-- Cola de correos de recompensa: 90 días (sólo enviados o fallidos).
insert into public.reward_notifications (customer_id, customer_card_id, reward_sequence, reward_description, status, sent_at, created_at) values
  ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 1, 'Café gratis', 'sent', now() - interval '91 days', now() - interval '91 days'),
  ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 2, 'Café gratis', 'failed', null, now() - interval '91 days'),
  ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 3, 'Café gratis', 'pending', null, now() - interval '91 days'),
  ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 4, 'Café gratis', 'sent', now() - interval '89 days', now() - interval '89 days');

-- Alertas de seguridad: 12 meses.
insert into private.security_alerts (event_type, severity, business_id, event_code, context, detected_at) values
  ('auth_failure', 'warning', 'f0000000-0000-4000-8000-000000000001', 'retention-old', '{}'::jsonb, now() - interval '12 months 1 day'),
  ('auth_failure', 'warning', 'f0000000-0000-4000-8000-000000000001', 'retention-new', '{}'::jsonb, now() - interval '11 months');

-- ---------------------------------------------------------------------------
-- Permisos y programación.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.purge_expired_data(boolean, timestamptz)', 'execute'), 'la limpieza no es invocable desde la app');
select ok(exists (select 1 from cron.job where jobname = 'purge-expired-data' and schedule = '30 3 * * *'), 'la limpieza está programada a diario a las 03:30 UTC');

-- ---------------------------------------------------------------------------
-- Simulación: cuenta sin borrar.
-- ---------------------------------------------------------------------------
create temporary table retention_dry on commit drop as select private.purge_expired_data(true) as result;
select ok((select (result ->> 'dry_run')::boolean from retention_dry), 'la simulación lo indica');
select ok((select (result ->> 'orders')::integer from retention_dry) >= 1, 'la simulación cuenta el pedido antiguo');
select ok((select (result ->> 'reward_notifications')::integer from retention_dry) >= 2, 'la simulación cuenta los correos antiguos');
select ok(exists (select 1 from public.orders where id = 'f3000000-0000-4000-8000-000000000001'), 'la simulación no borra nada');

-- ---------------------------------------------------------------------------
-- Limpieza real.
-- ---------------------------------------------------------------------------
create temporary table retention_run on commit drop as select private.purge_expired_data() as result;
select ok(not (select (result ->> 'dry_run')::boolean from retention_run), 'la limpieza real lo indica');

select ok(not exists (select 1 from public.orders where id = 'f3000000-0000-4000-8000-000000000001'), 'pedido de hace 12 meses y 1 día: se borra');
select ok(not exists (select 1 from public.order_items where order_id = 'f3000000-0000-4000-8000-000000000001'), 'con sus líneas');
select ok(exists (select 1 from public.orders where id = 'f3000000-0000-4000-8000-000000000002'), 'pedido de hace menos de 12 meses: se conserva');
select ok(exists (select 1 from public.orders where id = 'f3000000-0000-4000-8000-000000000003'), 'un pedido en curso nunca se borra, aunque sea antiguo');

select results_eq(
  $$select count(*)::integer from private.order_code_attempts where user_id = 'f1000000-0000-4000-8000-000000000001'$$,
  array[1],
  'intentos del código: sólo queda el de hace 29 días'
);
select ok(not exists (select 1 from public.stamp_sessions where id = 'f3000000-0000-4000-8000-000000000011'), 'solicitud caducada hace 31 días: se borra');
select ok(exists (select 1 from public.stamp_sessions where id = 'f3000000-0000-4000-8000-000000000012'), 'solicitud caducada hace 29 días: se conserva');
select results_eq(
  $$select method from private.stamp_validation_attempts where employee_id = 'f2000000-0000-4000-8000-000000000001'$$,
  array['qr'::text],
  'intentos de validación del equipo: sólo queda el de hace 29 días'
);
select results_eq(
  $$select status from public.reward_notifications where customer_card_id = 'f4000000-0000-4000-8000-000000000002' order by reward_sequence$$,
  array['pending'::text, 'sent'::text],
  'correos: se borran enviados y fallidos de más de 90 días; nunca los pendientes'
);
select ok(not exists (select 1 from private.security_alerts where event_code = 'retention-old'), 'alerta de hace 12 meses y 1 día: se borra');
select ok(exists (select 1 from private.security_alerts where event_code = 'retention-new'), 'alerta de hace 11 meses: se conserva');

-- ---------------------------------------------------------------------------
-- Cuenta borrada: sus pedidos pierden nota y nombre en ese momento.
-- ---------------------------------------------------------------------------
insert into public.orders (id, business_id, customer_id, order_number, service_date, table_label, status, total_cents, note, guest_name) values
  ('f3000000-0000-4000-8000-000000000031', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 4, current_date, 'Mesa 3', 'served', 250, 'Sin gluten, soy celíaca', 'Marta');
delete from auth.users where id = 'f1000000-0000-4000-8000-000000000002';
select results_eq(
  $$select customer_id, note, guest_name, table_label, total_cents from public.orders where id = 'f3000000-0000-4000-8000-000000000031'$$,
  $$values (null::uuid, null::text, null::text, 'Mesa 3'::text, 250)$$,
  'al borrar la cuenta, el pedido se conserva sin cliente, sin nota y sin nombre'
);

-- Un cambio normal de estado no toca la nota.
update public.orders set status = 'served' where id = 'f3000000-0000-4000-8000-000000000002';
select is((select note from public.orders where id = 'f3000000-0000-4000-8000-000000000002'), 'reciente', 'actualizar un pedido con cliente no borra su nota');

-- El trigger sólo actúa al perder el cliente.
select ok(exists (select 1 from pg_trigger where tgname = 'orders_scrub_on_customer_deleted' and tgrelid = 'public.orders'::regclass), 'existe el trigger de limpieza al borrar la cuenta');
select ok(not has_function_privilege('authenticated', 'private.scrub_orphaned_order()', 'execute'), 'la función del trigger no es invocable desde la app');

-- La simulación posterior ya no encuentra lo borrado.
select is((select (private.purge_expired_data(true) ->> 'security_alerts')::integer), 0, 'tras la limpieza no quedan alertas caducadas');
select is((select (private.purge_expired_data(true) ->> 'order_code_attempts')::integer), 0, 'ni intentos caducados');

select * from finish();
rollback;

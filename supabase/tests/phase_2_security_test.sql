begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'phase2-employee@spirit.test'),
  ('91000000-0000-4000-8000-000000000002', 'phase2-other@spirit.test');

insert into public.businesses (id, name, active)
values ('92000000-0000-4000-8000-000000000001', 'Spirit Phase 2 Test', true);

insert into public.business_members (id, business_id, user_id, role, active) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'employee', true),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'employee', true);

insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
select '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'code', false
from generate_series(1, 8);
select results_eq(
  $$select count(*) from private.security_alerts where actor_id = '91000000-0000-4000-8000-000000000001' and event_code = 'employee_code_validation_8_per_minute'$$,
  array[1::bigint],
  'ocho intentos manuales crean una alerta warning'
);

insert into private.stamp_validation_attempts (employee_id, business_id, method, success)
values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'code', false),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'code', false);
select results_eq(
  $$select severity from private.security_alerts where actor_id = '91000000-0000-4000-8000-000000000001' and event_code = 'employee_code_validation_10_per_minute'$$,
  array['critical'::text],
  'diez intentos crean una alerta crítica'
);
select throws_ok(
  $$insert into private.stamp_validation_attempts (employee_id, business_id, method, success) values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'code', false)$$,
  'P0001', 'rate_limited',
  'el intento once se rechaza atómicamente'
);
select results_eq(
  $$select count(*) from private.stamp_validation_attempts where employee_id = '91000000-0000-4000-8000-000000000001'$$,
  array[10::bigint],
  'el intento rechazado no deja una fila parcial'
);
select lives_ok(
  $$insert into private.stamp_validation_attempts (employee_id, business_id, method, success) values ('91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'code', false)$$,
  'el límite está aislado por empleado'
);

select * from finish();
rollback;

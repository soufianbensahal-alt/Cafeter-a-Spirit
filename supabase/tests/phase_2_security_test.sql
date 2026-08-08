begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'phase2-employee@spirit.test'),
  ('91000000-0000-4000-8000-000000000002', 'phase2-other@spirit.test');

insert into public.businesses (id, name, active)
values ('92000000-0000-4000-8000-000000000001', 'Spirit Phase 2 Test', true);

insert into public.business_members (id, business_id, user_id, role, active) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'employee', true),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'employee', true);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '91000000-0000-4000-8000-000000000001',
  'aal', 'aal1',
  'session_id', '94000000-0000-4000-8000-000000000001'
)::text, true);
select results_eq(
  $$select status from public.start_privileged_business_session('92000000-0000-4000-8000-000000000001')$$,
  array['not_authorized'::text],
  'AAL1 no puede iniciar una sesión privilegiada'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '91000000-0000-4000-8000-000000000001',
  'aal', 'aal2',
  'session_id', '94000000-0000-4000-8000-000000000001'
)::text, true);
select results_eq(
  $$select status from public.start_privileged_business_session('92000000-0000-4000-8000-000000000001')$$,
  array['active'::text],
  'AAL2 y membresía activa inician la sesión privilegiada'
);
select ok(
  (select expires_at <= started_at + interval '8 hours' from private.privileged_business_sessions where session_id = '94000000-0000-4000-8000-000000000001'),
  'la duración absoluta no supera 8 horas'
);
select ok(
  private.is_active_business_member('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  'la sesión vigente autoriza al empleado'
);
select results_eq(
  $$select status from public.touch_privileged_business_session('92000000-0000-4000-8000-000000000001')$$,
  array['active'::text],
  'la actividad renueva únicamente el tiempo de inactividad'
);
select ok(
  public.end_privileged_business_session('92000000-0000-4000-8000-000000000001'),
  'el cierre explícito invalida la sesión'
);
select isnt(
  private.is_active_business_member('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  true,
  'una sesión finalizada no autoriza operaciones'
);
select results_eq(
  $$select status from public.start_privileged_business_session('92000000-0000-4000-8000-000000000001')$$,
  array['expired'::text],
  'la misma sesión Auth no puede reabrirse después de cerrarse'
);

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
select ok(
  not has_function_privilege('anon', 'public.start_privileged_business_session(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.start_privileged_business_session(uuid)', 'execute'),
  'las RPC de sesión privilegiada requieren authenticated'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.privileged_business_sessions'::regclass),
  'RLS está activa en el registro privado de sesiones'
);

select * from finish();
rollback;

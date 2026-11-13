begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function pg_temp.set_test_auth(p_user_id uuid, p_anonymous boolean default false)
returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'aal', 'aal1',
    'is_anonymous', p_anonymous,
    'session_id', gen_random_uuid()
  )::text, true)
$$;

-- Prefijo 9a…/9b… exclusivo de este fichero.
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('9a000000-0000-4000-8000-000000000001', 'reconsent-old@spirit.test', false, '{"privacy_consent":true,"privacy_policy_version":"2026-08-05"}'),
  ('9a000000-0000-4000-8000-000000000002', 'reconsent-none@spirit.test', false, '{}'),
  ('9b000000-0000-4000-8000-000000000001', null, true, '{}');

select ok(not has_function_privilege('anon', 'public.accept_privacy_policy(text)', 'execute'), 'anon no puede aceptar');
select ok(has_function_privilege('authenticated', 'public.accept_privacy_policy(text)', 'execute'), 'authenticated sí');
select is((select policy_version from public.privacy_consents where user_id = '9a000000-0000-4000-8000-000000000001'), '2026-08-05', 'el alta registró su versión');

set local role authenticated;

select pg_temp.set_test_auth('9a000000-0000-4000-8000-000000000001');
select results_eq(
  $$select policy_version from public.privacy_consents order by policy_version desc limit 1$$,
  array['2026-08-05'::text],
  'el usuario lee su última versión aceptada'
);
select is(public.accept_privacy_policy('2027-01-15'), 'ok', 'acepta la versión nueva');
select results_eq(
  $$select policy_version, source from public.privacy_consents order by policy_version$$,
  $$values ('2026-08-05'::text, 'customer_signup'::text), ('2027-01-15'::text, 'login_reconsent'::text)$$,
  'conserva la aceptación anterior y añade la nueva como reconsentimiento'
);
select is(public.accept_privacy_policy('2027-01-15'), 'ok', 'aceptar dos veces la misma versión no falla');
select results_eq($$select count(*)::integer from public.privacy_consents$$, array[2], 'ni la duplica');
select is(public.accept_privacy_policy('enero'), 'invalid_version', 'una versión con otro formato se rechaza');

-- Sin ninguna aceptación previa (p. ej. cuenta creada a mano).
select pg_temp.set_test_auth('9a000000-0000-4000-8000-000000000002');
select is_empty($$select 1 from public.privacy_consents$$, 'no ve aceptaciones de otros');
select is(public.accept_privacy_policy('2026-08-05'), 'ok', 'puede aceptar la versión actual');

-- Invitado.
select pg_temp.set_test_auth('9b000000-0000-4000-8000-000000000001', true);
select is(public.accept_privacy_policy('2026-08-05'), 'guest_not_allowed', 'un invitado no registra consentimiento');

select * from finish();
rollback;

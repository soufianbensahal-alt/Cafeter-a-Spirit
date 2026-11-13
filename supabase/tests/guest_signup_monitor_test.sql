begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.set_test_auth(p_user_id uuid, p_aal text default 'aal2')
returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'aal', p_aal,
    'session_id', gen_random_uuid()
  )::text, true)
$$;

-- Prefijo e0…/e1…/e2… exclusivo de este fichero.
insert into public.businesses (id, name, active) values
  ('e0000000-0000-4000-8000-000000000001', 'Monitor Test', true),
  ('e0000000-0000-4000-8000-000000000002', 'Monitor Other', true);

insert into auth.users (id, email) values
  ('e2000000-0000-4000-8000-000000000001', 'monitor-employee@spirit.test'),
  ('e2000000-0000-4000-8000-000000000002', 'monitor-manager@spirit.test'),
  ('e2000000-0000-4000-8000-000000000003', 'monitor-owner@spirit.test');

insert into public.business_members (business_id, user_id, role, active) values
  ('e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'employee', true),
  ('e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'manager', true),
  ('e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'owner', true);

-- Referencia: lo que ya hubiera hoy en la base local (p. ej. E2E).
create temporary table monitor_baseline on commit drop as
select coalesce(count(*) filter (where (created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date), 0)::integer as today_guests
from auth.users where is_anonymous;

insert into auth.users (id, email, is_anonymous, created_at) values
  -- Hoy: dos invitados, uno pide en este local.
  ('e1000000-0000-4000-8000-000000000001', null, true, now()),
  ('e1000000-0000-4000-8000-000000000002', null, true, now()),
  -- Hace 3 días: uno que pide en OTRO local (no cuenta como pedido aquí).
  ('e1000000-0000-4000-8000-000000000003', null, true, now() - interval '3 days'),
  -- Hace 20 días: fuera de la ventana de 14.
  ('e1000000-0000-4000-8000-000000000004', null, true, now() - interval '20 days'),
  -- Registrado hoy: no es invitado.
  ('e1000000-0000-4000-8000-000000000005', 'monitor-registered@spirit.test', false, now());

insert into public.orders (business_id, customer_id, order_number, service_date, table_label, status, total_cents, guest_name) values
  ('e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, (now() at time zone 'Europe/Madrid')::date, 'Barra', 'served', 250, 'Ana'),
  ('e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 2, (now() at time zone 'Europe/Madrid')::date, 'Barra', 'served', 250, 'Ana'),
  ('e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 1, (now() at time zone 'Europe/Madrid')::date - 3, 'Barra', 'served', 250, 'Bea');

grant select on monitor_baseline to authenticated;

select ok(not has_function_privilege('anon', 'public.get_guest_signups_by_day(uuid)', 'execute'), 'anon no puede consultar la vigilancia');
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_guest_signups_by_day(uuid)'::regprocedure),
  'SECURITY DEFINER con search_path vacío'
);

set local role authenticated;

select pg_temp.set_test_auth('e2000000-0000-4000-8000-000000000001');
select throws_ok($$select * from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'un employee no ve la vigilancia');

select pg_temp.set_test_auth('e2000000-0000-4000-8000-000000000002', 'aal1');
select throws_ok($$select * from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'un manager sin AAL2 tampoco');

select pg_temp.set_test_auth('e2000000-0000-4000-8000-000000000002');
select throws_ok($$select * from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000002')$$, '42501', 'not_authorized', 'ni la de otro local');

select results_eq(
  $$select count(*)::integer from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001')$$,
  array[14],
  'catorce días, también los que no tienen invitados'
);
select results_eq(
  $$select day from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001') limit 1$$,
  $$values ((now() at time zone 'Europe/Madrid')::date)$$,
  'el primero es hoy (Madrid), del más reciente al más antiguo'
);
select is(
  (select guests from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001') where day = (now() at time zone 'Europe/Madrid')::date)
    - (select today_guests from monitor_baseline),
  2,
  'hoy suma los dos invitados nuevos y no el registrado'
);
select ok(
  (select guests_with_orders from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001') where day = (now() at time zone 'Europe/Madrid')::date) >= 1,
  'el invitado que pidió aquí cuenta una vez aunque tenga dos pedidos'
);
select results_eq(
  $$select guests, guests_with_orders from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001') where day = (now() at time zone 'Europe/Madrid')::date - 3$$,
  $$values (1, 0)$$,
  'hace 3 días: un invitado que no pidió en este local'
);
select is_empty(
  $$select 1 from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001') where day = (now() at time zone 'Europe/Madrid')::date - 20$$,
  'lo de hace 20 días queda fuera de la ventana'
);

select pg_temp.set_test_auth('e2000000-0000-4000-8000-000000000003');
select results_eq(
  $$select count(*)::integer from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001')$$,
  array[14],
  'el owner también la ve'
);

select pg_temp.set_test_auth('e1000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select * from public.get_guest_signups_by_day('e0000000-0000-4000-8000-000000000001')$$, '42501', 'not_authorized', 'un invitado no la ve');

select * from finish();
rollback;

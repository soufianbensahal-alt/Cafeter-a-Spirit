begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(has_function_privilege('anon', 'public.get_public_loyalty_program()', 'execute'), 'se puede consultar sin sesión (anon)');
select ok(has_function_privilege('authenticated', 'public.get_public_loyalty_program()', 'execute'), 'y con sesión');
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_public_loyalty_program()'::regprocedure),
  'SECURITY DEFINER con search_path vacío'
);
select is(
  (select pg_get_function_result('public.get_public_loyalty_program()'::regprocedure)),
  'TABLE(stamps_required integer, reward_description text)',
  'devuelve sólo stamps_required y reward_description'
);

-- Programa de prueba: el activo del local es el que cuenta.
update public.loyalty_programs set active = false
where business_id = (select id from public.businesses where name = 'Cafetería Spirit - Montcada');
insert into public.loyalty_programs (business_id, name, stamps_required, reward_description, active)
select id, 'Programa público de prueba', 8, 'Café de prueba', true from public.businesses where name = 'Cafetería Spirit - Montcada';

set local role anon;
select results_eq(
  $$select stamps_required, reward_description from public.get_public_loyalty_program()$$,
  $$values (8, 'Café de prueba'::text)$$,
  'sin sesión devuelve los sellos y la recompensa del programa activo'
);
select results_eq($$select count(*)::integer from public.get_public_loyalty_program()$$, array[1], 'una sola fila');
select throws_ok($$select * from public.loyalty_programs$$, '42501', null, 'anon sigue sin leer la tabla directamente');

reset role;
update public.loyalty_programs set active = false where name = 'Programa público de prueba';
set local role anon;
select is_empty($$select 1 from public.get_public_loyalty_program()$$, 'sin programa activo no devuelve nada');

reset role;
update public.loyalty_programs set active = true where name = 'Programa público de prueba';
update public.businesses set active = false where name = 'Cafetería Spirit - Montcada';
set local role anon;
select is_empty($$select 1 from public.get_public_loyalty_program()$$, 'con el local inactivo no devuelve nada');

select * from finish();
rollback;

do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    'public.get_own_stamp_history(uuid,integer,timestamptz)'::regprocedure,
    'public.get_business_stamp_history_filtered(uuid,integer,timestamptz,timestamptz,timestamptz,text,text,text)'::regprocedure
  ]
  loop
    select pg_catalog.pg_get_functiondef(v_function::oid) into v_definition;
    v_definition := pg_catalog.replace(
      v_definition,
      'pg_catalog.least(pg_catalog.greatest',
      'least(greatest'
    );
    execute v_definition;
  end loop;
end;
$$;

comment on function public.get_own_stamp_history(uuid, integer, timestamptz) is
  'Historial paginado visible sólo para el propietario de la tarjeta indicada. Límite normalizado entre 1 y 50.';

comment on function public.get_business_stamp_history_filtered(uuid, integer, timestamptz, timestamptz, timestamptz, text, text, text) is
  'Historial paginado y filtrable visible sólo para miembros activos del negocio indicado. Límite normalizado entre 1 y 50.';

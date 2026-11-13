-- Reconsentimiento de la política de privacidad.
--
-- La app compara la última versión aceptada (privacy_consents, que el usuario
-- ya puede leer por RLS) con PRIVACY_POLICY_VERSION. Si es anterior, o no hay
-- ninguna, muestra la política al iniciar sesión y pide aceptarla para
-- continuar; la aceptación queda registrada aquí con origen «login_reconsent».

alter table public.privacy_consents drop constraint privacy_consents_source_check;
alter table public.privacy_consents add constraint privacy_consents_source_check
  check (source = any (array['customer_signup', 'profile_update', 'login_reconsent']));

create function public.accept_privacy_policy(p_version text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version text := pg_catalog.btrim(coalesce(p_version, ''));
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  -- Los invitados no tienen cuenta ni consentimiento propio.
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    return 'guest_not_allowed';
  end if;

  if v_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return 'invalid_version';
  end if;

  insert into public.privacy_consents (user_id, policy_version, source)
  values (v_user_id, v_version, 'login_reconsent')
  on conflict (user_id, policy_version) do nothing;

  return 'ok';
end;
$$;

revoke all on function public.accept_privacy_policy(text) from public, anon;
grant execute on function public.accept_privacy_policy(text) to authenticated;

comment on function public.accept_privacy_policy(text) is
  'Registra la aceptación de una versión de la política de privacidad por el usuario actual (no invitados).';

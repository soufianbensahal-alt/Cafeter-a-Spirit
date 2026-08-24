alter table public.profiles
add column keep_session_signed_in boolean not null default true;

grant update (keep_session_signed_in) on table public.profiles to authenticated;

comment on column public.profiles.keep_session_signed_in is
  'Preferencia por usuario. Si es true, la aplicación conserva y renueva la sesión hasta un cierre manual o una revocación de seguridad.';

insert into public.businesses (id, name, active)
values ('00000000-0000-4000-8000-000000000001', 'Cafetería Spirit', true)
on conflict (id) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();

insert into public.loyalty_programs (
  id,
  business_id,
  name,
  description,
  stamps_required,
  reward_description,
  active
)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Tarjeta Café Spirit',
  'Programa de fidelización de Cafetería Spirit.',
  10,
  'Café gratuito',
  true
)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    stamps_required = excluded.stamps_required,
    reward_description = excluded.reward_description,
    active = excluded.active,
    updated_at = now();

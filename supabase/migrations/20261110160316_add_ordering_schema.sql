-- Pedidos sin pago online (piloto cerrado). El cliente paga en el local.
-- Las escrituras se realizan exclusivamente mediante RPC SECURITY DEFINER
-- (add_ordering_rpcs). Ningún rol web recibe INSERT, UPDATE ni DELETE.

-- ---------------------------------------------------------------------------
-- Productos: fuente de verdad de precios. Se sincroniza desde el catálogo
-- estático con scripts/sync-products.mjs.
-- ---------------------------------------------------------------------------
create table public.products (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 120),
  category_id text not null check (category_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_es text not null check (char_length(btrim(name_es)) between 1 and 120),
  name_ca text not null check (char_length(btrim(name_ca)) between 1 and 120),
  price_cents integer not null check (price_cents > 0 and price_cents <= 100000),
  sort_order integer not null default 0,
  in_catalog boolean not null default true,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

comment on column public.products.in_catalog is
  'Controlado por la sincronización del catálogo. false = retirado de la carta.';
comment on column public.products.is_available is
  'Controlado por el equipo (agotado hoy). La sincronización nunca lo modifica.';

create index products_business_category_idx
  on public.products (business_id, category_id, sort_order);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Configuración de pedidos por negocio.
-- ---------------------------------------------------------------------------
create table public.business_ordering_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  ordering_enabled boolean not null default false,
  pilot_only boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.business_ordering_settings.pilot_only is
  'true = sólo ordering_pilot_members pueden pedir. false = abierto a cualquier cliente autenticado.';

create trigger business_ordering_settings_set_updated_at
before update on public.business_ordering_settings
for each row execute function private.set_updated_at();

insert into public.business_ordering_settings (business_id)
select business.id from public.businesses as business
on conflict (business_id) do nothing;

create table public.ordering_pilot_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index ordering_pilot_members_user_idx on public.ordering_pilot_members (user_id);

-- Código del día: nunca legible por roles web. 4 cifras no justifican un hash
-- (10.000 combinaciones); la protección es el límite de intentos por usuario.
create table private.business_order_codes (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at)
);

create table private.order_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  success boolean not null default false,
  attempted_at timestamptz not null default clock_timestamp()
);

create index order_code_attempts_rate_idx
  on private.order_code_attempts (user_id, business_id, attempted_at desc)
  where not success;

create table private.order_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_date date not null,
  last_number integer not null check (last_number > 0),
  primary key (business_id, service_date)
);

-- ---------------------------------------------------------------------------
-- Pedidos.
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  -- SET NULL: borrar la cuenta elimina el vínculo personal pero conserva el
  -- registro contable del negocio.
  customer_id uuid references auth.users (id) on delete set null,
  order_number integer not null check (order_number > 0),
  service_date date not null,
  table_label text not null check (
    char_length(table_label) between 1 and 20 and table_label = btrim(table_label)
  ),
  -- Reservado para la futura tabla de mesas con token QR. La FK se añadirá
  -- en esa migración; hoy siempre es NULL y table_label sigue siendo obligatorio.
  table_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'preparing', 'served', 'rejected', 'cancelled')),
  payment_status text not null default 'pay_at_venue'
    check (payment_status in ('pay_at_venue', 'paid', 'failed', 'refunded')),
  total_cents integer not null check (total_cents > 0),
  note text check (note is null or char_length(note) between 1 and 200),
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 200),
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  served_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  unique (business_id, service_date, order_number),
  unique (id, business_id),
  check (status <> 'rejected' or rejection_reason is not null)
);

comment on column public.orders.table_id is
  'Reservado para mesas con token QR. Nullable; sin FK hasta que exista la tabla de mesas.';

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_business_created_idx on public.orders (business_id, created_at desc);
create index orders_business_active_idx
  on public.orders (business_id, created_at)
  where status in ('pending', 'accepted', 'preparing');
create index orders_customer_active_idx
  on public.orders (customer_id, business_id)
  where status in ('pending', 'accepted', 'preparing');
create index orders_handled_by_idx on public.orders (handled_by);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  business_id uuid not null,
  product_id text not null,
  position integer not null check (position > 0),
  quantity integer not null check (quantity between 1 and 10),
  unit_price_cents integer not null check (unit_price_cents > 0),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 120),
  line_total_cents integer not null check (line_total_cents = unit_price_cents * quantity),
  unique (order_id, product_id),
  foreign key (order_id, business_id)
    references public.orders (id, business_id) on delete cascade,
  foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict
);

create index order_items_product_idx on public.order_items (business_id, product_id);

-- ---------------------------------------------------------------------------
-- RLS y permisos.
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.business_ordering_settings enable row level security;
alter table public.ordering_pilot_members enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table private.business_order_codes enable row level security;
alter table private.order_code_attempts enable row level security;
alter table private.order_counters enable row level security;

revoke all on table public.products from public, anon, authenticated;
revoke all on table public.business_ordering_settings from public, anon, authenticated;
revoke all on table public.ordering_pilot_members from public, anon, authenticated;
revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.order_items from public, anon, authenticated;
revoke all on table private.business_order_codes from public, anon, authenticated;
revoke all on table private.order_code_attempts from public, anon, authenticated;
revoke all on sequence private.order_code_attempts_id_seq from public, anon, authenticated;
revoke all on table private.order_counters from public, anon, authenticated;

grant select on table public.products to authenticated;
grant select on table public.business_ordering_settings to authenticated;
grant select on table public.ordering_pilot_members to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.order_items to authenticated;

create policy "products_select_active_business"
on public.products
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.businesses as business
    where business.id = products.business_id and business.active
  )
);

create policy "business_ordering_settings_select_members"
on public.business_ordering_settings
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.business_members as membership
    where membership.business_id = business_ordering_settings.business_id
      and membership.user_id = (select auth.uid())
      and membership.active
  )
);

create policy "ordering_pilot_members_select_own_or_members"
on public.ordering_pilot_members
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.business_members as membership
      where membership.business_id = ordering_pilot_members.business_id
        and membership.user_id = (select auth.uid())
        and membership.active
    )
  )
);

create policy "orders_select_customer_or_member"
on public.orders
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.business_members as membership
      where membership.business_id = orders.business_id
        and membership.user_id = (select auth.uid())
        and membership.active
    )
  )
);

create policy "order_items_select_customer_or_member"
on public.order_items
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.orders as parent
    where parent.id = order_items.order_id
      and (
        parent.customer_id = (select auth.uid())
        or exists (
          select 1 from public.business_members as membership
          where membership.business_id = parent.business_id
            and membership.user_id = (select auth.uid())
            and membership.active
        )
      )
  )
);

-- Realtime: el cliente filtra por customer_id y el equipo por business_id.
-- RLS se aplica igualmente a los eventos de Postgres Changes. Las líneas se
-- consultan de nuevo al recibir el evento; order_items no se publica.
alter publication supabase_realtime add table public.orders;

comment on table public.orders is
  'Pedidos sin pago online. Sólo create_order / update_order_status / cancel_own_order escriben aquí.';
comment on table public.order_items is
  'Líneas con precio y nombre congelados en el momento del pedido. Inmutables desde el frontend.';

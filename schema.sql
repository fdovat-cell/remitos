-- ===================================================================
-- Esquema para Remitos PelSAS
-- Correr esto una sola vez en Supabase → SQL Editor → New query → Run
-- (mismo proyecto que usa buscador-v2)
-- ===================================================================

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  direccion text,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists remitos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  fecha date not null default current_date,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists remito_items (
  id uuid primary key default gen_random_uuid(),
  remito_id uuid not null references remitos(id) on delete cascade,
  codigo text,
  descripcion text not null,
  cantidad numeric not null,
  precio_unitario numeric not null default 0,
  subtotal numeric not null default 0
);

create index if not exists idx_remitos_cliente on remitos(cliente_id);
create index if not exists idx_remito_items_remito on remito_items(remito_id);

-- ===================================================================
-- Permisos: la app usa la clave "anon" desde el navegador (como
-- buscador-v2), sin login. Esto habilita lectura/escritura para esa
-- clave. Como sos el único usuario, es el mismo esquema de confianza
-- que ya usás en tus otras apps.
-- ===================================================================

alter table clientes enable row level security;
alter table remitos enable row level security;
alter table remito_items enable row level security;

create policy "anon_all_clientes" on clientes
  for all using (true) with check (true);

create policy "anon_all_remitos" on remitos
  for all using (true) with check (true);

create policy "anon_all_remito_items" on remito_items
  for all using (true) with check (true);

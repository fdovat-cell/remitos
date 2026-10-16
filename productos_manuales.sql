-- Artículos cargados a mano en los remitos, para reutilizarlos en próximos remitos.
-- Ejecutar una sola vez en Supabase > SQL Editor.

create table if not exists public.productos_manuales (
  id uuid primary key default gen_random_uuid(),
  codigo text default '',
  descripcion text not null,
  precio numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Evita duplicados por nombre (sin distinguir mayúsculas).
create unique index if not exists productos_manuales_descripcion_uniq
  on public.productos_manuales (lower(descripcion));

-- Mismo esquema de acceso que usan las otras tablas de la app (clave anon).
alter table public.productos_manuales enable row level security;

drop policy if exists "productos_manuales_all" on public.productos_manuales;
create policy "productos_manuales_all"
  on public.productos_manuales
  for all
  to anon
  using (true)
  with check (true);

-- =============================================================
--  Red de Centros de Acopio — Esquema Supabase (PostgreSQL)
--  Ejecutar completo en: Supabase > SQL Editor > New query > Run
--  Idempotente-ish: usa "if not exists" donde es posible.
-- =============================================================

create extension if not exists "uuid-ossp";

-- ---------- ENUMS ----------
do $$ begin
  create type categoria as enum
    ('ALIMENTOS','AGUA','HIGIENE','BEBES','MEDICAMENTOS','ROPA','LIMPIEZA','HERRAMIENTAS','OTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_centro as enum ('ACTIVO','LLENO','CERRADO');
exception when duplicate_object then null; end $$;

do $$ begin
  -- NECESITA = déficit del centro · SOBRA = excedente disponible para enviar
  create type tipo_item as enum ('NECESITA','SOBRA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_transferencia as enum
    ('ABIERTA','ACEPTADA','EN_CAMINO','COMPLETADA','CANCELADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rol_perfil as enum ('VOLUNTARIO','ORGANIZADOR','EMPRESA');
exception when duplicate_object then null; end $$;

-- ---------- PERFILES (extiende auth.users de Supabase) ----------
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  telefono    text,
  email       text,
  rol         rol_perfil not null default 'VOLUNTARIO',
  empresa     text,
  creado_en   timestamptz default now()
);

-- ---------- CENTROS DE ACOPIO ----------
create table if not exists centros (
  id                    uuid primary key default uuid_generate_v4(),
  nombre                text not null,
  organizador_id        uuid references perfiles(id) on delete set null,
  organizador_nombre    text not null,
  organizador_telefono  text not null,   -- oculto al público anónimo (ver vista)
  direccion             text not null,
  ciudad                text,
  estado_geo            text,            -- p.ej. 'La Guaira', 'Yaracuy', 'Distrito Capital'
  lat                   double precision not null,
  lng                   double precision not null,
  horario               jsonb,           -- [{ "dia":"lun-vie", "abre":"08:00", "cierra":"18:00" }]
  estado                estado_centro not null default 'ACTIVO',
  notas                 text,
  creado_en             timestamptz default now(),
  actualizado_en        timestamptz default now()
);

-- ---------- ITEMS POR CENTRO (necesita / sobra) ----------
create table if not exists items_centro (
  id              uuid primary key default uuid_generate_v4(),
  centro_id       uuid not null references centros(id) on delete cascade,
  tipo            tipo_item not null,
  categoria       categoria not null,
  descripcion     text not null,
  cantidad        numeric,
  unidad          text,
  prioridad       smallint default 2,   -- 1 alta · 2 media · 3 baja
  vence_en        date,
  resuelto        boolean default false,
  actualizado_en  timestamptz default now()
);
create index if not exists idx_items_centro on items_centro(centro_id, tipo, categoria);

-- ---------- TRANSFERENCIAS ENTRE CENTROS ----------
create table if not exists transferencias (
  id                  uuid primary key default uuid_generate_v4(),
  centro_origen_id    uuid references centros(id) on delete set null, -- el que envía (tiene SOBRA)
  centro_destino_id   uuid references centros(id) on delete set null, -- el que NECESITA
  categoria           categoria not null,
  descripcion         text not null,
  cantidad            numeric,
  unidad              text,
  estado              estado_transferencia not null default 'ABIERTA',
  creado_por          uuid references perfiles(id),
  creado_en           timestamptz default now(),
  actualizado_en      timestamptz default now()
);

-- ---------- DONACIONES (quiero donar / soy empresa) ----------
create table if not exists donaciones (
  id                 uuid primary key default uuid_generate_v4(),
  es_empresa         boolean default false,
  donante_nombre     text,    -- OCULTO al público
  donante_contacto   text,    -- OCULTO al público (solo organizador del centro sugerido)
  empresa            text,
  categoria          categoria,
  descripcion        text not null,
  cantidad           numeric,
  unidad             text,
  lat                double precision,
  lng                double precision,
  centro_sugerido_id uuid references centros(id) on delete set null,
  creado_en          timestamptz default now()
);

-- ---------- INSCRIPCIÓN DE VOLUNTARIOS ----------
create table if not exists voluntarios_centro (
  id          uuid primary key default uuid_generate_v4(),
  perfil_id   uuid not null references perfiles(id) on delete cascade,
  centro_id   uuid not null references centros(id) on delete cascade,
  estado      text default 'INSCRITO',
  creado_en   timestamptz default now(),
  unique (perfil_id, centro_id)
);

-- =============================================================
--  VISTA PÚBLICA: centros sin teléfono del organizador
--  (RLS es por fila, no por columna → usamos vista para ocultar el teléfono)
-- =============================================================
create or replace view centros_publicos as
  select id, nombre, direccion, ciudad, estado_geo, lat, lng, horario, estado, notas, creado_en
  from centros
  where estado <> 'CERRADO';

-- =============================================================
--  FUNCIÓN: centros más cercanos a una coordenada (Haversine)
--  Sin PostGIS para que sea replicable en cualquier proyecto free.
-- =============================================================
create or replace function centros_cercanos(
  p_lat double precision,
  p_lng double precision,
  p_limit int default 10
)
returns table (
  id uuid, nombre text, direccion text, ciudad text, estado_geo text,
  lat double precision, lng double precision, horario jsonb,
  estado estado_centro, distancia_km double precision
)
language sql stable as $$
  select c.id, c.nombre, c.direccion, c.ciudad, c.estado_geo,
         c.lat, c.lng, c.horario, c.estado,
         (6371 * acos(
            greatest(-1, least(1,
              cos(radians(p_lat)) * cos(radians(c.lat)) *
              cos(radians(c.lng) - radians(p_lng)) +
              sin(radians(p_lat)) * sin(radians(c.lat))
            ))
         )) as distancia_km
  from centros c
  where c.estado = 'ACTIVO'
  order by distancia_km asc
  limit p_limit;
$$;

-- =============================================================
--  ROW LEVEL SECURITY
--  Repo público + DB compartida → todo write va bloqueado por defecto.
-- =============================================================
alter table perfiles            enable row level security;
alter table centros             enable row level security;
alter table items_centro        enable row level security;
alter table transferencias      enable row level security;
alter table donaciones          enable row level security;
alter table voluntarios_centro  enable row level security;

-- Helper inline: ¿el usuario actual es organizador de este centro?
-- (se usa como subconsulta en las políticas)

-- ----- PERFILES -----
create policy perfiles_select_own on perfiles
  for select using (auth.uid() = id);
create policy perfiles_upsert_own on perfiles
  for insert with check (auth.uid() = id);
create policy perfiles_update_own on perfiles
  for update using (auth.uid() = id);

-- ----- CENTROS -----
-- Lectura completa (incluye teléfono) solo para autenticados (voluntarios/organizadores).
-- El público anónimo lee la vista centros_publicos (sin teléfono).
create policy centros_select_auth on centros
  for select to authenticated using (true);
create policy centros_insert_auth on centros
  for insert to authenticated with check (auth.uid() = organizador_id);
create policy centros_update_owner on centros
  for update to authenticated using (auth.uid() = organizador_id);
create policy centros_delete_owner on centros
  for delete to authenticated using (auth.uid() = organizador_id);

-- ----- ITEMS_CENTRO -----
create policy items_select_public on items_centro
  for select using (true);   -- donantes ven qué se necesita
create policy items_write_owner on items_centro
  for all to authenticated
  using (exists (select 1 from centros c where c.id = items_centro.centro_id and c.organizador_id = auth.uid()))
  with check (exists (select 1 from centros c where c.id = items_centro.centro_id and c.organizador_id = auth.uid()));

-- ----- TRANSFERENCIAS -----
create policy transferencias_select_auth on transferencias
  for select to authenticated using (true);
create policy transferencias_write_owner on transferencias
  for all to authenticated
  using (
    exists (select 1 from centros c where c.id in (transferencias.centro_origen_id, transferencias.centro_destino_id) and c.organizador_id = auth.uid())
  )
  with check (
    exists (select 1 from centros c where c.id in (transferencias.centro_origen_id, transferencias.centro_destino_id) and c.organizador_id = auth.uid())
  );

-- ----- DONACIONES -----
-- Cualquiera (anónimo) puede registrar una intención de donación.
create policy donaciones_insert_any on donaciones
  for insert to anon, authenticated with check (true);
-- Solo el organizador del centro sugerido puede leer el contacto del donante.
create policy donaciones_select_owner on donaciones
  for select to authenticated
  using (exists (select 1 from centros c where c.id = donaciones.centro_sugerido_id and c.organizador_id = auth.uid()));

-- ----- VOLUNTARIOS_CENTRO -----
create policy voluntarios_insert_own on voluntarios_centro
  for insert to authenticated with check (auth.uid() = perfil_id);
create policy voluntarios_select_self_or_owner on voluntarios_centro
  for select to authenticated using (
    auth.uid() = perfil_id
    or exists (select 1 from centros c where c.id = voluntarios_centro.centro_id and c.organizador_id = auth.uid())
  );

-- ----- GRANTS para la vista pública y la función (rol anónimo) -----
grant select on centros_publicos to anon, authenticated;
grant execute on function centros_cercanos(double precision, double precision, int) to anon, authenticated;

-- =============================================================
--  SEED MÍNIMO (opcional) — borrar en producción
-- =============================================================
-- insert into centros (nombre, organizador_nombre, organizador_telefono, direccion, ciudad, estado_geo, lat, lng)
-- values ('Centro Plaza Bolívar La Guaira','Coordinación vecinal','+58...','Av. Soublette','La Guaira','La Guaira',10.6010,-66.9340);

-- =============================================================
--  Malla de Mensajería de Emergencia por Grupos Cerrados
--  Esquema Supabase (PostgreSQL)
--
--  Cómo correrlo:
--    Supabase > SQL Editor > New query > pega este archivo completo > Run.
--    Es idempotente donde es posible (create ... if not exists, enums
--    protegidos con DO/EXCEPTION). Re-ejecutarlo no debe romper nada.
--
--  Modelo: la gente se organiza en GRUPOS cerrados (familia+vecinos, o
--  equipos de rescate). Dentro de un grupo se emiten ALERTAS (víctima
--  atrapada, herido, a salvo, etc.). Cada alerta tiene un historial de
--  estado append-only. Todo el acceso está restringido por RLS a los
--  miembros del grupo.
--
--  De-dup en la nube: las alertas se sincronizan desde dispositivos que
--  pudieron estar offline. El par (grupo_id, codigo_corto) es único, así
--  que el puente de ingesta hará UPSERT ... ON CONFLICT (grupo_id,
--  codigo_corto) DO UPDATE para fusionar reenvíos del mismo evento.
--  (La función RPC 'upsert_alerta' se agregará en el paso del puente.)
-- =============================================================

-- ---------- RESETEO TOTAL (peligroso) ----------
-- Descomentar SOLO para recrear desde cero. BORRA TODOS LOS DATOS.
-- drop schema public cascade;
-- create schema public;
-- grant usage on schema public to anon, authenticated, service_role;

create extension if not exists "uuid-ossp";

-- ---------- ENUMS ----------
-- Tres tipos de grupo: FAMILIA, COMUNIDAD_VECINOS, RESCATE.
do $$ begin
  create type tipo_grupo as enum ('FAMILIA','COMUNIDAD_VECINOS','RESCATE');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------
--  MIGRACIÓN del enum tipo_grupo en una base EXISTENTE
--  (antes era ('FAMILIA_VECINOS','RESCATE')). Ejecuta esto UNA vez en el
--  SQL Editor si tu base ya tenía el enum viejo. No corre dentro de una
--  transacción explícita: ejecútalo como sentencias sueltas.
--
--    -- 1) Renombrar el valor viejo a FAMILIA:
--    alter type tipo_grupo rename value 'FAMILIA_VECINOS' to 'FAMILIA';
--    -- 2) Agregar el nuevo valor COMUNIDAD_VECINOS:
--    alter type tipo_grupo add value if not exists 'COMUNIDAD_VECINOS';
--    -- (RESCATE ya existe; no hay que tocarlo.)
--
--  Tras esto, las filas que tenían 'FAMILIA_VECINOS' quedan como 'FAMILIA'.
-- ----------------------------------------------------------------

do $$ begin
  create type rol_emisor as enum ('VICTIMA','RESCATISTA','FAMILIAR','CENTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_alerta as enum
    ('ABIERTA','EN_ATENCION','RESUELTA','CANCELADA','FALSA_ALARMA');
exception when duplicate_object then null; end $$;

-- ---------- PERFILES (extiende auth.users de Supabase) ----------
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  telefono    text,
  email       text,
  creado_en   timestamptz default now()
);

-- ---------- GRUPOS CERRADOS ----------
create table if not exists grupos (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  tipo        tipo_grupo not null,
  codigo      char(6) unique not null,           -- código de invitación para unirse
  creador_id  uuid references perfiles(id) on delete set null,
  creado_en   timestamptz default now()
);

-- ---------- MIEMBROS DE GRUPO ----------
create table if not exists grupo_miembros (
  id          uuid primary key default uuid_generate_v4(),
  grupo_id    uuid not null references grupos(id) on delete cascade,
  perfil_id   uuid not null references perfiles(id) on delete cascade,
  nombre      text,                              -- snapshot del nombre al unirse
  telefono    text,
  unido_en    timestamptz default now(),
  unique (grupo_id, perfil_id)
);
create index if not exists idx_grupo_miembros_grupo on grupo_miembros(grupo_id);
create index if not exists idx_grupo_miembros_perfil on grupo_miembros(perfil_id);

-- ---------- ALERTAS ----------
create table if not exists alertas (
  id            uuid primary key default uuid_generate_v4(),
  codigo_corto  char(4) not null,                -- id corto del protocolo SMS (base36)
  grupo_id      uuid not null references grupos(id) on delete cascade,
  emisor_id     uuid references perfiles(id) on delete set null,
  rol           rol_emisor,
  caso          text,                            -- código de caso del protocolo (ATR, HER, ...)
  descripcion   text,
  lat           double precision,
  lng           double precision,
  estado        estado_alerta not null default 'ABIERTA',
  creado_en     timestamptz default now(),       -- cuándo ocurrió (en el dispositivo emisor)
  subido_en     timestamptz default now(),       -- cuándo llegó a la nube
  -- De-dup en la nube: un mismo evento reenviado comparte (grupo_id, codigo_corto).
  unique (grupo_id, codigo_corto)
);
create index if not exists idx_alertas_grupo on alertas(grupo_id, estado);

-- ---------- HISTORIAL DE ESTADO (append-only) ----------
create table if not exists alerta_estado_historial (
  id            uuid primary key default uuid_generate_v4(),
  alerta_id     uuid not null references alertas(id) on delete cascade,
  estado        estado_alerta not null,
  cambiado_por  uuid references perfiles(id) on delete set null,
  nota          text,
  creado_en     timestamptz default now()
);
create index if not exists idx_historial_alerta on alerta_estado_historial(alerta_id, creado_en);

-- =============================================================
--  FUNCIÓN es_miembro — rompe la recursión infinita de RLS (42P17)
--  Las políticas de grupos / grupo_miembros / alertas se referenciaban
--  entre sí (subconsultas a grupo_miembros dentro de la policy de
--  grupo_miembros, etc.), lo que provocaba recursión infinita.
--  SECURITY DEFINER hace que la consulta interna NO vuelva a evaluar RLS,
--  cortando el ciclo. Debe declararse ANTES de las políticas que la usan.
-- =============================================================
create or replace function es_miembro(p_grupo uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from grupo_miembros where grupo_id = p_grupo and perfil_id = auth.uid());
$$;
grant execute on function es_miembro(uuid) to anon, authenticated;

-- ---------- buscar_grupo_por_codigo ----------
-- Permite que un NO-miembro resuelva un grupo por su código de invitación para
-- poder unirse. La política RLS de SELECT en `grupos` solo deja ver el grupo a
-- miembros/creador, así que una consulta directa devolvería [] y rompería el
-- flujo de "unirse". SECURITY DEFINER evita RLS y expone solo lo mínimo
-- (id, nombre, tipo) buscando por código en mayúsculas.
create or replace function buscar_grupo_por_codigo(p_codigo text)
returns table (id uuid, nombre text, tipo tipo_grupo)
language sql security definer set search_path = public as $$
  select id, nombre, tipo from grupos where codigo = upper(p_codigo) limit 1;
$$;
grant execute on function buscar_grupo_por_codigo(text) to anon, authenticated;

-- =============================================================
--  ROW LEVEL SECURITY
--  Grupos cerrados: todo el acceso pasa por pertenencia al grupo.
-- =============================================================
alter table perfiles                enable row level security;
alter table grupos                  enable row level security;
alter table grupo_miembros          enable row level security;
alter table alertas                 enable row level security;
alter table alerta_estado_historial enable row level security;

-- =============================================================
--  PERMISOS DE TABLA (necesarios tras recrear el schema)
--  El "drop schema public cascade" borra los grants por defecto que
--  Supabase concede a anon/authenticated. Sin estos GRANTs, RLS nunca
--  llega a evaluarse: el acceso se niega a nivel de permiso de tabla.
--  (RLS sigue siendo la barrera real de seguridad fila-a-fila.)
-- =============================================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ----- PERFILES (propios) -----
create policy perfiles_select_own on perfiles
  for select using (auth.uid() = id);
create policy perfiles_insert_own on perfiles
  for insert with check (auth.uid() = id);
create policy perfiles_update_own on perfiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ----- GRUPOS -----
-- Lectura para autenticados que sean miembros o el creador del grupo.
create policy grupos_select_member on grupos
  for select to authenticated using (creador_id = auth.uid() or es_miembro(id));
-- Crear: el creador debe ser el usuario actual.
create policy grupos_insert_creator on grupos
  for insert to authenticated with check (creador_id = auth.uid());
-- Modificar / borrar: solo el creador.
create policy grupos_update_creator on grupos
  for update to authenticated using (creador_id = auth.uid());
create policy grupos_delete_creator on grupos
  for delete to authenticated using (creador_id = auth.uid());

-- ----- GRUPO_MIEMBROS -----
-- Ver miembros solo si el usuario actual es miembro del mismo grupo.
create policy grupo_miembros_select_comember on grupo_miembros
  for select to authenticated using (perfil_id = auth.uid() or es_miembro(grupo_id));
-- Unirse: el usuario solo puede insertarse a sí mismo.
create policy grupo_miembros_insert_self on grupo_miembros
  for insert to authenticated with check (perfil_id = auth.uid());

-- ----- ALERTAS -----
-- Ver / crear / actualizar para miembros del grupo de la alerta.
create policy alertas_select_member on alertas
  for select to authenticated using (es_miembro(grupo_id));
create policy alertas_insert_member on alertas
  for insert to authenticated with check (es_miembro(grupo_id));
create policy alertas_update_member on alertas
  for update to authenticated using (es_miembro(grupo_id)) with check (es_miembro(grupo_id));

-- ----- ALERTA_ESTADO_HISTORIAL (append-only) -----
-- Ver / insertar para miembros del grupo de la alerta. Sin update/delete.
create policy historial_select_member on alerta_estado_historial
  for select to authenticated using (
    exists (
      select 1 from alertas a
      where a.id = alerta_estado_historial.alerta_id and es_miembro(a.grupo_id)
    )
  );
create policy historial_insert_member on alerta_estado_historial
  for insert to authenticated with check (
    exists (
      select 1 from alertas a
      where a.id = alerta_estado_historial.alerta_id and es_miembro(a.grupo_id)
    )
  );

-- ============================================================
-- 21-crm.sql — Módulo crm: cuentas, contactos, actividades, campos
-- propios, historial, vínculos externos y datos de salud cifrados
-- Esquema del producto (PP-DEC-02, PP-DEC-18, PP-DEC-19). Lo aplica
-- tools/instalar/aplicar.mjs --archivo al activar el módulo, en una
-- transacción. IDEMPOTENTE. Un archivo aplicado no se edita: un cambio va
-- en un archivo nuevo.
--
-- Origen: código nuevo del producto. Patrones de team-portal (solo
-- lectura): pg_trgm en extensions, búsqueda con total y escape de comodines
-- e historial por trigger de la migración 91.
--
-- Requisitos: núcleo 00 a 09 aplicado; ejecutarlo como postgres; pgcrypto
-- en el esquema extensions; Supabase Vault activo (Database → Extensions →
-- supabase_vault); pg_trgm ausente o en extensions. El bloque 0 aborta sin
-- cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                      | Qué                                                       |
--   |-----------------------------|-----------------------------------------------------------|
--   | pg_trgm (extensions)        | índices gin de la búsqueda                                 |
--   | crm_ajustes()               | catálogos de instalacion.ajustes.crm con valores por       |
--   |                             | defecto; semilla de la clave crm solo si falta             |
--   | crm_catalogo(nombre)        | claves de un catálogo (etapas, origenes, tipos_empresa,    |
--   |                             | relaciones)                                                |
--   | crm_perm_explicito(perm)    | permiso en los roles del usuario, sin el atajo de admin    |
--   | crm_cuentas, crm_contactos, | núcleo del CRM; lectura con app_crm, escritura con         |
--   | crm_actividades             | edit_crm, borrado físico solo administrador (actividades:  |
--   |                             | también su autor)                                          |
--   | crm_campos_def              | campos propios por entidad; los escribe un administrador   |
--   | crm_cambios                 | historial; solo lo escribe el trigger crm_registrar_cambio |
--   | crm_vinculos_externos       | hueco para un CRM externo; escribe solo la service role    |
--   | crm_buscar(…)               | búsqueda paginada con total (security invoker, sin salud)  |
--   | crm_salud                   | datos de salud cifrados (pgcrypto + clave en Vault); sin   |
--   |                             | ningún grant para authenticated                            |
--   | crm_consentimientos         | consentimiento informado (Ley 1581 de 2012, Decreto 1377   |
--   |                             | de 2013); sin update salvo revocar, sin delete por la API; |
--   |                             | vigente = el último por created_at                         |
--   | crm_accesos_salud           | registro de cada lectura, escritura o borrado de salud     |
--   | crm_salud_leer/guardar/     | única vía a crm_salud: módulo, permiso explícito,          |
--   | borrar                      | segundo factor (aal2) y registro del acceso                |
--   | bucket crm-consentimientos  | privado, 10 MB, pdf/jpeg/png; ruta <cuenta_id>/<archivo>;  |
--   |                             | lectura edit_crm o ver_salud, subida edit_crm, borrado     |
--   |                             | solo admin                                                 |
--
-- Borrado físico de una cuenta: falla si tiene salud (antes crm_salud_borrar)
-- o consentimientos (se archiva); al borrar una cuenta, contacto o actividad
-- se suprime su historial y sus vínculos externos y queda solo una fila de
-- borrado con id, entidad y autor (Ley 1581 art. 8). Los updates sí guardan
-- antes y después en crm_cambios (retención en docs/seguridad/03-riesgos.md).
--
-- Nada de salud va a crm_cambios, audit_log ni crm_buscar (PP-DEC-19).
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
declare
  v_esquema text;
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '21-crm detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.has_modulo(text)') is null or to_regprocedure('public.puede_ver_app(text)') is null
     or to_regprocedure('public.aplicar_politica_modulo(regclass,text[])') is null
     or to_regclass('public.instalacion') is null then
    raise exception '21-crm detenido: falta 04-instalacion-modulos.sql';
  end if;
  if to_regprocedure('public.auditar_cambio()') is null then
    raise exception '21-crm detenido: falta 02-auditoria.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '21-crm detenido: falta 03-mfa.sql';
  end if;
  if to_regprocedure('public.almacenamiento_disponible()') is null
     or to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception '21-crm detenido: falta 09-storage-base.sql o el esquema storage de Supabase';
  end if;
  if to_regnamespace('extensions') is null then
    raise exception '21-crm detenido: falta el esquema extensions de Supabase';
  end if;
  if to_regprocedure('extensions.pgp_sym_encrypt(text,text,text)') is null
     or to_regprocedure('extensions.pgp_sym_decrypt(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception '21-crm detenido: falta pgcrypto en el esquema extensions (Database → Extensions → pgcrypto, esquema extensions)';
  end if;
  -- create_secret por nombre y no por firma: cambia entre 0.2.x y 0.3.x
  -- (patrón de team-portal, migración 69)
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('vault.secrets') is null
     or not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'vault' and p.proname = 'create_secret') then
    raise exception '21-crm detenido: Supabase Vault no está activo. Actívalo en el panel de Supabase: Database → Extensions → supabase_vault, y vuelve a aplicar este archivo';
  end if;
  select n.nspname into v_esquema
    from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_esquema is not null and v_esquema <> 'extensions' then
    raise exception '21-crm detenido: pg_trgm está instalada en el esquema % y no en extensions', v_esquema;
  end if;
end $$;

-- ============ 1) Extensiones y clave de cifrado ============
create extension if not exists pg_trgm with schema extensions;

-- La clave se crea una vez y nadie la ve: solo la leen las funciones
-- security definer de salud desde vault.decrypted_secrets. Rotarla exige
-- re-cifrar crm_salud (no hay rotación automática). Si falta y crm_salud ya
-- tiene filas, se aborta: una clave nueva no descifra lo que ya existe.
-- Llamada posicional (secreto, nombre, descripción): la admiten 0.2.x y 0.3.x.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crm_salud_clave') then
    if to_regclass('public.crm_salud') is not null then
      if exists (select 1 from public.crm_salud) then
        raise exception '21-crm detenido: falta el secreto crm_salud_clave en Vault y crm_salud tiene datos cifrados con una clave que ya no está. No se crea una clave nueva: restaura el secreto desde la copia de la clave y vuelve a aplicar';
      end if;
    end if;
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crm_salud_clave',
                                'Clave de cifrado de crm_salud (PP-DEC-19). No rotar sin re-cifrar.');
  end if;
end $$;

-- ============ 2) Catálogos en instalacion.ajustes.crm ============
-- etapas: [{clave, nombre, orden, cierre}] con cierre 'ganada', 'perdida' o
-- null; origenes, tipos_empresa y relaciones: listas de claves (texto, o
-- objetos con clave). Una lista que falta o está vacía toma la de defecto.
create or replace function public.crm_ajustes()
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with d as (
    select jsonb_build_object(
      'etapas', jsonb_build_array(
        jsonb_build_object('clave', 'solicitud', 'nombre', 'Solicitud', 'orden', 1, 'cierre', null),
        jsonb_build_object('clave', 'valoracion', 'nombre', 'Valoración', 'orden', 2, 'cierre', null),
        jsonb_build_object('clave', 'propuesta', 'nombre', 'Propuesta', 'orden', 3, 'cierre', null),
        jsonb_build_object('clave', 'activo', 'nombre', 'Activo', 'orden', 4, 'cierre', null),
        jsonb_build_object('clave', 'cerrado', 'nombre', 'Cerrado', 'orden', 5, 'cierre', 'ganada'),
        jsonb_build_object('clave', 'no_continuo', 'nombre', 'No continuó', 'orden', 6, 'cierre', 'perdida')),
      'origenes', '["referido", "redes", "whatsapp", "web", "aliado", "otro"]'::jsonb,
      'tipos_empresa', '["clinica", "eps", "aliado", "proveedor", "empresa"]'::jsonb,
      'relaciones', '["familiar", "responsable", "acudiente", "contacto", "otro"]'::jsonb) as v
  ),
  c as (
    select coalesce((select i.ajustes -> 'crm' from public.instalacion i where i.id = 1), '{}'::jsonb) as v
  )
  select jsonb_object_agg(k, case when jsonb_typeof(c.v -> k) = 'array' and jsonb_array_length(c.v -> k) > 0
                                  then c.v -> k else d.v -> k end)
    from d, c, unnest(array['etapas', 'origenes', 'tipos_empresa', 'relaciones']) k;
$$;

revoke execute on function public.crm_ajustes() from public, anon;
grant execute on function public.crm_ajustes() to authenticated, service_role;

create or replace function public.crm_catalogo(p_nombre text)
returns text[] language sql stable set search_path = public, pg_temp as $$
  select coalesce(array_agg(case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'clave' end), '{}')
    from jsonb_array_elements(coalesce(public.crm_ajustes() -> p_nombre, '[]'::jsonb)) e
   where jsonb_typeof(e) in ('string', 'object');
$$;

revoke execute on function public.crm_catalogo(text) from public, anon;
grant execute on function public.crm_catalogo(text) to authenticated, service_role;

-- Semilla: la clave crm solo si falta (no pisa lo que ajustó la instalación)
update public.instalacion
   set ajustes = ajustes || jsonb_build_object('crm', public.crm_ajustes())
 where id = 1 and not (ajustes ? 'crm');

-- ============ 3) Permiso explícito (PP-DEC-19) ============
-- has_perm da true a un administrador por serlo; para salud cuenta solo el
-- permiso que figura en alguno de sus roles (ver_salud y edit_salud son
-- solo-admin: los otorga un administrador, también al rol admin).
create or replace function public.crm_perm_explicito(p_perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.name = ur.role
     where ur.user_id = auth.uid()
       and p_perm = any (r.permissions)
  );
$$;

revoke execute on function public.crm_perm_explicito(text) from public, anon;
grant execute on function public.crm_perm_explicito(text) to authenticated;

-- ============ 4) Tablas del núcleo del CRM ============
create table if not exists public.crm_cuentas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null constraint crm_cuentas_tipo_check check (tipo in ('persona', 'empresa')),
  nombre text not null constraint crm_cuentas_nombre_check check (char_length(btrim(nombre)) between 1 and 200),
  -- Cédula o NIT sin puntos, guiones ni espacios (lo normaliza crm_preparar)
  documento text constraint crm_cuentas_documento_check check (documento is null or documento ~ '^[0-9A-Z]{3,20}$'),
  etapa text not null,
  origen text,
  tipo_empresa text,
  responsable_id uuid references public.profiles (id) on delete set null,
  telefono text constraint crm_cuentas_telefono_check check (telefono is null or char_length(telefono) <= 40),
  email text constraint crm_cuentas_email_check
    check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+\.[^[:space:]@<>"]+$')),
  direccion text constraint crm_cuentas_direccion_check check (direccion is null or char_length(direccion) <= 300),
  ciudad text constraint crm_cuentas_ciudad_check check (ciudad is null or char_length(ciudad) <= 120),
  pais text not null default 'CO' constraint crm_cuentas_pais_check check (pais ~ '^[A-Z]{2}$'),
  etiquetas text[] not null default '{}' constraint crm_cuentas_etiquetas_check check (cardinality(etiquetas) <= 20),
  campos jsonb not null default '{}' constraint crm_cuentas_campos_check check (jsonb_typeof(campos) = 'object'),
  notas text constraint crm_cuentas_notas_check check (notas is null or char_length(notas) <= 4000),
  archivado_en timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_cuentas_tipo_empresa_check check (tipo = 'empresa' or tipo_empresa is null)
);

create unique index if not exists crm_cuentas_documento_unico
  on public.crm_cuentas (documento) where documento is not null and archivado_en is null;
create index if not exists crm_cuentas_nombre_trgm on public.crm_cuentas using gin (nombre extensions.gin_trgm_ops);
create index if not exists crm_cuentas_documento_trgm on public.crm_cuentas using gin (documento extensions.gin_trgm_ops);
create index if not exists crm_cuentas_email_trgm on public.crm_cuentas using gin (email extensions.gin_trgm_ops);
create index if not exists crm_cuentas_etiquetas_idx on public.crm_cuentas using gin (etiquetas);
create index if not exists crm_cuentas_responsable_idx on public.crm_cuentas (responsable_id);

create table if not exists public.crm_contactos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.crm_cuentas (id) on delete cascade,
  nombre text not null constraint crm_contactos_nombre_check check (char_length(btrim(nombre)) between 1 and 200),
  relacion text,
  cargo text constraint crm_contactos_cargo_check check (cargo is null or char_length(cargo) <= 120),
  email text constraint crm_contactos_email_check
    check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+\.[^[:space:]@<>"]+$')),
  telefono text constraint crm_contactos_telefono_check check (telefono is null or char_length(telefono) <= 40),
  principal boolean not null default false,
  etiquetas text[] not null default '{}' constraint crm_contactos_etiquetas_check check (cardinality(etiquetas) <= 20),
  campos jsonb not null default '{}' constraint crm_contactos_campos_check check (jsonb_typeof(campos) = 'object'),
  notas text constraint crm_contactos_notas_check check (notas is null or char_length(notas) <= 4000),
  archivado_en timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_contactos_principal_unico
  on public.crm_contactos (cuenta_id) where principal and archivado_en is null;
create index if not exists crm_contactos_cuenta_idx on public.crm_contactos (cuenta_id);
create index if not exists crm_contactos_nombre_trgm on public.crm_contactos using gin (nombre extensions.gin_trgm_ops);
create index if not exists crm_contactos_email_trgm on public.crm_contactos using gin (email extensions.gin_trgm_ops);

create table if not exists public.crm_actividades (
  id uuid primary key default gen_random_uuid(),
  tipo text not null constraint crm_actividades_tipo_check check (tipo in ('nota', 'llamada', 'reunion', 'correo', 'visita')),
  cuenta_id uuid references public.crm_cuentas (id) on delete cascade,
  contacto_id uuid references public.crm_contactos (id) on delete set null,
  fecha timestamptz not null default now(),
  asunto text not null constraint crm_actividades_asunto_check check (char_length(btrim(asunto)) between 1 and 200),
  detalle text constraint crm_actividades_detalle_check check (detalle is null or char_length(detalle) <= 4000),
  autor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_actividades_destino_check check (cuenta_id is not null or contacto_id is not null)
);

create index if not exists crm_actividades_cuenta_idx on public.crm_actividades (cuenta_id, fecha desc);
create index if not exists crm_actividades_contacto_idx on public.crm_actividades (contacto_id);

create table if not exists public.crm_campos_def (
  clave text primary key constraint crm_campos_def_clave_check check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  entidad text not null constraint crm_campos_def_entidad_check check (entidad in ('cuenta', 'contacto')),
  etiqueta text not null constraint crm_campos_def_etiqueta_check check (char_length(btrim(etiqueta)) between 1 and 80),
  tipo text not null constraint crm_campos_def_tipo_check check (tipo in ('texto', 'numero', 'fecha', 'lista', 'booleano')),
  opciones text[] not null default '{}'
    constraint crm_campos_def_opciones_check check ((tipo = 'lista') = (cardinality(opciones) > 0) and cardinality(opciones) <= 50),
  obligatorio boolean not null default false,
  filtrable boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_cambios (
  id bigint generated always as identity primary key,
  entidad text not null constraint crm_cambios_entidad_check check (entidad in ('cuenta', 'contacto', 'actividad')),
  entidad_id uuid not null,
  operacion text not null constraint crm_cambios_operacion_check check (operacion in ('insert', 'update', 'delete')),
  campos text[] not null default '{}',
  antes jsonb,
  despues jsonb,
  autor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists crm_cambios_entidad_idx on public.crm_cambios (entidad, entidad_id, created_at desc);

create table if not exists public.crm_vinculos_externos (
  entidad text not null constraint crm_vinculos_externos_entidad_check check (entidad in ('cuenta', 'contacto', 'actividad')),
  entidad_id uuid not null,
  origen text not null constraint crm_vinculos_externos_origen_check check (origen ~ '^[a-z][a-z0-9_-]{1,30}$'),
  id_externo text not null constraint crm_vinculos_externos_id_check check (char_length(id_externo) between 1 and 200),
  datos jsonb not null default '{}' constraint crm_vinculos_externos_datos_check check (jsonb_typeof(datos) = 'object'),
  sincronizado_en timestamptz,
  created_at timestamptz not null default now(),
  primary key (origen, entidad, id_externo)
);

create index if not exists crm_vinculos_externos_entidad_idx on public.crm_vinculos_externos (entidad, entidad_id);

-- ============ 5) Tablas de salud (PP-DEC-19) ============
create table if not exists public.crm_salud (
  -- restrict: borrar una persona con salud exige antes crm_salud_borrar
  cuenta_id uuid primary key references public.crm_cuentas (id) on delete restrict,
  datos_cifrados bytea not null,
  version int not null default 1,
  actualizado_por uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_consentimientos (
  id uuid primary key default gen_random_uuid(),
  -- restrict: el consentimiento es la prueba que el Decreto 1377 obliga a
  -- conservar; una cuenta con consentimientos se archiva, no se borra
  cuenta_id uuid not null references public.crm_cuentas (id) on delete restrict,
  tipo text not null constraint crm_consentimientos_tipo_check check (tipo in ('tratamiento_datos', 'datos_salud')),
  otorgado boolean not null,
  -- No futura: lo exige crm_consentimientos_preparar (un check con
  -- current_date no es inmutable)
  fecha date not null default current_date,
  medio text not null constraint crm_consentimientos_medio_check check (medio in ('escrito', 'digital', 'verbal_grabado')),
  version_texto text not null constraint crm_consentimientos_version_check check (char_length(btrim(version_texto)) between 1 and 40),
  -- Ruta en el bucket privado crm-consentimientos: <cuenta_id>/<archivo>
  archivo_ruta text constraint crm_consentimientos_archivo_check
    check (archivo_ruta is null or archivo_ruta ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  registrado_por uuid,
  revocado_en timestamptz,
  revocado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists crm_consentimientos_cuenta_idx on public.crm_consentimientos (cuenta_id, tipo, fecha desc);
create index if not exists crm_consentimientos_vigente_idx on public.crm_consentimientos (cuenta_id, tipo, created_at desc);

-- Re-aplicación sobre una versión anterior del archivo: mismas reglas sin
-- duplicar nada
alter table public.crm_consentimientos add column if not exists revocado_por uuid;
-- B2: el archivo vive en la carpeta de su cuenta
alter table public.crm_consentimientos drop constraint if exists crm_consentimientos_archivo_cuenta_check;
alter table public.crm_consentimientos add constraint crm_consentimientos_archivo_cuenta_check
  check (archivo_ruta is null or left(archivo_ruta, 37) = cuenta_id::text || '/');
alter table public.crm_salud drop constraint if exists crm_salud_cuenta_id_fkey;
alter table public.crm_salud add constraint crm_salud_cuenta_id_fkey
  foreign key (cuenta_id) references public.crm_cuentas (id) on delete restrict;
alter table public.crm_consentimientos drop constraint if exists crm_consentimientos_cuenta_id_fkey;
alter table public.crm_consentimientos add constraint crm_consentimientos_cuenta_id_fkey
  foreign key (cuenta_id) references public.crm_cuentas (id) on delete restrict;

-- Sin llave foránea a crm_cuentas: el registro sobrevive al borrado de la cuenta
create table if not exists public.crm_accesos_salud (
  id bigint generated always as identity primary key,
  cuenta_id uuid not null,
  usuario_id uuid,
  operacion text not null constraint crm_accesos_salud_operacion_check check (operacion in ('leer', 'guardar', 'borrar')),
  creado_en timestamptz not null default now()
);

create index if not exists crm_accesos_salud_cuenta_idx on public.crm_accesos_salud (cuenta_id, creado_en desc);

-- ============ 6) Triggers de preparación y validación ============
-- Sella autoría, normaliza documento y etiquetas y valida el responsable y
-- la coherencia contacto-cuenta. security definer: lee profiles, crm_salud
-- y crm_contactos sin depender de la RLS de quien escribe.
create or replace function public.crm_preparar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cuenta uuid;
begin
  if tg_table_name in ('crm_cuentas', 'crm_contactos') then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); else new.created_by := old.created_by; end if;
    if new.etiquetas is null then new.etiquetas := '{}'; end if;
    if exists (select 1 from unnest(new.etiquetas) x where char_length(btrim(x)) > 40) then
      raise exception 'crm: etiqueta de más de 40 caracteres' using errcode = '23514', hint = 'crm_etiqueta';
    end if;
    select coalesce(array_agg(s.e order by s.o), '{}') into new.etiquetas
      from (select lower(btrim(x)) as e, min(o) as o
              from unnest(new.etiquetas) with ordinality u(x, o)
             where x is not null and btrim(x) <> ''
             group by lower(btrim(x))) s;
  end if;

  if tg_table_name = 'crm_cuentas' then
    new.documento := nullif(upper(regexp_replace(coalesce(new.documento, ''), '[.[:space:]-]', '', 'g')), '');
    if new.responsable_id is not null
       and exists (select 1 from public.profiles p where p.id = new.responsable_id and p.es_servicio) then
      raise exception 'crm: el responsable no puede ser una cuenta de servicio' using errcode = '23514', hint = 'crm_responsable';
    end if;
    if tg_op = 'UPDATE' and new.tipo <> 'persona' and old.tipo = 'persona' then
      -- Cierra la carrera con crm_salud_guardar, que bloquea la misma fila
      perform 1 from public.crm_cuentas c where c.id = new.id for update;
      -- Mensaje genérico: no revela si hay datos de salud
      if exists (select 1 from public.crm_salud s where s.cuenta_id = new.id) then
        raise exception 'crm: esta cuenta no puede cambiar de tipo' using errcode = '23514', hint = 'crm_tipo_bloqueado';
      end if;
    end if;
  elsif tg_table_name = 'crm_actividades' then
    if tg_op = 'INSERT' then new.autor_id := auth.uid(); else new.autor_id := old.autor_id; end if;
    if new.contacto_id is not null then
      select c.cuenta_id into v_cuenta from public.crm_contactos c where c.id = new.contacto_id;
      if new.cuenta_id is null then
        new.cuenta_id := v_cuenta;
      elsif v_cuenta is distinct from new.cuenta_id then
        raise exception 'crm: el contacto no es de la cuenta' using errcode = '23514', hint = 'crm_contacto_cuenta';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_preparar() from public, anon, authenticated;

-- Etapa, origen, tipo de empresa y relación dentro de los catálogos. Solo
-- valida el campo que cambia: quitar una etapa del catálogo no bloquea la
-- edición de otras columnas de las cuentas que la tienen.
create or replace function public.crm_validar_catalogos()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'crm_cuentas' then
    if new.etapa is null then
      select e ->> 'clave' into new.etapa
        from jsonb_array_elements(public.crm_ajustes() -> 'etapas') with ordinality a(e, n)
       order by case when jsonb_typeof(e -> 'orden') = 'number' then (e ->> 'orden')::numeric end nulls last, n
       limit 1;
    end if;
    if (tg_op = 'INSERT' or new.etapa is distinct from old.etapa)
       and not (new.etapa = any (public.crm_catalogo('etapas'))) then
      raise exception 'crm: etapa fuera del catálogo' using errcode = '23514', hint = 'crm_etapa';
    end if;
    if new.origen is not null and (tg_op = 'INSERT' or new.origen is distinct from old.origen)
       and not (new.origen = any (public.crm_catalogo('origenes'))) then
      raise exception 'crm: origen fuera del catálogo' using errcode = '23514', hint = 'crm_origen';
    end if;
    if new.tipo = 'persona' and new.tipo_empresa is not null then
      raise exception 'crm: una persona no lleva tipo de empresa' using errcode = '23514', hint = 'crm_tipo_empresa';
    end if;
    if new.tipo_empresa is not null and (tg_op = 'INSERT' or new.tipo_empresa is distinct from old.tipo_empresa)
       and not (new.tipo_empresa = any (public.crm_catalogo('tipos_empresa'))) then
      raise exception 'crm: tipo de empresa fuera del catálogo' using errcode = '23514', hint = 'crm_tipo_empresa';
    end if;
  elsif tg_table_name = 'crm_contactos' then
    if new.relacion is not null and (tg_op = 'INSERT' or new.relacion is distinct from old.relacion)
       and not (new.relacion = any (public.crm_catalogo('relaciones'))) then
      raise exception 'crm: relación fuera del catálogo' using errcode = '23514', hint = 'crm_relacion';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_validar_catalogos() from public, anon, authenticated;

-- Campos propios contra crm_campos_def: clave definida para la entidad,
-- tipo y obligatorios. Un valor null se quita. Solo corre si campos cambia.
create or replace function public.crm_validar_campos()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entidad text := case tg_table_name when 'crm_cuentas' then 'cuenta' else 'contacto' end;
  v_ok boolean;
  v_txt text;
  v_falta text;
  e record;
  d record;
begin
  new.campos := jsonb_strip_nulls(coalesce(new.campos, '{}'::jsonb));
  if tg_op = 'UPDATE' and new.campos is not distinct from old.campos then
    return new;
  end if;

  for e in select j.key, j.value from jsonb_each(new.campos) j loop
    select cd.tipo, cd.opciones into d from public.crm_campos_def cd where cd.clave = e.key and cd.entidad = v_entidad;
    if not found then
      raise exception 'crm: campo no definido' using errcode = '23514', hint = 'crm_campo:' || e.key;
    end if;
    v_txt := case when jsonb_typeof(e.value) = 'string' then e.value #>> '{}' end;
    v_ok := case d.tipo
              when 'texto' then v_txt is not null and char_length(v_txt) <= 1000
              when 'numero' then jsonb_typeof(e.value) = 'number'
              when 'booleano' then jsonb_typeof(e.value) = 'boolean'
              when 'lista' then v_txt is not null and v_txt = any (d.opciones)
              when 'fecha' then v_txt is not null and v_txt ~ '^\d{4}-\d{2}-\d{2}$'
              else false
            end;
    if v_ok and d.tipo = 'fecha' then
      begin
        perform v_txt::date;
      exception when others then
        v_ok := false;
      end;
    end if;
    if not v_ok then
      raise exception 'crm: valor no válido para el campo' using errcode = '23514', hint = 'crm_campo:' || e.key;
    end if;
  end loop;

  select cd.clave into v_falta
    from public.crm_campos_def cd
   where cd.entidad = v_entidad and cd.obligatorio and not (new.campos ? cd.clave)
   order by cd.orden, cd.clave
   limit 1;
  if v_falta is not null then
    raise exception 'crm: falta un campo obligatorio' using errcode = '23514', hint = 'crm_campo:' || v_falta;
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_validar_campos() from public, anon, authenticated;

-- Historial: solo los campos que cambian, cada lado recortado a 2 KB. Nunca
-- toca salud (no está en estas tablas).
create or replace function public.crm_registrar_cambio()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_campos text[];
  v_id uuid;
  v_entidad text;
begin
  if tg_op = 'DELETE' then
    -- Supresión (Ley 1581 art. 8): se borra el historial y los vínculos
    -- externos de la entidad; queda solo id, entidad y autor del borrado
    v_entidad := case tg_table_name when 'crm_cuentas' then 'cuenta' when 'crm_contactos' then 'contacto' else 'actividad' end;
    delete from public.crm_cambios c where c.entidad = v_entidad and c.entidad_id = old.id;
    delete from public.crm_vinculos_externos x where x.entidad = v_entidad and x.entidad_id = old.id;
    insert into public.crm_cambios (entidad, entidad_id, operacion, campos, antes, despues, autor_id)
    values (v_entidad, old.id, 'delete', '{}', null, null, auth.uid());
    return old;
  end if;
  v_id := new.id;
  if tg_op = 'UPDATE' then v_antes := to_jsonb(old) - 'updated_at'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_despues := to_jsonb(new) - 'updated_at'; end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_despues) k
     where (v_despues -> k) is distinct from (v_antes -> k);
    if v_campos is null then return new; end if;
    select jsonb_object_agg(k, v_antes -> k), jsonb_object_agg(k, v_despues -> k)
      into v_antes, v_despues
      from unnest(v_campos) k;
  else
    select array_agg(k order by k) into v_campos from jsonb_object_keys(v_despues) k;
  end if;

  if octet_length(v_antes::text) > 2048 then
    v_antes := jsonb_build_object('_recortado', left(v_antes::text, 500));
  end if;
  if octet_length(v_despues::text) > 2048 then
    v_despues := jsonb_build_object('_recortado', left(v_despues::text, 500));
  end if;

  insert into public.crm_cambios (entidad, entidad_id, operacion, campos, antes, despues, autor_id)
  values (case tg_table_name when 'crm_cuentas' then 'cuenta' when 'crm_contactos' then 'contacto' else 'actividad' end,
          v_id, lower(tg_op), coalesce(v_campos, '{}'), v_antes, v_despues, auth.uid());
  return new;
end;
$$;

revoke execute on function public.crm_registrar_cambio() from public, anon, authenticated;

-- Consentimientos: registrado_por y created_at (hora del servidor, decide
-- el vigente) sellados; fecha no futura; el único cambio admitido es
-- revocar una vez (revocado_en y revocado_por sellados).
create or replace function public.crm_consentimientos_preparar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.fecha is null or new.fecha > current_date + 1 then
      raise exception 'crm: la fecha del consentimiento no puede ser futura' using errcode = '23514', hint = 'crm_consentimiento_fecha';
    end if;
    new.registrado_por := auth.uid();
    new.revocado_en := null;
    new.revocado_por := null;
    new.created_at := now();
    return new;
  end if;
  if old.revocado_en is not null then
    raise exception 'crm: el consentimiento ya está revocado' using errcode = '23514', hint = 'crm_consentimiento_revocado';
  end if;
  if (to_jsonb(new) - 'revocado_en' - 'revocado_por') is distinct from (to_jsonb(old) - 'revocado_en' - 'revocado_por') then
    raise exception 'crm: un consentimiento solo se revoca' using errcode = '23514', hint = 'crm_consentimiento_inmutable';
  end if;
  if new.revocado_en is not null then
    new.revocado_en := now();
    new.revocado_por := auth.uid();
  else
    new.revocado_por := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_consentimientos_preparar() from public, anon, authenticated;

-- Borrado físico de una cuenta: las llaves de crm_salud y
-- crm_consentimientos son restrict; este trigger da antes un error claro sin
-- revelar contenido. security definer: quien borra no ve crm_salud.
create or replace function public.crm_cuenta_borrable()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.crm_salud s where s.cuenta_id = old.id) then
    raise exception 'crm: la cuenta no se puede borrar; antes hay que borrar sus datos de salud'
      using errcode = '23503', hint = 'crm_cuenta_con_salud';
  end if;
  if exists (select 1 from public.crm_consentimientos k where k.cuenta_id = old.id) then
    raise exception 'crm: la cuenta tiene consentimientos que se conservan; archívala en lugar de borrarla'
      using errcode = '23503', hint = 'crm_cuenta_con_consentimientos';
  end if;
  return old;
end;
$$;

revoke execute on function public.crm_cuenta_borrable() from public, anon, authenticated;

-- Un contacto que cambia de cuenta se lleva sus actividades. security
-- definer: quien mueve el contacto puede no ser autor de las actividades.
create or replace function public.crm_contacto_mover_actividades()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.crm_actividades a set cuenta_id = new.cuenta_id
   where a.contacto_id = new.id and a.cuenta_id is distinct from new.cuenta_id;
  return null;
end;
$$;

revoke execute on function public.crm_contacto_mover_actividades() from public, anon, authenticated;

-- crm_salud solo para cuentas de tipo persona
create or replace function public.crm_salud_validar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- for update: cierra la carrera con un cambio de tipo de la cuenta
  if not exists (select 1 from public.crm_cuentas c where c.id = new.cuenta_id and c.tipo = 'persona' for update) then
    raise exception 'crm: los datos de salud son solo de una persona' using errcode = '23514', hint = 'crm_salud_persona';
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_salud_validar() from public, anon, authenticated;

drop trigger if exists crm_preparar on public.crm_cuentas;
create trigger crm_preparar before insert or update on public.crm_cuentas
  for each row execute function public.crm_preparar();
drop trigger if exists crm_touch on public.crm_cuentas;
create trigger crm_touch before update on public.crm_cuentas
  for each row execute function public.touch_updated_at();
drop trigger if exists crm_validar_campos on public.crm_cuentas;
create trigger crm_validar_campos before insert or update on public.crm_cuentas
  for each row execute function public.crm_validar_campos();
drop trigger if exists crm_validar_catalogos on public.crm_cuentas;
create trigger crm_validar_catalogos before insert or update on public.crm_cuentas
  for each row execute function public.crm_validar_catalogos();
drop trigger if exists crm_registrar_cambio on public.crm_cuentas;
create trigger crm_registrar_cambio after insert or update or delete on public.crm_cuentas
  for each row execute function public.crm_registrar_cambio();
drop trigger if exists crm_cuenta_borrable on public.crm_cuentas;
create trigger crm_cuenta_borrable before delete on public.crm_cuentas
  for each row execute function public.crm_cuenta_borrable();
drop trigger if exists auditar_cambio on public.crm_cuentas;
create trigger auditar_cambio after delete on public.crm_cuentas
  for each row execute function public.auditar_cambio();

drop trigger if exists crm_preparar on public.crm_contactos;
create trigger crm_preparar before insert or update on public.crm_contactos
  for each row execute function public.crm_preparar();
drop trigger if exists crm_touch on public.crm_contactos;
create trigger crm_touch before update on public.crm_contactos
  for each row execute function public.touch_updated_at();
drop trigger if exists crm_validar_campos on public.crm_contactos;
create trigger crm_validar_campos before insert or update on public.crm_contactos
  for each row execute function public.crm_validar_campos();
drop trigger if exists crm_validar_catalogos on public.crm_contactos;
create trigger crm_validar_catalogos before insert or update on public.crm_contactos
  for each row execute function public.crm_validar_catalogos();
drop trigger if exists crm_registrar_cambio on public.crm_contactos;
create trigger crm_registrar_cambio after insert or update or delete on public.crm_contactos
  for each row execute function public.crm_registrar_cambio();
drop trigger if exists crm_mover_actividades on public.crm_contactos;
create trigger crm_mover_actividades after update of cuenta_id on public.crm_contactos
  for each row when (new.cuenta_id is distinct from old.cuenta_id)
  execute function public.crm_contacto_mover_actividades();
drop trigger if exists auditar_cambio on public.crm_contactos;
create trigger auditar_cambio after delete on public.crm_contactos
  for each row execute function public.auditar_cambio();

drop trigger if exists crm_preparar on public.crm_actividades;
create trigger crm_preparar before insert or update on public.crm_actividades
  for each row execute function public.crm_preparar();
drop trigger if exists crm_touch on public.crm_actividades;
create trigger crm_touch before update on public.crm_actividades
  for each row execute function public.touch_updated_at();
drop trigger if exists crm_registrar_cambio on public.crm_actividades;
create trigger crm_registrar_cambio after insert or update or delete on public.crm_actividades
  for each row execute function public.crm_registrar_cambio();

drop trigger if exists crm_touch on public.crm_campos_def;
create trigger crm_touch before update on public.crm_campos_def
  for each row execute function public.touch_updated_at();
drop trigger if exists auditar_cambio on public.crm_campos_def;
create trigger auditar_cambio after insert or update or delete on public.crm_campos_def
  for each row execute function public.auditar_cambio();

drop trigger if exists crm_consentimientos_preparar on public.crm_consentimientos;
create trigger crm_consentimientos_preparar before insert or update on public.crm_consentimientos
  for each row execute function public.crm_consentimientos_preparar();
-- Auditoría: solo acción e id (auditar_cambio no copia columnas de esta tabla)
drop trigger if exists auditar_cambio on public.crm_consentimientos;
create trigger auditar_cambio after insert or update on public.crm_consentimientos
  for each row execute function public.auditar_cambio();

drop trigger if exists crm_salud_validar on public.crm_salud;
create trigger crm_salud_validar before insert or update on public.crm_salud
  for each row execute function public.crm_salud_validar();

-- ============ 7) Búsqueda ============
-- security invoker: la RLS de crm_cuentas y crm_contactos decide qué filas
-- salen. Escapa \ % _ antes de armar el patrón. No toca datos de salud.
create or replace function public.crm_buscar(
  p_q text default null,
  p_tipo text default null,
  p_etapa text default null,
  p_origen text default null,
  p_responsable uuid default null,
  p_etiqueta text default null,
  p_archivadas boolean default false,
  p_limite int default 50,
  p_desde int default 0
)
returns table (
  id uuid, tipo text, nombre text, documento text, etapa text, origen text, tipo_empresa text,
  responsable_id uuid, telefono text, email text, direccion text, ciudad text, pais text,
  etiquetas text[], campos jsonb, notas text, archivado_en timestamptz, created_by uuid,
  created_at timestamptz, updated_at timestamptz, total bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with b as (
    select '%' || replace(replace(replace(nullif(btrim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron,
           '%' || nullif(upper(regexp_replace(coalesce(p_q, ''), '[.[:space:]\\%_-]', '', 'g')), '') || '%' as patron_doc,
           nullif(lower(btrim(p_etiqueta)), '') as etiqueta
  )
  select c.id, c.tipo, c.nombre, c.documento, c.etapa, c.origen, c.tipo_empresa,
         c.responsable_id, c.telefono, c.email, c.direccion, c.ciudad, c.pais,
         c.etiquetas, c.campos, c.notas, c.archivado_en, c.created_by,
         c.created_at, c.updated_at, count(*) over () as total
    from public.crm_cuentas c, b
   where (b.patron is null
          or c.nombre ilike b.patron or c.email ilike b.patron
          or (b.patron_doc is not null and c.documento like b.patron_doc)
          or exists (select 1 from public.crm_contactos k
                      where k.cuenta_id = c.id
                        and (k.nombre ilike b.patron or k.email ilike b.patron)))
     and (p_tipo is null or c.tipo = p_tipo)
     and (p_etapa is null or c.etapa = p_etapa)
     and (p_origen is null or c.origen = p_origen)
     and (p_responsable is null or c.responsable_id = p_responsable)
     and (b.etiqueta is null or b.etiqueta = any (c.etiquetas))
     and (coalesce(p_archivadas, false) or c.archivado_en is null)
   order by c.nombre, c.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_desde, 0), 0);
$$;

revoke execute on function public.crm_buscar(text, text, text, text, uuid, text, boolean, int, int) from public, anon;
grant execute on function public.crm_buscar(text, text, text, text, uuid, text, boolean, int, int) to authenticated;

-- ============ 8) Funciones de salud ============
-- Única vía a crm_salud. Cada una exige: módulo activo y visible, el
-- permiso explícito en los roles (un administrador no lo tiene por serlo),
-- segundo factor (aal2) y deja una fila en crm_accesos_salud. Un intento
-- rechazado no deja fila: la excepción deshace la transacción.
create or replace function public.crm_salud_clave()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v text;
begin
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.name = 'crm_salud_clave';
  if v is null or char_length(v) < 32 then
    raise exception 'crm: falta la clave de salud en Vault' using errcode = 'P0001', hint = 'salud_sin_clave';
  end if;
  return v;
end;
$$;

-- Solo el dueño: la llaman las funciones de salud, que corren como él
revoke execute on function public.crm_salud_clave() from public, anon, authenticated, service_role;

create or replace function public.crm_salud_leer(p_cuenta uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cifrado bytea;
  v_datos jsonb;
begin
  if not public.has_modulo('crm') or not public.puede_ver_app('crm') then
    raise exception 'crm: módulo no disponible' using errcode = '42501', hint = 'crm_modulo';
  end if;
  if not public.crm_perm_explicito('ver_salud') then
    raise exception 'crm: sin permiso para ver datos de salud' using errcode = '42501', hint = 'salud_permiso';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'crm: los datos de salud exigen segundo factor' using errcode = '42501', hint = 'salud_mfa';
  end if;
  if not exists (select 1 from public.crm_cuentas c where c.id = p_cuenta) then
    raise exception 'crm: cuenta no encontrada' using errcode = 'P0002', hint = 'crm_cuenta';
  end if;

  select s.datos_cifrados into v_cifrado from public.crm_salud s where s.cuenta_id = p_cuenta;
  if v_cifrado is not null then
    v_datos := extensions.pgp_sym_decrypt(v_cifrado, public.crm_salud_clave())::jsonb;
  end if;

  insert into public.crm_accesos_salud (cuenta_id, usuario_id, operacion) values (p_cuenta, auth.uid(), 'leer');
  return coalesce(v_datos, '{}'::jsonb);
end;
$$;

revoke execute on function public.crm_salud_leer(uuid) from public, anon;
grant execute on function public.crm_salud_leer(uuid) to authenticated;

create or replace function public.crm_salud_guardar(p_cuenta uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tipo text;
begin
  if not public.has_modulo('crm') or not public.puede_ver_app('crm') then
    raise exception 'crm: módulo no disponible' using errcode = '42501', hint = 'crm_modulo';
  end if;
  if not public.crm_perm_explicito('edit_salud') then
    raise exception 'crm: sin permiso para editar datos de salud' using errcode = '42501', hint = 'salud_permiso';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'crm: los datos de salud exigen segundo factor' using errcode = '42501', hint = 'salud_mfa';
  end if;

  -- for update: un cambio de tipo concurrente espera a este guardado
  select c.tipo into v_tipo from public.crm_cuentas c where c.id = p_cuenta for update;
  if v_tipo is null then
    raise exception 'crm: cuenta no encontrada' using errcode = 'P0002', hint = 'crm_cuenta';
  end if;
  if v_tipo <> 'persona' then
    raise exception 'crm: los datos de salud son solo de una persona' using errcode = '23514', hint = 'crm_salud_persona';
  end if;

  -- El vigente es el último registrado (created_at, hora del servidor), no
  -- el de fecha mayor: fecha la escribe el cliente
  if not coalesce((select k.otorgado and k.revocado_en is null
                     from public.crm_consentimientos k
                    where k.cuenta_id = p_cuenta and k.tipo = 'datos_salud'
                    order by k.created_at desc, k.id desc
                    limit 1), false) then
    raise exception 'crm: falta el consentimiento de datos de salud' using errcode = '42501', hint = 'salud_sin_consentimiento';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object'
     or octet_length(p_datos::text) > 32768
     or exists (select 1 from jsonb_each(p_datos) e
                 where e.key <> all (array['diagnosticos', 'medicamentos', 'alergias', 'antecedentes', 'observaciones'])
                    or not (jsonb_typeof(e.value) = 'string'
                            or (jsonb_typeof(e.value) = 'array'
                                and not exists (select 1 from jsonb_array_elements(e.value) x
                                                 where jsonb_typeof(x) <> 'string')))) then
    raise exception 'crm: datos de salud no válidos' using errcode = '22023', hint = 'salud_datos';
  end if;

  insert into public.crm_salud (cuenta_id, datos_cifrados, version, actualizado_por, updated_at)
  values (p_cuenta, extensions.pgp_sym_encrypt(p_datos::text, public.crm_salud_clave(), 'cipher-algo=aes256'),
          1, auth.uid(), now())
  on conflict (cuenta_id) do update
     set datos_cifrados = excluded.datos_cifrados,
         version = public.crm_salud.version + 1,
         actualizado_por = excluded.actualizado_por,
         updated_at = now();

  insert into public.crm_accesos_salud (cuenta_id, usuario_id, operacion) values (p_cuenta, auth.uid(), 'guardar');
end;
$$;

revoke execute on function public.crm_salud_guardar(uuid, jsonb) from public, anon;
grant execute on function public.crm_salud_guardar(uuid, jsonb) to authenticated;

create or replace function public.crm_salud_borrar(p_cuenta uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_modulo('crm') then
    raise exception 'crm: módulo no disponible' using errcode = '42501', hint = 'crm_modulo';
  end if;
  if not (public.is_admin() and public.crm_perm_explicito('edit_salud')) then
    raise exception 'crm: solo un administrador con edit_salud borra datos de salud' using errcode = '42501', hint = 'salud_permiso';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'crm: los datos de salud exigen segundo factor' using errcode = '42501', hint = 'salud_mfa';
  end if;

  delete from public.crm_salud s where s.cuenta_id = p_cuenta;
  insert into public.crm_accesos_salud (cuenta_id, usuario_id, operacion) values (p_cuenta, auth.uid(), 'borrar');
end;
$$;

revoke execute on function public.crm_salud_borrar(uuid) from public, anon;
grant execute on function public.crm_salud_borrar(uuid) to authenticated;

-- ============ 9) RLS, grants y políticas ============
alter table public.crm_cuentas enable row level security;
alter table public.crm_contactos enable row level security;
alter table public.crm_actividades enable row level security;
alter table public.crm_campos_def enable row level security;
alter table public.crm_cambios enable row level security;
alter table public.crm_vinculos_externos enable row level security;
alter table public.crm_salud enable row level security;
alter table public.crm_consentimientos enable row level security;
alter table public.crm_accesos_salud enable row level security;

revoke all on table public.crm_cuentas, public.crm_contactos, public.crm_actividades, public.crm_campos_def,
                    public.crm_cambios, public.crm_vinculos_externos, public.crm_salud,
                    public.crm_consentimientos, public.crm_accesos_salud from anon, authenticated;

grant select, insert, update, delete on table public.crm_cuentas, public.crm_contactos, public.crm_actividades,
                                              public.crm_campos_def to authenticated;
grant select on table public.crm_cambios, public.crm_vinculos_externos, public.crm_accesos_salud to authenticated;
grant select, insert on table public.crm_consentimientos to authenticated;
grant update (revocado_en) on table public.crm_consentimientos to authenticated;
grant all on table public.crm_cuentas, public.crm_contactos, public.crm_actividades, public.crm_campos_def,
                   public.crm_vinculos_externos to service_role;
-- Consentimientos: tampoco la service role los borra (se conservan)
revoke all on table public.crm_consentimientos from service_role;
grant select, insert, update on table public.crm_consentimientos to service_role;
grant select on table public.crm_cambios, public.crm_accesos_salud to service_role;
-- crm_salud: authenticated, nada. La service role lee el texto cifrado y,
-- como la clave de servicio también lee Vault, puede descifrarlo: equivale a
-- acceso total a la base (riesgo aceptado PP-R4, docs/seguridad/03-riesgos.md)
grant select on table public.crm_salud to service_role;

-- Cuentas y contactos: leer con app_crm, escribir con edit_crm, borrar admin
drop policy if exists crm_cuentas_select on public.crm_cuentas;
create policy crm_cuentas_select on public.crm_cuentas
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_cuentas_insert on public.crm_cuentas;
create policy crm_cuentas_insert on public.crm_cuentas
  for insert to authenticated with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_cuentas_update on public.crm_cuentas;
create policy crm_cuentas_update on public.crm_cuentas
  for update to authenticated
  using ((select public.has_perm('edit_crm')))
  with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_cuentas_delete on public.crm_cuentas;
create policy crm_cuentas_delete on public.crm_cuentas
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists crm_contactos_select on public.crm_contactos;
create policy crm_contactos_select on public.crm_contactos
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_contactos_insert on public.crm_contactos;
create policy crm_contactos_insert on public.crm_contactos
  for insert to authenticated with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_contactos_update on public.crm_contactos;
create policy crm_contactos_update on public.crm_contactos
  for update to authenticated
  using ((select public.has_perm('edit_crm')))
  with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_contactos_delete on public.crm_contactos;
create policy crm_contactos_delete on public.crm_contactos
  for delete to authenticated using ((select public.is_admin()));

-- Actividades: editar y borrar, su autor (con edit_crm) o un administrador
drop policy if exists crm_actividades_select on public.crm_actividades;
create policy crm_actividades_select on public.crm_actividades
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_actividades_insert on public.crm_actividades;
create policy crm_actividades_insert on public.crm_actividades
  for insert to authenticated with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_actividades_update on public.crm_actividades;
create policy crm_actividades_update on public.crm_actividades
  for update to authenticated
  using ((select public.is_admin()) or ((select public.has_perm('edit_crm')) and autor_id = (select auth.uid())))
  with check ((select public.is_admin()) or ((select public.has_perm('edit_crm')) and autor_id = (select auth.uid())));
drop policy if exists crm_actividades_delete on public.crm_actividades;
create policy crm_actividades_delete on public.crm_actividades
  for delete to authenticated
  using ((select public.is_admin()) or ((select public.has_perm('edit_crm')) and autor_id = (select auth.uid())));

-- Campos propios: configuración de la instalación, la escribe un administrador
drop policy if exists crm_campos_def_select on public.crm_campos_def;
create policy crm_campos_def_select on public.crm_campos_def
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_campos_def_insert on public.crm_campos_def;
create policy crm_campos_def_insert on public.crm_campos_def
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists crm_campos_def_update on public.crm_campos_def;
create policy crm_campos_def_update on public.crm_campos_def
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists crm_campos_def_delete on public.crm_campos_def;
create policy crm_campos_def_delete on public.crm_campos_def
  for delete to authenticated using ((select public.is_admin()));

-- Historial y vínculos: solo lectura para la API
drop policy if exists crm_cambios_select on public.crm_cambios;
create policy crm_cambios_select on public.crm_cambios
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_vinculos_externos_select on public.crm_vinculos_externos;
create policy crm_vinculos_externos_select on public.crm_vinculos_externos
  for select to authenticated using ((select public.puede_ver_app('crm')));

-- Consentimientos: alta con edit_crm; revocar (derecho del titular, lo
-- registra quien atiende), edit_crm, un administrador o edit_salud
-- explícito; nadie los borra por la API ni des-revoca (trigger)
drop policy if exists crm_consentimientos_select on public.crm_consentimientos;
create policy crm_consentimientos_select on public.crm_consentimientos
  for select to authenticated using ((select public.puede_ver_app('crm')));
drop policy if exists crm_consentimientos_insert on public.crm_consentimientos;
create policy crm_consentimientos_insert on public.crm_consentimientos
  for insert to authenticated with check ((select public.has_perm('edit_crm')));
drop policy if exists crm_consentimientos_update on public.crm_consentimientos;
create policy crm_consentimientos_update on public.crm_consentimientos
  for update to authenticated
  using ((select public.is_admin()) or (select public.has_perm('edit_crm')) or (select public.crm_perm_explicito('edit_salud')))
  with check ((select public.is_admin()) or (select public.has_perm('edit_crm')) or (select public.crm_perm_explicito('edit_salud')));
drop policy if exists crm_consentimientos_delete on public.crm_consentimientos;

-- Registro de accesos a salud: lo lee un administrador; lo escriben solo
-- las funciones de salud (sin grant de insert para la API)
drop policy if exists crm_accesos_salud_select on public.crm_accesos_salud;
create policy crm_accesos_salud_select on public.crm_accesos_salud
  for select to authenticated using ((select public.is_admin()));

-- crm_salud: sin políticas permisivas ni grants para authenticated

select public.aplicar_politica_modulo('public.crm_cuentas', array['crm']);
select public.aplicar_politica_modulo('public.crm_contactos', array['crm']);
select public.aplicar_politica_modulo('public.crm_actividades', array['crm']);
select public.aplicar_politica_modulo('public.crm_campos_def', array['crm']);
select public.aplicar_politica_modulo('public.crm_cambios', array['crm']);
select public.aplicar_politica_modulo('public.crm_vinculos_externos', array['crm']);
select public.aplicar_politica_modulo('public.crm_salud', array['crm']);
select public.aplicar_politica_modulo('public.crm_consentimientos', array['crm']);
select public.aplicar_politica_modulo('public.crm_accesos_salud', array['crm']);

-- ============ 10) Bucket privado de consentimientos ============
-- Privado: los archivos solo salen con URL firmada. Ruta <cuenta_id>/<archivo>:
-- lectura con edit_crm o ver_salud explícito, subida con edit_crm, con el
-- módulo activo y solo si la primera
-- carpeta es una cuenta persona existente; borrar, solo un administrador
-- (supresión); sin update.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('crm-consentimientos', 'crm-consentimientos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists crm_consentimientos_leer on storage.objects;
create policy crm_consentimientos_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'crm-consentimientos' and (select public.has_modulo('crm'))
         and ((select public.has_perm('edit_crm')) or (select public.crm_perm_explicito('ver_salud')))
         and exists (select 1 from public.crm_cuentas c
                      where c.id::text = (storage.foldername(name))[1] and c.tipo = 'persona'));

drop policy if exists crm_consentimientos_subir on storage.objects;
create policy crm_consentimientos_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'crm-consentimientos' and (select public.has_modulo('crm')) and (select public.has_perm('edit_crm'))
              and exists (select 1 from public.crm_cuentas c
                           where c.id::text = (storage.foldername(name))[1] and c.tipo = 'persona'));

drop policy if exists crm_consentimientos_borrar on storage.objects;
create policy crm_consentimientos_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'crm-consentimientos' and (select public.has_modulo('crm')) and (select public.is_admin()));

-- exigir_mfa en las tablas nuevas (03-mfa)
select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare
  v text;
  t text;
begin
  select string_agg(x, ', ') into v
    from unnest(array['crm_cuentas', 'crm_contactos', 'crm_actividades', 'crm_campos_def', 'crm_cambios',
                      'crm_vinculos_externos', 'crm_salud', 'crm_consentimientos', 'crm_accesos_salud']) x
   where to_regclass('public.' || x) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.' || x))
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = x
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE')
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = x
                        and p.policyname = 'modulo_crm' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '21-crm: tablas sin crear, sin RLS, sin exigir_mfa o sin modulo_crm: %', v;
  end if;

  -- has_any_column_privilege solo admite select, insert, update y references
  foreach t in array array['select', 'insert', 'update', 'references'] loop
    if has_any_column_privilege('authenticated', 'public.crm_salud', t)
       or has_any_column_privilege('anon', 'public.crm_salud', t) then
      raise exception '21-crm: crm_salud admite % para la API', t;
    end if;
  end loop;
  foreach t in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('authenticated', 'public.crm_salud', t)
       or has_table_privilege('anon', 'public.crm_salud', t) then
      raise exception '21-crm: crm_salud admite % para la API', t;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_policies p
              where p.schemaname = 'public' and p.tablename = 'crm_salud' and p.permissive = 'PERMISSIVE') then
    raise exception '21-crm: crm_salud tiene políticas permisivas';
  end if;

  if has_table_privilege('authenticated', 'public.crm_cambios', 'insert')
     or has_table_privilege('authenticated', 'public.crm_cambios', 'update')
     or has_table_privilege('authenticated', 'public.crm_cambios', 'delete')
     or has_table_privilege('authenticated', 'public.crm_accesos_salud', 'insert')
     or has_table_privilege('authenticated', 'public.crm_accesos_salud', 'update')
     or has_table_privilege('authenticated', 'public.crm_accesos_salud', 'delete')
     or has_table_privilege('authenticated', 'public.crm_vinculos_externos', 'insert')
     or has_table_privilege('authenticated', 'public.crm_vinculos_externos', 'update')
     or has_table_privilege('authenticated', 'public.crm_vinculos_externos', 'delete')
     or has_table_privilege('authenticated', 'public.crm_consentimientos', 'update')
     or has_table_privilege('authenticated', 'public.crm_consentimientos', 'delete')
     or has_table_privilege('service_role', 'public.crm_consentimientos', 'delete') then
    raise exception '21-crm: grants de escritura de más en crm_cambios, crm_accesos_salud, crm_vinculos_externos o crm_consentimientos';
  end if;

  if has_function_privilege('anon', 'public.crm_salud_leer(uuid)', 'execute')
     or has_function_privilege('anon', 'public.crm_salud_guardar(uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.crm_salud_borrar(uuid)', 'execute')
     or has_function_privilege('anon', 'public.crm_buscar(text,text,text,text,uuid,text,boolean,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.crm_salud_clave()', 'execute')
     or has_function_privilege('service_role', 'public.crm_salud_clave()', 'execute')
     or not has_function_privilege('authenticated', 'public.crm_salud_leer(uuid)', 'execute') then
    raise exception '21-crm: EXECUTE mal repartido en las funciones del CRM';
  end if;

  if not exists (select 1 from vault.secrets where name = 'crm_salud_clave') then
    raise exception '21-crm: falta el secreto crm_salud_clave en Vault';
  end if;
  -- La clave actual descifra una fila existente (no se devuelve el contenido)
  if exists (select 1 from public.crm_salud) then
    begin
      perform octet_length(extensions.pgp_sym_decrypt(s.datos_cifrados, public.crm_salud_clave()))
         from public.crm_salud s limit 1;
    exception when others then
      raise exception '21-crm: la clave crm_salud_clave de Vault no descifra crm_salud';
    end;
  end if;
  -- La API no lee Vault (la service role sí: riesgo aceptado PP-R4)
  if has_table_privilege('anon', 'vault.decrypted_secrets', 'select')
     or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select')
     or has_table_privilege('anon', 'vault.secrets', 'select')
     or has_table_privilege('authenticated', 'vault.secrets', 'select') then
    raise exception '21-crm: anon o authenticated pueden leer Vault';
  end if;

  -- Salud y consentimientos no caen en cascada al borrar la cuenta
  if exists (select 1 from pg_catalog.pg_constraint k
              where k.conrelid in ('public.crm_salud'::regclass, 'public.crm_consentimientos'::regclass)
                and k.contype = 'f' and k.confrelid = 'public.crm_cuentas'::regclass and k.confdeltype <> 'r')
     or (select count(*) from pg_catalog.pg_constraint k
          where k.conrelid in ('public.crm_salud'::regclass, 'public.crm_consentimientos'::regclass)
            and k.contype = 'f' and k.confrelid = 'public.crm_cuentas'::regclass) <> 2 then
    raise exception '21-crm: crm_salud o crm_consentimientos no tienen on delete restrict hacia crm_cuentas';
  end if;

  if not exists (select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
                  where e.extname = 'pg_trgm' and n.nspname = 'extensions') then
    raise exception '21-crm: pg_trgm no quedó en el esquema extensions';
  end if;

  if not exists (select 1 from storage.buckets b where b.id = 'crm-consentimientos' and not b.public) then
    raise exception '21-crm: el bucket crm-consentimientos falta o es público';
  end if;

  if cardinality(public.crm_catalogo('etapas')) = 0
     or not exists (select 1 from public.instalacion i where i.id = 1 and i.ajustes ? 'crm') then
    raise exception '21-crm: faltan los catálogos de instalacion.ajustes.crm';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_registrar_cambio' and tgrelid = 'public.crm_cuentas'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_validar_catalogos' and tgrelid = 'public.crm_cuentas'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_validar_campos' and tgrelid = 'public.crm_contactos'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_cuenta_borrable' and tgrelid = 'public.crm_cuentas'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_mover_actividades' and tgrelid = 'public.crm_contactos'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'auditar_cambio' and tgrelid = 'public.crm_consentimientos'::regclass) then
    raise exception '21-crm: faltan los triggers de validación o historial';
  end if;
end $$;

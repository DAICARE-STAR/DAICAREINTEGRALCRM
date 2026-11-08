-- ============================================================
-- 05-perfiles.sql — Núcleo: perfil ampliado (datos laborales, biografía y
-- enlaces) y difusión de perfiles en Realtime
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 9d1524b, solo lectura): migración 90 (columnas,
-- enlaces_validos y guard_profile_laboral) y migración 20 (profiles en
-- supabase_realtime). La política «gestores actualizan perfiles» con
-- is_admin(id) de la migración 88 ya está en 00-base.sql §7: aquí no se
-- repite, la verificación del final comprueba que sigue así.
--
-- perfil_privado, perfil_compartido y cumpleanos_hoy (migración 95 de
-- team-portal) no están: la 95 no existe todavía en team-portal. Llegan en
-- un archivo nuevo (05b), porque el instalador rechaza un archivo aplicado
-- con otro sha256.
--
-- Todo lo de este archivo lo lee el equipo, como el resto del perfil, y
-- Realtime lo difunde: aquí solo van datos que el equipo puede ver.
--
-- Requisitos: 00 a 03 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                   | Qué                                                        |
--   |--------------------------|------------------------------------------------------------|
--   | enlaces_validos(text[])  | a lo sumo cinco enlaces, cada uno https:// y ≤ 200         |
--   | profiles: area,          | área, extensión, responsable, fecha de ingreso, biografía  |
--   | extension, responsable_id| y enlaces, con sus CHECK                                   |
--   | fecha_ingreso, bio,      |                                                            |
--   | enlaces                  |                                                            |
--   | guard_profile_laboral    | area, responsable_id y fecha_ingreso solo los cambia un    |
--   |                          | administrador o quien tiene manage_members; para los demás |
--   |                          | vuelven a su valor sin error                               |
--   | profiles_responsable_idx | reportes directos de un responsable                        |
--   | supabase_realtime        | profiles publicada (la barra derecha reacciona), si existe |
--   |                          | la publicación                                             |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '05-perfiles detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regprocedure('public.has_perm(text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'cargo') then
    raise exception '05-perfiles detenido: falta 00-base.sql';
  end if;
  if not exists (select 1 from pg_catalog.pg_default_acl d
                  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0) then
    raise exception '05-perfiles detenido: falta 01-seguridad.sql (privilegios por defecto)';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '05-perfiles detenido: falta 03-mfa.sql';
  end if;
  if to_regclass('public.instalacion') is null then
    raise exception '05-perfiles detenido: falta 04-instalacion-modulos.sql';
  end if;
end $$;

-- ============ 1) Enlaces del perfil (90 §1) ============
-- La usa el CHECK de profiles.enlaces: la ejecuta quien escribe la fila
create or replace function public.enlaces_validos(p_enlaces text[])
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_enlaces is null
      or (cardinality(p_enlaces) <= 5
          and not exists (select 1 from unnest(p_enlaces) as e(url)
                           where e.url is null or e.url !~ '^https://[^[:space:]]{1,200}$'));
$$;

revoke execute on function public.enlaces_validos(text[]) from public, anon;
grant execute on function public.enlaces_validos(text[]) to authenticated, service_role;

-- ============ 2) Columnas (90 §2) ============
--   campo           tipo   default  quién lo cambia
--   area            text   ''       admin o manage_members (≤ 60)
--   extension       text   ''       el dueño; admin o manage_members corrigen
--                                   (dígitos, espacio, + # * -; ≤ 20)
--   responsable_id  uuid   null     admin o manage_members (otro perfil; se
--                                   vacía si se borra; no uno mismo)
--   fecha_ingreso   date   null     admin o manage_members
--   bio             text   ''       el dueño; admin o manage_members corrigen (≤ 600)
--   enlaces         text[] '{}'     el dueño; admin o manage_members corrigen
alter table public.profiles add column if not exists area text not null default '';
alter table public.profiles add column if not exists extension text not null default '';
alter table public.profiles add column if not exists responsable_id uuid
  references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists fecha_ingreso date;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists enlaces text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_area_check;
alter table public.profiles add constraint profiles_area_check
  check (char_length(area) <= 60);
alter table public.profiles drop constraint if exists profiles_extension_check;
alter table public.profiles add constraint profiles_extension_check
  check (extension ~ '^[0-9+ #*-]{0,20}$');
alter table public.profiles drop constraint if exists profiles_responsable_check;
alter table public.profiles add constraint profiles_responsable_check
  check (responsable_id is distinct from id);
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check
  check (char_length(bio) <= 600);
alter table public.profiles drop constraint if exists profiles_enlaces_check;
alter table public.profiles add constraint profiles_enlaces_check
  check (public.enlaces_validos(enlaces));

create index if not exists profiles_responsable_idx on public.profiles (responsable_id);

comment on column public.profiles.area is 'Área de trabajo del miembro; la cambian admin o manage_members';
comment on column public.profiles.extension is 'Extensión telefónica interna; la edita el dueño';
comment on column public.profiles.responsable_id is 'Responsable directo (otro perfil); lo cambian admin o manage_members';
comment on column public.profiles.fecha_ingreso is 'Fecha de ingreso; la cambian admin o manage_members';
comment on column public.profiles.bio is 'Biografía corta del perfil; la edita el dueño';
comment on column public.profiles.enlaces is 'Hasta cinco enlaces https:// del perfil; los edita el dueño';

-- ============ 3) Freno de las columnas laborales (90 §3) ============
-- La service role, postgres, supabase_admin y el SQL Editor (sin rol)
-- pasan sin freno, como en guard_profile_role.
create or replace function public.guard_profile_laboral()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rol text := coalesce(nullif(auth.jwt() ->> 'role', ''),
                         nullif(current_setting('role', true), 'none'), '');
begin
  if v_rol in ('', 'service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if not public.is_admin() and not public.has_perm('manage_members') then
    new.area := old.area;
    new.responsable_id := old.responsable_id;
    new.fecha_ingreso := old.fecha_ingreso;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_profile_laboral() from public, anon, authenticated;

drop trigger if exists profiles_guard_laboral on public.profiles;
create trigger profiles_guard_laboral
  before update on public.profiles
  for each row execute function public.guard_profile_laboral();

-- ============ 4) Realtime (20) ============
-- Solo si existe la publicación de Supabase; sin ella la barra derecha
-- recarga al abrir y nada más se rompe.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_catalog.pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(c, ', ' order by c) into v
    from unnest(array['area', 'extension', 'responsable_id', 'fecha_ingreso', 'bio', 'enlaces']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'profiles' and column_name = c);
  if v is not null then
    raise exception '05-perfiles: faltan columnas en profiles: %', v;
  end if;

  if public.enlaces_validos(array['http://ejemplo.test'])
     or public.enlaces_validos(array['https://a', 'https://b', 'https://c', 'https://d', 'https://e', 'https://f'])
     or not public.enlaces_validos(array['https://ejemplo.test/perfil']) then
    raise exception '05-perfiles: enlaces_validos no filtra';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'profiles_guard_laboral' and tgrelid = 'public.profiles'::regclass) then
    raise exception '05-perfiles: falta el trigger profiles_guard_laboral';
  end if;

  if has_function_privilege('anon', 'public.enlaces_validos(text[])', 'execute')
     or has_function_privilege('authenticated', 'public.guard_profile_laboral()', 'execute') then
    raise exception '05-perfiles: EXECUTE de más en enlaces_validos o guard_profile_laboral';
  end if;

  -- La política de la 88 (00-base §7): un gestor de miembros nunca sobre la fila de un administrador
  if not exists (select 1 from pg_catalog.pg_policies p
                  where p.schemaname = 'public' and p.tablename = 'profiles'
                    and p.policyname = 'gestores actualizan perfiles' and p.cmd = 'UPDATE'
                    and p.qual like '%is_admin(id)%' and p.with_check like '%is_admin(id)%') then
    raise exception '05-perfiles: «gestores actualizan perfiles» no decide con is_admin(id)';
  end if;
end $$;

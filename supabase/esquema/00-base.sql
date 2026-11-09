-- ============================================================
-- 00-base.sql — Núcleo: roles, perfiles, asignaciones de rol y herramientas
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción por archivo (o el SQL
-- Editor con --solo-concatenar). IDEMPOTENTE. Un archivo aplicado no se
-- edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 12b1b72, solo lectura): versión final de schema.sql y
-- de las migraciones 2, 3, 9, 13, 19, 27, 31, 63, 84 y 88 para estos
-- objetos. portal_apps no viaja (los módulos salen de src/lib/modulos.ts);
-- la tabla de herramientas conserva el nombre connectors.
--
-- Requisitos: una base de Supabase (esquema auth con auth.users y
-- auth.uid(); roles anon, authenticated y service_role; esquema
-- extensions). El bloque 0 aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                     | Qué                                                        |
--   |----------------------------|------------------------------------------------------------|
--   | pgcrypto                   | extensión en el esquema extensions                         |
--   | touch_updated_at()         | trigger de updated_at para las tablas que lo usen          |
--   | roles                      | roles con permisos, jerarquía, color y funcion (rol que    |
--   |                            | buscan las funciones: aviso_leads, aviso_perdidas, qa)     |
--   | profiles                   | perfil por usuario de auth, role como caché del principal, |
--   |                            | datos de firma y es_servicio (cuentas que no son miembros) |
--   | user_roles                 | roles de cada usuario (fuente de verdad)                   |
--   | connectors                 | herramientas externas con «Visible para»                   |
--   | is_admin, has_perm,        | funciones de las políticas (unión de roles; «Visible para» |
--   | get_my_role, shares_role   | acepta nombres de rol y claves de permiso)                 |
--   | handle_new_user            | crea el perfil al crear el usuario en Auth                 |
--   | guard_profile_role         | profiles.role solo lo cambia la sincronización;            |
--   |                            | es_servicio solo la service role o el SQL Editor           |
--   | user_roles_sync_trg        | mantiene la caché profiles.role                            |
--   | semilla                    | roles admin y member (de sistema); nada más                |
--
-- Lo que no hace: ninguna política de módulo, ningún dato de una
-- instalación concreta, ningún emoji en semillas.
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception '00-base detenido: falta el esquema auth de Supabase (auth.users, auth.uid())';
  end if;
  if (select count(*) from pg_catalog.pg_roles
       where rolname in ('anon', 'authenticated', 'service_role')) <> 3 then
    raise exception '00-base detenido: faltan los roles anon, authenticated o service_role de Supabase';
  end if;
  if to_regnamespace('extensions') is null then
    raise exception '00-base detenido: falta el esquema extensions de Supabase';
  end if;
end $$;

-- ============ 1) Extensiones y utilidades ============
create extension if not exists pgcrypto with schema extensions;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ============ 2) Roles ============
-- permissions: claves verbo_objeto y app_<slug> del registro de módulos.
-- admin tiene siempre todos los permisos. funcion marca el rol que buscan
-- las funciones del servidor (en lugar de un nombre fijo): uno por función.
create table if not exists public.roles (
  name text primary key,
  description text,
  is_system boolean not null default false,
  permissions text[] not null default '{}',
  position int not null default 0,
  color text,
  funcion text
    constraint roles_funcion_check check (funcion is null or funcion in ('aviso_leads', 'aviso_perdidas', 'qa')),
  created_at timestamptz not null default now()
);

create unique index if not exists roles_funcion_unica on public.roles (funcion) where funcion is not null;

insert into public.roles (name, description, is_system, permissions, position) values
  ('admin',  'Administra el portal: miembros, roles y herramientas', true, '{}', 100),
  ('member', 'Miembro del equipo',                                   true, '{}', 10)
on conflict (name) do nothing;

-- Los roles de sistema no se borran ni se renombran (las políticas dependen
-- de admin) y is_system no cambia. Corre para todos, también la service role.
create or replace function public.protect_system_roles()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'No se puede eliminar un rol de sistema';
    end if;
    return old;
  end if;
  if old.is_system and new.name <> old.name then
    raise exception 'No se puede renombrar un rol de sistema';
  end if;
  if new.is_system <> old.is_system then
    raise exception 'is_system no es modificable';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_system_roles() from public, anon, authenticated;

drop trigger if exists roles_protect on public.roles;
create trigger roles_protect
  before update or delete on public.roles
  for each row execute function public.protect_system_roles();

-- ============ 3) Perfiles y asignaciones de rol ============
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- Caché del rol principal (el de mayor position); lo escribe solo
  -- sync_primary_role. La fuente de verdad es user_roles.
  role text not null default 'member' references public.roles (name) on update cascade,
  avatar_url text,
  -- Datos de firma de cotizaciones y cartas
  cargo text not null default '',
  telefono text not null default '',
  oficina text not null default '',
  -- Cuenta de servicio o de pruebas: no cuenta como miembro ni recibe avisos
  es_servicio boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null references public.roles (name) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);

-- ============ 4) Herramientas (enlaces externos) ============
-- roles: «Visible para», nombres de rol o claves herr_<clave>; null o vacío
-- es visible para todos. La url es el href de «Abrir»: solo http(s).
create table if not exists public.connectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  url text not null constraint connectors_url_http check (url ~* '^https?://[^[:space:]"''<>]+$'),
  icon text,
  category text,
  roles text[],
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ 5) Funciones de las políticas ============
-- ¿El usuario tiene el rol admin? (superusuario)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = uid and role = 'admin');
$$;

revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

-- Unión de los permisos de todos los roles del usuario; admin = todos
create or replace function public.has_perm(perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.name = ur.role
     where ur.user_id = auth.uid()
       and (ur.role = 'admin' or perm = any (r.permissions))
  );
$$;

revoke execute on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

-- Rol principal: el de mayor jerarquía. Solo lo usan get_my_role y la
-- sincronización (corren como dueño).
create or replace function public.primary_role(uid uuid default auth.uid())
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select ur.role
    from public.user_roles ur
    join public.roles r on r.name = ur.role
   where ur.user_id = uid
   order by r.position desc, ur.role asc
   limit 1;
$$;

revoke execute on function public.primary_role(uuid) from public, anon, authenticated;

-- 'admin' si lo tiene; si no, el rol principal
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.is_admin() then 'admin'
              else coalesce(public.primary_role(), 'member') end;
$$;

revoke execute on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated;

-- «Visible para»: nombre de rol o clave de permiso (app_*, herr_*)
create or replace function public.shares_role(role_list text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select role_list is null or cardinality(role_list) = 0
    or exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.name = ur.role
       where ur.user_id = auth.uid()
         and (ur.role = any (role_list) or r.permissions && role_list)
    );
$$;

revoke execute on function public.shares_role(text[]) from public, anon;
grant execute on function public.shares_role(text[]) to authenticated;

-- ============ 6) Altas, caché del rol principal y freno de perfiles ============
-- Perfil al crear el usuario en Auth (invitación o API Admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rol por defecto en user_roles para cada perfil nuevo
create or replace function public.seed_user_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, coalesce(new.role, 'member'))
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.seed_user_role() from public, anon, authenticated;

drop trigger if exists profiles_seed_role on public.profiles;
create trigger profiles_seed_role
  after insert on public.profiles
  for each row execute function public.seed_user_role();

create or replace function public.sync_primary_role(uid uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare pr text;
begin
  select public.primary_role(uid) into pr;
  perform set_config('app.sync_roles', 'on', true);
  update public.profiles set role = coalesce(pr, 'member') where id = uid;
  perform set_config('app.sync_roles', 'off', true);
end;
$$;

revoke execute on function public.sync_primary_role(uuid) from public, anon, authenticated;

create or replace function public.user_roles_sync()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_primary_role(old.user_id);
    return old;
  end if;
  perform public.sync_primary_role(new.user_id);
  return new;
end;
$$;

revoke execute on function public.user_roles_sync() from public, anon, authenticated;

drop trigger if exists user_roles_sync_trg on public.user_roles;
create trigger user_roles_sync_trg
  after insert or delete on public.user_roles
  for each row execute function public.user_roles_sync();

-- profiles.role se deriva de user_roles: un cambio a mano se ignora (salvo
-- la sincronización). es_servicio solo lo cambia la service role o el SQL
-- Editor (sin auth.uid()); para los demás, también un administrador, se
-- ignora: si no, marcar y desmarcar una cuenta saltaría nucleo.miembros
-- (PP-DEC-04, que solo fija quien instala).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('app.sync_roles', true), 'off') <> 'on' then
    new.role := old.role;
  end if;
  if new.es_servicio is distinct from old.es_servicio
     and auth.uid() is not null then
    new.es_servicio := old.es_servicio;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_profile_role() from public, anon, authenticated;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Renombrar un rol personalizado actualiza «Visible para» de las
-- herramientas (el FK de profiles y user_roles va en cascada)
create or replace function public.sync_role_rename()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.name <> old.name then
    update public.connectors set roles = array_replace(roles, old.name, new.name)
     where old.name = any (roles);
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_role_rename() from public, anon, authenticated;

drop trigger if exists roles_rename_sync on public.roles;
create trigger roles_rename_sync
  after update on public.roles
  for each row execute function public.sync_role_rename();

-- ============ 7) RLS, grants y políticas ============
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.connectors enable row level security;

revoke all on table public.roles from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.connectors from anon, authenticated;

grant select, insert, update, delete on table public.roles to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.connectors to authenticated;
grant all on table public.roles, public.profiles, public.user_roles, public.connectors to service_role;

-- roles: todos los ven; quien tiene manage_roles los gestiona, pero solo un
-- admin otorga manage_roles o manage_members (el resto lo frena
-- roles_guard_escalada en 01-seguridad.sql)
drop policy if exists "roles visibles para autenticados" on public.roles;
create policy "roles visibles para autenticados"
  on public.roles for select to authenticated
  using (true);

drop policy if exists "gestores administran roles" on public.roles;
create policy "gestores administran roles"
  on public.roles for all to authenticated
  using ((select public.has_perm('manage_roles')))
  with check (
    (select public.has_perm('manage_roles'))
    and (
      (select public.is_admin())
      or not (coalesce(permissions, '{}') && array['manage_roles', 'manage_members'])
    )
  );

-- profiles: el equipo ve nombre y rol del resto; cada quien edita el suyo
-- (el rol y es_servicio los frena guard_profile_role); quien gestiona
-- miembros edita los que no son de un administrador
drop policy if exists "el equipo ve los perfiles" on public.profiles;
create policy "el equipo ve los perfiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "usuario actualiza su perfil" on public.profiles;
create policy "usuario actualiza su perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "gestores actualizan perfiles" on public.profiles;
create policy "gestores actualizan perfiles"
  on public.profiles for update to authenticated
  using ((select public.is_admin()) or ((select public.has_perm('manage_members')) and not public.is_admin(id)))
  with check ((select public.is_admin()) or ((select public.has_perm('manage_members')) and not public.is_admin(id)));

-- user_roles: ver los propios o con manage_members; asignar y quitar, solo admin
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('manage_members')) or (select public.is_admin()));

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using ((select public.is_admin()));

-- connectors: lectura según «Visible para»; gestión con manage_connectors
drop policy if exists "conectores visibles segun rol" on public.connectors;
create policy "conectores visibles segun rol"
  on public.connectors for select to authenticated
  using ((select public.is_admin()) or public.shares_role(roles));

drop policy if exists "gestores administran conectores" on public.connectors;
create policy "gestores administran conectores"
  on public.connectors for all to authenticated
  using ((select public.has_perm('manage_connectors')))
  with check ((select public.has_perm('manage_connectors')));

notify pgrst, 'reload schema';

-- ============ 8) Función de plataforma de Supabase ============
-- Un proyecto creado con «Enable automatic RLS» trae en public la función
-- rls_auto_enable(), security definer y con EXECUTE para todos. Solo la usa
-- su event trigger, que no revisa EXECUTE: se le quita a la API. Solo se toca
-- si es de verdad una función de event trigger; cualquier otra con ese
-- nombre la frena la verificación de abajo.
do $$
begin
  if exists (select 1 from pg_catalog.pg_proc p
              where p.oid = to_regprocedure('public.rls_auto_enable()')
                and p.prorettype = 'pg_catalog.event_trigger'::regtype) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(t, ', ') into v
    from unnest(array['public.roles', 'public.profiles', 'public.user_roles', 'public.connectors']) t
   where to_regclass(t) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass(t));
  if v is not null then
    raise exception '00-base: tablas sin crear o sin RLS: %', v;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if v is not null then
    raise exception '00-base: funciones security definer ejecutables por anon: %', v;
  end if;

  if not exists (select 1 from public.roles where name = 'admin' and is_system)
     or not exists (select 1 from public.roles where name = 'member' and is_system) then
    raise exception '00-base: faltan los roles de sistema admin y member';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    raise exception '00-base: falta el trigger on_auth_user_created en auth.users';
  end if;
end $$;

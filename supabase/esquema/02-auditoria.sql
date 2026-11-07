-- ============================================================
-- 02-auditoria.sql — Núcleo: registro de auditoría inmutable, auditoría
-- del lado de la base y resumen diario de seguridad
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 12b1b72, solo lectura): migraciones 18, 35, 64 y 71
-- en su versión final para estos objetos. auditar_cambio y
-- seguridad_resumen() llegan aquí y no en 01-seguridad.sql porque escriben
-- y leen audit_log, que nace en este archivo.
--
-- seguridad_resumen() es la v2 (la de la 71) sin leads_24h: site_leads es
-- del módulo sitio-web. La v3 (migración 97 de team-portal, todavía sin
-- escribir) llegará como archivo nuevo (01b o 02b), porque el instalador
-- rechaza un archivo aplicado con otro sha256.
--
-- Requisitos: 00-base.sql y 01-seguridad.sql aplicados; ejecutarlo como
-- postgres. El bloque 0 aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto               | Qué                                                              |
--   |----------------------|------------------------------------------------------------------|
--   | audit_log            | una fila por acción; el cliente solo inserta las suyas como      |
--   |                      | 'cliente'; solo un administrador lee; nadie edita ni borra       |
--   | audit_fill_email     | user_email sale de auth.users, nunca del cliente                 |
--   | auditar_cambio       | fila 'base' por cambio en roles, user_roles, connectors,         |
--   |                      | security_settings y profiles (de profiles, solo nombres de campo)|
--   | seguridad_resumen()  | foto para la revisión diaria (solo service role)                 |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
declare v_ok boolean;
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '02-auditoria detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regclass('public.user_roles') is null then
    raise exception '02-auditoria detenido: falta 00-base.sql';
  end if;
  if to_regclass('public.security_settings') is null
     or to_regprocedure('public.permisos_solo_admin()') is null then
    raise exception '02-auditoria detenido: falta 01-seguridad.sql';
  end if;
  -- Los triggers security definer escriben en audit_log: su dueño (quien
  -- ejecuta esto) debe saltar la RLS de la tabla si ya existe
  if to_regclass('public.audit_log') is not null then
    select (c.relowner = r.oid and not c.relforcerowsecurity) or r.rolsuper or r.rolbypassrls
      into v_ok
      from pg_catalog.pg_class c, pg_catalog.pg_roles r
     where c.oid = 'public.audit_log'::regclass and r.rolname = current_user;
    if not coalesce(v_ok, false) then
      raise exception '02-auditoria detenido: % no es dueño de audit_log ni salta la RLS', current_user;
    end if;
  end if;
end $$;

-- ============ 1) Registro de auditoría (18, 35 y 64) ============
-- origen: 'cliente' (src/lib/audit.ts), 'base' (auditar_cambio) o
-- 'servidor' (auditar() de las funciones, con la service role).
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  user_email text not null default '',
  -- slug de la acción: 'rol.crear', 'roles.update', …
  action text not null,
  detail text not null default '',
  entity text not null default '',
  entity_id text not null default '',
  origen text not null default 'cliente'
    constraint audit_log_origen_check check (origen in ('cliente', 'base', 'servidor')),
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Inmutable: nadie actualiza ni borra, tampoco la service role
revoke all on table public.audit_log from anon, authenticated, service_role;
grant select, insert on table public.audit_log to authenticated;
grant select, insert on table public.audit_log to service_role;

drop policy if exists "usuarios registran sus acciones" on public.audit_log;
create policy "usuarios registran sus acciones"
  on public.audit_log for insert to authenticated
  with check (user_id = (select auth.uid()) and origen = 'cliente');

drop policy if exists "admin lee el registro" on public.audit_log;
create policy "admin lee el registro"
  on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- user_email fiable: lo fija la base desde auth.users
create or replace function public.audit_fill_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select coalesce(u.email, '') into new.user_email
    from auth.users u
   where u.id = new.user_id;
  if not found then
    new.user_email := '';
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_fill_email() from public, anon, authenticated;

drop trigger if exists audit_fill_email on public.audit_log;
create trigger audit_fill_email
  before insert on public.audit_log
  for each row execute function public.audit_fill_email();

-- ============ 2) Auditoría del lado de la base (64 y 71) ============
-- Una fila por cambio. En roles, el diff de permisos; en user_roles, rol y
-- miembro; en herramientas, su nombre; en security_settings, cada campo con
-- su valor anterior y el nuevo (no son secretos). De los perfiles solo se
-- guardan nombres de campo. Las ramas project_log y tender_alerts sirven a
-- los módulos proyectos y licitaciones cuando sus archivos pongan el
-- trigger en esas tablas.
create or replace function public.auditar_cambio()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_fila jsonb;
  v_campos text;
  v_detalle text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_despues := to_jsonb(new); end if;
  v_fila := coalesce(v_despues, v_antes);

  if tg_op = 'UPDATE' then
    select string_agg(k, ',' order by k) into v_campos
      from jsonb_object_keys(v_despues) as k
     where (v_despues -> k) is distinct from (v_antes -> k)
       and k <> 'updated_at';
    -- Solo cambió updated_at (o nada): no hay nada que registrar
    if v_campos is null then return new; end if;
  end if;

  v_detalle := lower(tg_op) || coalesce(' [' || v_campos || ']', '');

  if tg_table_name = 'roles' then
    v_detalle := v_detalle
      || coalesce(' +' || (select string_agg(p, ',')
                             from jsonb_array_elements_text(coalesce(v_despues -> 'permissions', '[]'::jsonb)) as p
                            where not (coalesce(v_antes -> 'permissions', '[]'::jsonb) ? p)), '')
      || coalesce(' -' || (select string_agg(p, ',')
                             from jsonb_array_elements_text(coalesce(v_antes -> 'permissions', '[]'::jsonb)) as p
                            where not (coalesce(v_despues -> 'permissions', '[]'::jsonb) ? p)), '');
  elsif tg_table_name = 'user_roles' then
    v_detalle := v_detalle || ' ' || coalesce(v_fila ->> 'role', '') || ' → ' || coalesce(v_fila ->> 'user_id', '');
  elsif tg_table_name = 'project_log' then
    v_detalle := v_detalle || ' · texto anterior: ' || left(coalesce(v_antes ->> 'text', ''), 300);
  elsif tg_table_name in ('connectors', 'tender_alerts') then
    v_detalle := v_detalle || ' ' || coalesce(v_fila ->> 'name', '');
  elsif tg_table_name = 'security_settings' then
    v_detalle := v_detalle
      || coalesce(' ' || (select string_agg(k || ': ' || coalesce(v_antes ->> k, 'null')
                                               || ' → ' || coalesce(v_despues ->> k, 'null'), '; ' order by k)
                            from jsonb_object_keys(coalesce(v_despues, v_antes)) as k
                           where (v_despues -> k) is distinct from (v_antes -> k)
                             and k <> 'updated_at'), '');
  end if;

  insert into public.audit_log (user_id, action, detail, entity, entity_id, origen)
  values (auth.uid(),
          tg_table_name || '.' || lower(tg_op),
          left(v_detalle, 600),
          tg_table_name,
          coalesce(v_fila ->> 'id', v_fila ->> 'name', v_fila ->> 'user_id', ''),
          'base');

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.auditar_cambio() from public, anon, authenticated;

drop trigger if exists auditar_cambio on public.roles;
create trigger auditar_cambio after insert or update or delete on public.roles
  for each row execute function public.auditar_cambio();

drop trigger if exists auditar_cambio on public.user_roles;
create trigger auditar_cambio after insert or delete on public.user_roles
  for each row execute function public.auditar_cambio();

drop trigger if exists auditar_cambio on public.connectors;
create trigger auditar_cambio after insert or update or delete on public.connectors
  for each row execute function public.auditar_cambio();

drop trigger if exists auditar_cambio on public.security_settings;
create trigger auditar_cambio after update on public.security_settings
  for each row execute function public.auditar_cambio();

drop trigger if exists auditar_cambio on public.profiles;
create trigger auditar_cambio after update on public.profiles
  for each row execute function public.auditar_cambio();

-- ============ 3) Resumen diario de seguridad (64 y 71: v2) ============
-- Solo service role (la revisión programada). Sin datos de MFA: es
-- opcional. search_path cerrado y catálogos con pg_catalog.
create or replace function public.seguridad_resumen()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'generado_at', now(),
    'admins', (
      select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb)
        from auth.users u
       where exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = 'admin')),
    'definer_ejecutables_anon', (
      select coalesce(jsonb_agg(x.firma order by x.firma), '[]'::jsonb)
        from (select p.oid::regprocedure::text as firma
                from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and p.prosecdef
                 and p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype
                 and has_function_privilege('anon', p.oid, 'execute')) x),
    'tablas_sin_rls', (
      select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
    'tablas_sin_exigir_mfa', (
      select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
         and not exists (select 1 from pg_catalog.pg_policies pp
                          where pp.schemaname = 'public' and pp.tablename = c.relname
                            and pp.policyname = 'exigir_mfa' and pp.permissive = 'RESTRICTIVE')),
    'storage_exigir_mfa', exists (
      select 1 from pg_catalog.pg_policies pp
       where pp.schemaname = 'storage' and pp.tablename = 'objects' and pp.policyname = 'exigir_mfa'
         and pp.permissive = 'RESTRICTIVE'),
    'cambios_24h', (
      select coalesce(jsonb_object_agg(x.action, x.n), '{}'::jsonb)
        from (select a.action, count(*) as n
                from public.audit_log a
               where a.origen = 'base'
                 and a.created_at > now() - interval '24 hours'
                 and a.entity in ('roles', 'user_roles', 'security_settings', 'connectors')
               group by a.action) x)
  );
$$;

revoke execute on function public.seguridad_resumen() from public, anon, authenticated;
grant execute on function public.seguridad_resumen() to service_role;

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.audit_log'::regclass) then
    raise exception '02-auditoria: audit_log sin RLS';
  end if;

  if exists (select 1 from pg_catalog.pg_policies
              where schemaname = 'public' and tablename = 'audit_log' and permissive = 'PERMISSIVE'
                and cmd in ('UPDATE', 'DELETE', 'ALL'))
     or has_table_privilege('authenticated', 'public.audit_log', 'update')
     or has_table_privilege('authenticated', 'public.audit_log', 'delete')
     or has_table_privilege('service_role', 'public.audit_log', 'delete') then
    raise exception '02-auditoria: audit_log no quedó inmutable';
  end if;

  select string_agg(t, ', ') into v
    from unnest(array['public.roles', 'public.user_roles', 'public.connectors',
                      'public.security_settings', 'public.profiles']) t
   where not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgname = 'auditar_cambio' and g.tgrelid = to_regclass(t));
  if v is not null then
    raise exception '02-auditoria: tablas sin el trigger auditar_cambio: %', v;
  end if;

  if has_function_privilege('authenticated', 'public.seguridad_resumen()', 'execute')
     or has_function_privilege('anon', 'public.seguridad_resumen()', 'execute') then
    raise exception '02-auditoria: seguridad_resumen() ejecutable fuera de la service role';
  end if;
end $$;

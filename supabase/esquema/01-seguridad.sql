-- ============================================================
-- 01-seguridad.sql — Núcleo: privilegios, freno de escalada, límites de
-- tasa, interruptores y cuentas de servicio
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 12b1b72, solo lectura): versión final fundida de las
-- migraciones 63, 64, 71, 84, 87 y 88 para los objetos del núcleo, sin
-- nombres ni correos de una instalación concreta. Lo de módulos (radar,
-- bitácora, bóveda, leads del sitio, buckets) llega con su archivo.
-- Diferencias con team-portal:
--   · Los roles protegidos del freno son los de sistema y los que tienen
--     funcion (en team-portal, una lista de nombres).
--   · cuentas_servicio_ids() lee profiles.es_servicio (en team-portal,
--     una lista de correos).
--   · auditar_cambio y seguridad_resumen() viven en 02-auditoria.sql,
--     después de audit_log, que ambos necesitan.
--
-- Requisitos: 00-base.sql aplicado; ejecutarlo como postgres (los
-- privilegios por defecto son los de ese rol). El bloque 0 aborta sin
-- cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                   | Qué                                                          |
--   |--------------------------|--------------------------------------------------------------|
--   | privilegios por defecto  | funciones nuevas sin EXECUTE para public ni anon; tablas y   |
--   |                          | secuencias nuevas sin privilegios para anon (87)             |
--   | permisos_solo_admin()    | las catorce claves que solo un administrador otorga o quita  |
--   | roles_guard_escalada     | quien gestiona roles sin ser admin no otorga lo que no       |
--   |                          | tiene, no toca solo-admin, el rol admin ni la función, y no  |
--   |                          | renombra ni borra los protegidos (sí edita sus permisos,     |
--   |                          | posición y descripción, como en team-portal 63)              |
--   | security_settings        | interruptores de seguridad (fila única id = 1)               |
--   | api_rate_limits,         | límites de tasa compartidos (solo service role)              |
--   | rate_limit_hit()         |                                                              |
--   | cuentas_servicio_ids()   | ids de las cuentas con es_servicio                           |
--   | barrido de EXECUTE       | ninguna security definer de public ejecutable por public ni  |
--   |                          | anon; las de trigger, por nadie                              |
--
-- Cada función nueva lleva su grant explícito: desde aquí no hereda nada.
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '01-seguridad detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('public.roles') is null or to_regclass('public.profiles') is null
     or to_regclass('public.connectors') is null
     or to_regprocedure('public.is_admin(uuid)') is null
     or to_regprocedure('public.has_perm(text)') is null
     or to_regprocedure('public.touch_updated_at()') is null then
    raise exception '01-seguridad detenido: falta 00-base.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'roles' and column_name = 'funcion')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'es_servicio') then
    raise exception '01-seguridad detenido: roles.funcion o profiles.es_servicio no existen (00-base.sql incompleto)';
  end if;
end $$;

-- ============ 1) Privilegios por defecto (87) ============
-- La revocación a public va también sin «in schema»: el EXECUTE a public es
-- un default global de Postgres y un REVOKE por esquema no lo quita.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ============ 2) Permisos solo-admin (63 y 88) ============
-- Lista única: igual a PERMISOS_SOLO_ADMIN del shell y de las funciones
-- (src/lib/__tests__/permisos.test.ts compara las listas)
create or replace function public.permisos_solo_admin()
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select array['manage_roles', 'manage_members', 'manage_apps', 'manage_connectors',
               'view_credentials', 'manage_credentials', 'view_mail', 'view_billing',
               'bot_asistente', 'ia_worker', 'delete_projects', 'delete_tender_offers',
               'ver_salud', 'edit_salud']::text[];
$$;

revoke execute on function public.permisos_solo_admin() from public, anon;
grant execute on function public.permisos_solo_admin() to authenticated;

-- ============ 3) Freno de escalada en roles (63) ============
-- La política «gestores administran roles» (00-base) deja entrar a quien
-- tiene manage_roles; este trigger limita lo que puede cambiar quien no es
-- administrador. Protegidos: los de sistema y los que tienen funcion (los
-- buscan las funciones del servidor). La service role y el SQL Editor (sin
-- auth.uid()) y los administradores pasan sin freno.
create or replace function public.roles_guard_escalada()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_solo text[] := public.permisos_solo_admin();
  v_antes text[] := '{}';
  v_despues text[] := '{}';
  v_anadidos text[];
  v_quitados text[];
  v_mueve boolean := true;
  v_renombra boolean := true;
  v_pos_admin int;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_system or old.funcion is not null
       or (coalesce(old.permissions, '{}') && v_solo) then
      raise exception 'Solo un administrador elimina este rol' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.name = 'admin' then
      raise exception 'Solo un administrador modifica el rol admin' using errcode = '42501';
    end if;
    v_renombra := new.name is distinct from old.name;
    if (v_renombra and (old.is_system or old.funcion is not null))
       or new.is_system is distinct from old.is_system then
      raise exception 'Solo un administrador renombra un rol de sistema o con función' using errcode = '42501';
    end if;
    if new.funcion is distinct from old.funcion then
      raise exception 'Solo un administrador asigna la función de un rol' using errcode = '42501';
    end if;
    v_antes := coalesce(old.permissions, '{}');
    -- La jerarquía solo se revisa si cambia (un rol viejo mal ubicado sigue editable)
    v_mueve := new.position is distinct from old.position;
  else
    if new.is_system then
      raise exception 'Solo un administrador crea roles de sistema' using errcode = '42501';
    end if;
    if new.funcion is not null then
      raise exception 'Solo un administrador asigna la función de un rol' using errcode = '42501';
    end if;
  end if;

  -- shares_role compara también nombres de rol: un rol llamado
  -- herr_<clave> daría ese permiso a sus miembros. Toda clave lleva "_".
  if v_renombra and new.name !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Nombre de rol no permitido: solo minúsculas, números y guiones' using errcode = '42501';
  end if;
  -- Ni uno que ya figure en «Visible para» de una herramienta: el nombre de
  -- un rol borrado queda en esas listas y el rol nuevo heredaría el acceso.
  if v_renombra and exists (select 1 from public.connectors c where new.name = any (c.roles)) then
    raise exception 'Ese nombre ya figura en «Visible para» de una herramienta: solo un administrador lo reutiliza' using errcode = '42501';
  end if;
  v_despues := coalesce(new.permissions, '{}');

  v_anadidos := array(select unnest(v_despues) except select unnest(v_antes));
  v_quitados := array(select unnest(v_antes) except select unnest(v_despues));

  if (v_anadidos && v_solo) or (v_quitados && v_solo) then
    raise exception 'Solo un administrador otorga o quita permisos sensibles' using errcode = '42501';
  end if;

  if exists (select 1 from unnest(v_anadidos) as p where not public.has_perm(p)) then
    raise exception 'No puedes otorgar un permiso que no tienes' using errcode = '42501';
  end if;

  if v_mueve then
    select r.position into v_pos_admin from public.roles r where r.name = 'admin';
    if v_pos_admin is not null and new.position >= v_pos_admin then
      raise exception 'Solo el rol admin ocupa esa posición en la jerarquía' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.roles_guard_escalada() from public, anon, authenticated;

-- Corre antes que roles_protect (orden alfabético de los triggers)
drop trigger if exists roles_guard_escalada on public.roles;
create trigger roles_guard_escalada
  before insert or update or delete on public.roles
  for each row execute function public.roles_guard_escalada();

-- ============ 4) Interruptores de seguridad (64) ============
-- Fila única. Los del formulario del sitio los usa el módulo sitio-web
-- (su freno de leads llega con su archivo). Cambiar con UPDATE, sin deploy.
create table if not exists public.security_settings (
  id int primary key default 1 check (id = 1),
  leads_exigir_consentimiento boolean not null default false,
  leads_max_ip_hora int not null default 5 check (leads_max_ip_hora between 0 and 10000),
  leads_max_email_dia int not null default 3 check (leads_max_email_dia between 0 and 10000),
  leads_max_global_hora int not null default 40 check (leads_max_global_hora between 0 and 10000),
  updated_at timestamptz not null default now()
);

comment on table public.security_settings is
  'Interruptores de seguridad (fila única id=1). Cambiar con UPDATE, sin deploy.';

insert into public.security_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists security_settings_touch on public.security_settings;
create trigger security_settings_touch
  before update on public.security_settings
  for each row execute function public.touch_updated_at();

alter table public.security_settings enable row level security;

revoke all on table public.security_settings from anon, authenticated;
grant select, update on table public.security_settings to authenticated;
grant select, update on table public.security_settings to service_role;

drop policy if exists security_settings_select on public.security_settings;
create policy security_settings_select on public.security_settings
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists security_settings_update on public.security_settings;
create policy security_settings_update on public.security_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ============ 5) Límites de tasa compartidos (64) ============
-- Una fila por clave y ventana fija. RLS sin políticas a propósito: solo la
-- escriben rate_limit_hit (security definer) y la service role.
create table if not exists public.api_rate_limits (
  clave text not null,
  ventana timestamptz not null,
  cuenta int not null default 0,
  primary key (clave, ventana)
);

comment on table public.api_rate_limits is
  'Contadores de límite de tasa por clave y ventana fija; los escribe rate_limit_hit(). Se purgan solos a los 2 días.';

create index if not exists api_rate_limits_ventana_idx on public.api_rate_limits (ventana);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

-- Suma un golpe a la clave en la ventana actual y devuelve true si ya pasó
-- el máximo. Viaja en la misma transacción que la acción: si la acción
-- falla, el golpe se deshace. Ventanas de 1 s a 1 día.
create or replace function public.rate_limit_hit(p_clave text, p_ventana_seg int, p_max int)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ventana timestamptz;
  v_cuenta int;
begin
  if p_clave is null or btrim(p_clave) = '' then
    raise exception 'rate_limit_hit: clave vacía' using errcode = '22023';
  end if;
  if p_ventana_seg is null or p_ventana_seg < 1 or p_ventana_seg > 86400 then
    raise exception 'rate_limit_hit: la ventana va de 1 a 86400 segundos' using errcode = '22023';
  end if;

  v_ventana := to_timestamp(
    (floor(extract(epoch from now()) / p_ventana_seg) * p_ventana_seg)::double precision);

  insert into public.api_rate_limits as l (clave, ventana, cuenta)
  values (left(p_clave, 200), v_ventana, 1)
  on conflict (clave, ventana) do update set cuenta = l.cuenta + 1
  returning cuenta into v_cuenta;

  -- Purga oportunista: sin cron, cada tanto se barre lo viejo
  if random() < 0.02 then
    delete from public.api_rate_limits where ventana < now() - interval '2 days';
  end if;

  return v_cuenta > coalesce(p_max, 0);
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ============ 6) Cuentas de servicio (71, sobre es_servicio) ============
-- El shell las quita de los miembros visibles (Equipo, invitados). Solo ids.
create or replace function public.cuentas_servicio_ids()
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(p.id order by p.id), '{}')
    from public.profiles p
   where p.es_servicio;
$$;

revoke execute on function public.cuentas_servicio_ids() from public, anon;
grant execute on function public.cuentas_servicio_ids() to authenticated, service_role;

-- ============ 7) Barrido de EXECUTE (63 §1 y §11) ============
-- Por nombre y no por firma: cierra también una sobrecarga vieja. Un
-- trigger no revisa EXECUTE al dispararse: las de trigger quedan cerradas
-- para todos sin cambiar su funcionamiento.
do $$
declare f record;
begin
  for f in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) as firma,
           p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype as es_trigger
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    if f.es_trigger then
      execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
    else
      execute format('revoke execute on function %s from public, anon', f.firma);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  if cardinality(public.permisos_solo_admin()) <> 14 then
    raise exception '01-seguridad: permisos_solo_admin() no tiene las catorce claves';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if v is not null then
    raise exception '01-seguridad: funciones security definer ejecutables por anon: %', v;
  end if;

  if has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute') then
    raise exception '01-seguridad: rate_limit_hit ejecutable por authenticated';
  end if;

  if has_table_privilege('authenticated', 'public.api_rate_limits', 'select')
     or has_table_privilege('anon', 'public.security_settings', 'select') then
    raise exception '01-seguridad: grants de más en api_rate_limits o security_settings';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'roles_guard_escalada' and tgrelid = 'public.roles'::regclass) then
    raise exception '01-seguridad: falta el trigger roles_guard_escalada';
  end if;

  if not exists (select 1 from pg_catalog.pg_default_acl d
                  where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
                    and d.defaclnamespace = 0) then
    raise exception '01-seguridad: no quedaron los privilegios por defecto globales de funciones';
  end if;
end $$;

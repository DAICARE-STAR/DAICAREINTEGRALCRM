-- ============================================================
-- 07-widgets-uso.sql — Núcleo: widgets del Inicio y uso del portal
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 9d1524b, solo lectura): migraciones 30 y 83
-- (portal_widgets) y 73 (portal_uso, uso_latido, lecturas de la pestaña Uso
-- y uso_purgar). Diferencias con team-portal:
--   · La semilla de widgets es la del núcleo en src/lib/modulos.ts (clock;
--     pendientes y cumpleanos, cuando se porten); cada módulo siembra los suyos en su
--     archivo (reuniones llega con 10-calendario). inicio_checklist() lee
--     proyectos y llega con ese módulo.
--   · El día del uso sale de instalacion.zona_horaria, no de una zona fija.
--   · uso_purgar sin días usa nucleo.retencion_uso_dias, o 90; nunca menos
--     de 30.
--
-- Privacidad: el tiempo de uso por persona es seguimiento del equipo. Lo ve
-- solo un administrador y el detalle se purga (uso-purga, cada madrugada).
--
-- Requisitos: 00 a 04 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                    | Qué                                                    |
--   |---------------------------|--------------------------------------------------------|
--   | portal_widgets            | widgets disponibles, para qué roles y en qué orden; los|
--   |                           | ve el equipo, los gestiona quien tiene manage_apps     |
--   | portal_uso                | minutos y aperturas por miembro, día y sección; solo   |
--   |                           | lo lee un administrador; nadie escribe por la API      |
--   | zona_instalacion()        | zona horaria de la instalación (o America/Bogota)      |
--   | uso_latido()              | suma minutos con topes por llamada y por fila          |
--   | uso_resumen,              | lecturas de Administración → Uso (security invoker:    |
--   | uso_detalle_usuario,      | manda la RLS, un no administrador recibe vacío)        |
--   | acciones_resumen          |                                                        |
--   | audit_log_user_created_idx| acciones de cada miembro                               |
--   | uso_purgar(días)          | borra el detalle viejo (solo service role)             |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '07-widgets-uso detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regprocedure('public.touch_updated_at()') is null then
    raise exception '07-widgets-uso detenido: falta 00-base.sql';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception '07-widgets-uso detenido: falta 02-auditoria.sql';
  end if;
  if to_regprocedure('public.mfa_ok()') is null then
    raise exception '07-widgets-uso detenido: falta 03-mfa.sql';
  end if;
  if to_regclass('public.instalacion') is null or to_regprocedure('public.limite_modulo(text,text)') is null then
    raise exception '07-widgets-uso detenido: falta 04-instalacion-modulos.sql';
  end if;
end $$;

-- ============ 1) Widgets del Inicio (30 y 83) ============
-- Los widgets nacen en el código; esta tabla decide cuáles están
-- disponibles, para qué roles y en qué orden. roles null = todos.
create table if not exists public.portal_widgets (
  id text primary key constraint portal_widgets_id_check check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null constraint portal_widgets_name_check check (char_length(name) between 1 and 80),
  description text not null default '' constraint portal_widgets_description_check check (char_length(description) <= 300),
  active boolean not null default true,
  roles text[],
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_portal_widgets on public.portal_widgets;
create trigger touch_portal_widgets
  before update on public.portal_widgets
  for each row execute function public.touch_updated_at();

alter table public.portal_widgets enable row level security;

revoke all on table public.portal_widgets from anon, authenticated;
grant select, insert, update, delete on table public.portal_widgets to authenticated;
grant all on table public.portal_widgets to service_role;

drop policy if exists portal_widgets_select on public.portal_widgets;
create policy portal_widgets_select on public.portal_widgets
  for select to authenticated
  using (true);

drop policy if exists portal_widgets_gestion on public.portal_widgets;
create policy portal_widgets_gestion on public.portal_widgets
  for all to authenticated
  using ((select public.has_perm('manage_apps')))
  with check ((select public.has_perm('manage_apps')));

-- Los del núcleo en src/lib/modulos.ts. on conflict: re-ejecutar no pisa lo configurado.
insert into public.portal_widgets (id, name, description, sort_order) values
  ('clock', 'Hora mundial', 'Hora local y de otras zonas', 10)
on conflict (id) do nothing;

-- ============ 2) Uso del portal (73) ============
-- app: 'inicio', 'equipo', 'herramientas', 'admin' o 'modulo:<slug>'
create table if not exists public.portal_uso (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dia date not null,
  app text not null constraint portal_uso_app_check check (app ~ '^[a-z0-9:_-]{1,40}$'),
  minutos int not null default 0 constraint portal_uso_minutos_check check (minutos between 0 and 1440),
  aperturas int not null default 0 constraint portal_uso_aperturas_check check (aperturas >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, dia, app)
);

create index if not exists portal_uso_dia_idx on public.portal_uso (dia);

comment on table public.portal_uso is
  'Minutos de uso del portal por miembro, día (zona de la instalación) y sección. Lo escribe uso_latido(); lo lee solo un administrador; lo purga uso_purgar().';

alter table public.portal_uso enable row level security;

revoke all on table public.portal_uso from anon, authenticated;
grant select on table public.portal_uso to authenticated;
grant select, insert, update, delete on table public.portal_uso to service_role;

drop policy if exists portal_uso_select on public.portal_uso;
create policy portal_uso_select on public.portal_uso
  for select to authenticated
  using ((select public.is_admin()));

-- Zona horaria de la instalación (04 la valida al escribirla)
create or replace function public.zona_instalacion()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select i.zona_horaria from public.instalacion i where i.id = 1), 'America/Bogota');
$$;

revoke execute on function public.zona_instalacion() from public, anon;
grant execute on function public.zona_instalacion() to authenticated, service_role;

-- Topes: ≤ 5 minutos y ≤ 20 aperturas por llamada, ≤ 1440 minutos por fila.
-- Repite mfa_ok() porque un security definer salta la política restrictiva.
create or replace function public.uso_latido(p_app text, p_minutos int default 1, p_aperturas int default 0)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_min int := least(greatest(coalesce(p_minutos, 0), 0), 5);
  v_ap int := least(greatest(coalesce(p_aperturas, 0), 0), 20);
  v_dia date := (now() at time zone public.zona_instalacion())::date;
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '42501', hint = 'sin_sesion';
  end if;
  if not public.mfa_ok() then
    raise exception 'Verificación en dos pasos requerida' using errcode = '42501', hint = 'mfa_requerida';
  end if;
  if p_app is null or p_app !~ '^[a-z0-9:_-]{1,40}$' then
    raise exception 'App no válida' using errcode = '22023';
  end if;
  if v_min = 0 and v_ap = 0 then
    return;
  end if;
  insert into public.portal_uso as u (user_id, dia, app, minutos, aperturas, updated_at)
  values (v_uid, v_dia, p_app, v_min, v_ap, now())
  on conflict (user_id, dia, app) do update
    set minutos = least(u.minutos + excluded.minutos, 1440),
        aperturas = u.aperturas + excluded.aperturas,
        updated_at = now();
end;
$$;

revoke execute on function public.uso_latido(text, int, int) from public, anon;
grant execute on function public.uso_latido(text, int, int) to authenticated;

-- Lecturas para Administración → Uso: security invoker, deciden las RLS de
-- portal_uso y audit_log (solo administrador)
create or replace function public.uso_resumen(p_desde date, p_hasta date)
returns table (user_id uuid, app text, minutos int, aperturas int, dias int, ultima timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  with por_usuario as (
    select u.user_id, count(distinct u.dia)::int as dias, max(u.updated_at) as ultima
      from public.portal_uso u
     where u.dia between p_desde and p_hasta
     group by u.user_id
  ),
  por_app as (
    select u.user_id, u.app, sum(u.minutos)::int as minutos, sum(u.aperturas)::int as aperturas
      from public.portal_uso u
     where u.dia between p_desde and p_hasta
     group by u.user_id, u.app
  )
  select a.user_id, a.app, a.minutos, a.aperturas, p.dias, p.ultima
    from por_app a
    join por_usuario p on p.user_id = a.user_id
   order by a.user_id, a.minutos desc;
$$;

revoke execute on function public.uso_resumen(date, date) from public, anon;
grant execute on function public.uso_resumen(date, date) to authenticated, service_role;

create or replace function public.uso_detalle_usuario(p_user uuid, p_desde date, p_hasta date)
returns table (dia date, minutos int, aperturas int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select u.dia, sum(u.minutos)::int as minutos, sum(u.aperturas)::int as aperturas
    from public.portal_uso u
   where u.user_id = p_user and u.dia between p_desde and p_hasta
   group by u.dia
   order by u.dia;
$$;

revoke execute on function public.uso_detalle_usuario(uuid, date, date) from public, anon;
grant execute on function public.uso_detalle_usuario(uuid, date, date) to authenticated, service_role;

-- Acciones por persona y tipo en el periodo (fechas en la zona de la instalación, inclusive)
create or replace function public.acciones_resumen(p_desde date, p_hasta date, p_user uuid default null)
returns table (user_id uuid, action text, n int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select l.user_id, l.action, count(*)::int as n
    from public.audit_log l
   where l.user_id is not null
     and (l.created_at at time zone public.zona_instalacion())::date between p_desde and p_hasta
     and (p_user is null or l.user_id = p_user)
   group by l.user_id, l.action
   order by l.user_id, n desc;
$$;

revoke execute on function public.acciones_resumen(date, date, uuid) from public, anon;
grant execute on function public.acciones_resumen(date, date, uuid) to authenticated, service_role;

create index if not exists audit_log_user_created_idx on public.audit_log (user_id, created_at desc);

-- Purga: p_dias, o nucleo.retencion_uso_dias, o 90; nunca menos de 30
create or replace function public.uso_purgar(p_dias int default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dias int := greatest(coalesce(p_dias, least(public.limite_modulo('nucleo', 'retencion_uso_dias'), 3650)::int, 90), 30);
  v_borradas int;
begin
  delete from public.portal_uso
   where dia < (now() at time zone public.zona_instalacion())::date - v_dias;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke execute on function public.uso_purgar(int) from public, anon, authenticated;
grant execute on function public.uso_purgar(int) to service_role;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(t, ', ') into v
    from unnest(array['public.portal_widgets', 'public.portal_uso']) t
   where to_regclass(t) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass(t))
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = split_part(t, '.', 2)
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '07-widgets-uso: tablas sin crear, sin RLS o sin exigir_mfa: %', v;
  end if;

  if has_table_privilege('authenticated', 'public.portal_uso', 'insert')
     or has_table_privilege('authenticated', 'public.portal_uso', 'update')
     or has_table_privilege('authenticated', 'public.portal_uso', 'delete')
     or has_table_privilege('anon', 'public.portal_uso', 'select')
     or has_table_privilege('anon', 'public.portal_widgets', 'select') then
    raise exception '07-widgets-uso: grants de más en portal_uso o portal_widgets';
  end if;

  if has_function_privilege('authenticated', 'public.uso_purgar(integer)', 'execute')
     or has_function_privilege('anon', 'public.uso_latido(text,integer,integer)', 'execute') then
    raise exception '07-widgets-uso: EXECUTE de más en uso_purgar o uso_latido';
  end if;

  if (select count(*) from public.portal_widgets where id in ('clock')) <> 1 then
    raise exception '07-widgets-uso: faltan los widgets del núcleo';
  end if;
end $$;

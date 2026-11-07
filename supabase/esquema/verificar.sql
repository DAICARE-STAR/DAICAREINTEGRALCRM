-- verificar.sql — comprobaciones genéricas del esquema del producto.
-- Lo corre `node tools/instalar/aplicar.mjs --verificar`: una fila por
-- comprobación (orden, comprobacion, estado, detalle) con estado OK, DIFIERE,
-- OMITIDO o AVISO (verificacion.md). Solo lectura. No lleva datos de ninguna
-- instalación. Las comprobaciones que leen las filas de modulos_instalacion
-- contra el registro src/lib/modulos.ts (slugs, límites, dependencias) las
-- hace aplicar.mjs después de esta consulta (comprobarModulos), porque una
-- consulta suelta no puede nombrar una tabla que quizá no existe todavía.
with
tablas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
roles as (
  select exists (select 1 from pg_roles where rolname = 'anon') as hay_anon,
         exists (select 1 from pg_roles where rolname = 'authenticated') as hay_authenticated
),
mfa as (
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aplicar_exigir_mfa'
  ) as existe
),
sin_rls as (
  select relname from tablas where not relrowsecurity
),
sin_mfa as (
  select t.relname from tablas t
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.relname and p.policyname = 'exigir_mfa'
      and p.permissive = 'RESTRICTIVE'
  )
),
definer_anon as (
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join roles r
  where n.nspname = 'public' and p.prosecdef and r.hay_anon
    and has_function_privilege('anon', p.oid, 'execute')
),
-- Lista aceptada de tablas de public con grants a anon: vacía hasta que un
-- módulo público (sitio web) la necesite; entonces se añade aquí con su motivo.
grants_anon as (
  select distinct table_name
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
    and table_name not in (select unnest(array[]::text[]))
),
aplicados as (
  select count(*) as n from instalador.esquema_aplicado
),
-- Tablas del núcleo (00 a 09): siempre activas, sin política modulo_*. Al
-- llegar 05-09 (N-2) se añaden aquí sus tablas.
nucleo as (
  select unnest(array['roles', 'profiles', 'user_roles', 'connectors', 'security_settings',
                      'api_rate_limits', 'audit_log', 'instalacion', 'modulos_instalacion']) as relname
),
sin_modulo as (
  select t.relname from tablas t
  where t.relname not in (select relname from nucleo)
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.relname
        and p.policyname like 'modulo\_%' and p.permissive = 'RESTRICTIVE'
    )
),
hay_modulos as (
  select to_regclass('public.modulos_instalacion') is not null as existe
),
-- Solo lectura para la API: ningún privilegio distinto de SELECT y ninguna
-- política permisiva que no sea de lectura
escritura_modulos as (
  select 'privilegio ' || lower(g.privilege_type) || ' a ' || g.grantee as motivo
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.table_name = 'modulos_instalacion'
    and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT'
  union all
  select 'política ' || p.policyname
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'modulos_instalacion'
    and p.permissive = 'PERMISSIVE' and p.cmd <> 'SELECT'
)
select orden, comprobacion, estado, detalle from (
  select 1 as orden,
    'tablas de public con RLS' as comprobacion,
    case when (select count(*) from tablas) = 0 then 'OMITIDO'
         when (select count(*) from sin_rls) = 0 then 'OK'
         else 'DIFIERE' end as estado,
    case when (select count(*) from tablas) = 0 then 'sin tablas en public'
         else coalesce((select string_agg(relname, ', ' order by relname) from sin_rls), '') end as detalle
  union all
  select 2,
    'tablas de public con la política exigir_mfa restrictiva',
    case when not (select existe from mfa) then 'OMITIDO'
         when (select count(*) from sin_mfa) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from mfa) then 'falta 03-mfa.sql (aplicar_exigir_mfa)'
         else coalesce((select string_agg(relname, ', ' order by relname) from sin_mfa), '') end
  union all
  select 3,
    'funciones security definer no ejecutables por anon',
    case when not (select hay_anon from roles) then 'OMITIDO'
         when (select count(*) from definer_anon) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select hay_anon from roles) then 'no existe el rol anon'
         else coalesce((select string_agg(proname, ', ' order by proname) from definer_anon), '') end
  union all
  select 4,
    'grants a anon sobre tablas de public fuera de la lista aceptada',
    case when not (select hay_anon from roles) then 'OMITIDO'
         when (select count(*) from grants_anon) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select hay_anon from roles) then 'no existe el rol anon'
         else coalesce((select string_agg(table_name, ', ' order by table_name) from grants_anon), '') end
  union all
  select 5,
    'esquema instalador sin acceso para anon ni authenticated',
    case when not (select hay_anon and hay_authenticated from roles) then 'OMITIDO'
         when has_schema_privilege('anon', 'instalador', 'usage')
           or has_schema_privilege('authenticated', 'instalador', 'usage') then 'DIFIERE'
         else 'OK' end,
    case when not (select hay_anon and hay_authenticated from roles) then 'faltan los roles de Supabase' else '' end
  union all
  select 6,
    'registro instalador.esquema_aplicado',
    case when (select n from aplicados) = 0 then 'AVISO' else 'OK' end,
    (select n from aplicados)::text || ' archivo(s) aplicado(s)'
  union all
  select 7,
    'tablas de public del núcleo o con política modulo_* restrictiva',
    case when (select count(*) from tablas) = 0 then 'OMITIDO'
         when (select count(*) from sin_modulo) = 0 then 'OK'
         else 'DIFIERE' end,
    case when (select count(*) from tablas) = 0 then 'sin tablas en public'
         else coalesce((select string_agg(relname, ', ' order by relname) from sin_modulo), '') end
  union all
  select 8,
    'modulos_instalacion de solo lectura para anon y authenticated',
    case when not (select existe from hay_modulos) then 'OMITIDO'
         when (select count(*) from escritura_modulos) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_modulos) then 'falta 04-instalacion-modulos.sql'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from escritura_modulos), '') end
) v
order by orden;

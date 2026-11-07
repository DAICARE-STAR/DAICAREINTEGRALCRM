-- verificar.sql — comprobaciones genéricas del esquema del producto.
-- Lo corre `node tools/instalar/aplicar.mjs --verificar`: una fila por
-- comprobación (orden, comprobacion, estado, detalle) con estado OK, DIFIERE,
-- OMITIDO o AVISO (verificacion.md). Solo lectura. No lleva datos de ninguna
-- instalación. Las comprobaciones del registro de módulos (toda tabla de
-- public es del núcleo o tiene política modulo_*, slugs conocidos) llegan con
-- el esquema 04.
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
    'tablas de public con la política exigir_mfa',
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
) v
order by orden;

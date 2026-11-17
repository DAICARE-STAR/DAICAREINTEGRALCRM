-- verificar.sql — comprobaciones genéricas del esquema del producto.
-- Lo corre `node tools/instalar/aplicar.mjs --verificar`: una fila por
-- comprobación (orden, comprobacion, estado, detalle) con estado OK, DIFIERE,
-- OMITIDO o AVISO (verificacion.md). Solo lectura. No lleva datos de ninguna
-- instalación. Las comprobaciones que leen las filas de modulos_instalacion
-- contra el registro src/lib/modulos.ts (slugs, límites, dependencias) las
-- hace aplicar.mjs después de esta consulta (comprobarModulos, números 9 a
-- 11; las de aquí siguen con la 12 a la 16), porque una consulta suelta no
-- puede nombrar una tabla que quizá no existe todavía.
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
-- Tablas del núcleo (00 a 09): siempre activas, sin política modulo_*.
nucleo as (
  select unnest(array['roles', 'profiles', 'user_roles', 'connectors', 'security_settings',
                      'api_rate_limits', 'audit_log', 'instalacion', 'modulos_instalacion',
                      'push_subscriptions', 'user_notifications', 'portal_widgets', 'portal_uso',
                      'ai_usage']) as relname
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
),
hay_storage as (
  select to_regclass('storage.objects') is not null as existe
),
-- Una SELECT de storage.objects para anon o con «bucket_id = '…'» a secas
-- deja listar el bucket entero (los públicos se sirven sin la RLS)
listado_storage as (
  select p.policyname
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects'
    and p.cmd in ('SELECT', 'ALL') and p.permissive = 'PERMISSIVE'
    and ('anon' = any (p.roles) or 'public' = any (p.roles)
         or p.qual ~ '^\(?bucket_id = ''[^'']+''::text\)?$')
),
hay_user_roles as (
  select to_regclass('public.user_roles') is not null as existe
),
-- Guarda del último administrador (01b-ultimo-administrador.sql): sus
-- triggers existen y no están desactivados
guarda_admin as (
  select n.nombre
  from unnest(array['user_roles_ultimo_admin', 'user_roles_ultimo_admin_vaciar', 'profiles_ultimo_admin']) as n(nombre)
  where not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and t.tgname = n.nombre and t.tgenabled <> 'D'
  )
),
-- Exportar del CRM (21c-crm-exportar.sql), si el CRM está instalado:
-- exige exportar_crm, no es security definer y no toca salud
hay_crm as (
  select to_regprocedure('public.crm_buscar(text,text,text,text,uuid,text,boolean,integer,integer)') is not null as existe
),
exportar_crm as (
  select p.prosecdef, p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_exportar'
),
-- Contrato base de tabla (00b-contrato-tabla.sql, PP-DEC-23): toda tabla
-- con creado_via lleva el trigger zz_contrato_sellar activo y ningún
-- trigger BEFORE de nombre posterior (Postgres los dispara por orden de
-- nombre: uno posterior podría reescribir lo sellado), y con el CRM
-- instalado lo tienen cuentas, contactos y actividades (21d-crm-contrato.sql)
hay_contrato as (
  select to_regprocedure('public.contrato_sellar()') is not null
     and to_regprocedure('public.contrato_aplicar(regclass,text[])') is not null as existe
),
sin_contrato as (
  select t.relname
  from tablas t
  where (exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = 'creado_via' and not a.attisdropped)
         or ((select existe from hay_crm) and t.relname in ('crm_cuentas', 'crm_contactos', 'crm_actividades')))
    and (not exists (
      select 1 from pg_trigger g
      where g.tgrelid = t.oid and g.tgname = 'zz_contrato_sellar' and not g.tgisinternal and g.tgenabled <> 'D'
        and g.tgfoid = to_regprocedure('public.contrato_sellar()')
    ) or exists (
      select 1 from pg_trigger o
      where o.tgrelid = t.oid and not o.tgisinternal and (o.tgtype::int & 2) <> 0
        and o.tgname > 'zz_contrato_sellar'::name
    ))
),
-- Moneda como par (PP-DEC-24): cada columna public.importe tiene al lado
-- <columna>_moneda de tipo public.codigo_moneda
importes_sin_moneda as (
  select t.relname || '.' || a.attname as columna
  from tablas t
  join pg_attribute a on a.attrelid = t.oid and not a.attisdropped
  where a.atttypid = to_regtype('public.importe')
    and not exists (
      select 1 from pg_attribute m
      where m.attrelid = t.oid and m.attname = a.attname || '_moneda' and not m.attisdropped
        and m.atttypid = to_regtype('public.codigo_moneda')
    )
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
  union all
  select 12,
    'storage.objects sin políticas SELECT que listen un bucket',
    case when not (select existe from hay_storage) then 'OMITIDO'
         when (select count(*) from listado_storage) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_storage) then 'no existe storage.objects'
         else coalesce((select string_agg(policyname, ', ' order by policyname) from listado_storage), '') end
  union all
  select 13,
    'guarda del último administrador en user_roles y profiles',
    case when not (select existe from hay_user_roles) then 'OMITIDO'
         when (select count(*) from guarda_admin) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_user_roles) then 'falta 00-base.sql'
         else coalesce('faltan o están desactivados: ' || (select string_agg(nombre, ', ' order by nombre) from guarda_admin), '') end
  union all
  select 14,
    'crm_exportar exige exportar_crm, sin security definer ni salud',
    case when not (select existe from hay_crm) then 'OMITIDO'
         when (select count(*) from exportar_crm) = 0 then 'DIFIERE'
         when exists (select 1 from exportar_crm
                       where prosecdef or prosrc ~* 'salud'
                          or position('has_perm(''exportar_crm'')' in prosrc) = 0) then 'DIFIERE'
         else 'OK' end,
    case when not (select existe from hay_crm) then 'el CRM no está instalado (21-crm.sql)'
         when (select count(*) from exportar_crm) = 0 then 'falta 21c-crm-exportar.sql (modulos.mjs --activar crm)'
         else '' end
  union all
  select 15,
    'tablas de negocio con el contrato base y el trigger zz_contrato_sellar el último',
    case when not (select existe from hay_contrato) then 'DIFIERE'
         when (select count(*) from sin_contrato) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_contrato) then 'falta 00b-contrato-tabla.sql (npm run instalar)'
         when (select count(*) from sin_contrato) = 0 then ''
         else 'sin zz_contrato_sellar o con un trigger BEFORE posterior (con el CRM, falta 21d-crm-contrato.sql: modulos.mjs --activar crm): '
              || (select string_agg(relname, ', ' order by relname) from sin_contrato) end
  union all
  select 16,
    'importes con su columna de moneda',
    case when to_regtype('public.importe') is null then 'OMITIDO'
         when (select count(*) from importes_sin_moneda) = 0 then 'OK'
         else 'DIFIERE' end,
    case when to_regtype('public.importe') is null then 'falta 00b-contrato-tabla.sql'
         else coalesce((select string_agg(columna, ', ' order by columna) from importes_sin_moneda), '') end
) v
order by orden;

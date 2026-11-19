-- verificar.sql — comprobaciones genéricas del esquema del producto.
-- Lo corre `node tools/instalar/aplicar.mjs --verificar`: una fila por
-- comprobación (orden, comprobacion, estado, detalle) con estado OK, DIFIERE,
-- OMITIDO o AVISO (verificacion.md). Solo lectura. No lleva datos de ninguna
-- instalación. Las comprobaciones que leen las filas de modulos_instalacion
-- contra el registro src/lib/modulos.ts (slugs, límites, dependencias) las
-- hace aplicar.mjs después de esta consulta (comprobarModulos, números 9 a
-- 11; las de aquí siguen con la 12 a la 26), porque una consulta suelta no
-- puede nombrar una tabla que quizá no existe todavía. Las de Productos (19
-- a 26) salen OMITIDO si el módulo no está instalado y leen sus datos con
-- query_to_xml y consultas fijas, como la 18.
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
                      'ai_usage', 'series', 'estados_entidades', 'estados',
                      'estados_transiciones']) as relname
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
-- exige exportar_crm, no es security definer, no toca salud y devuelve un
-- solo jsonb (un conjunto de filas lo corta el «Max rows» de PostgREST)
hay_crm as (
  select to_regprocedure('public.crm_buscar(text,text,text,text,uuid,text,boolean,integer,integer)') is not null as existe
),
exportar_crm as (
  select p.prosecdef, p.prosrc, p.proretset, p.prorettype
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
),
-- Numeración (09b-numeracion.sql, PP-DEC-25): la API (tampoco la service
-- role) no escribe actual ni periodo ni ejecuta series_siguiente, que es
-- security definer con search_path y lock_timeout, y ninguna secuencia
-- serie_* tiene grants
numeracion as (
  select distinct 'series.' || g.column_name || ' escribible por ' || g.grantee as motivo
  from information_schema.column_privileges g
  where g.table_schema = 'public' and g.table_name = 'series' and g.column_name in ('actual', 'periodo')
    and g.grantee in ('anon', 'authenticated', 'service_role') and g.privilege_type not in ('SELECT', 'REFERENCES')
  union all
  select 'series_siguiente ejecutable por ' || r.rol
  from unnest(array['anon', 'authenticated']) as r(rol)
  where has_function_privilege(r.rol, to_regprocedure('public.series_siguiente(text,date)'), 'execute')
  union all
  select 'series_siguiente sin security definer, search_path o lock_timeout'
  from pg_proc p
  where p.oid = to_regprocedure('public.series_siguiente(text,date)')
    and (not p.prosecdef
         or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
         or not ('lock_timeout=2s' = any (coalesce(p.proconfig, '{}'))))
  union all
  select distinct 'secuencia ' || c.relname || ' con grants a la API'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) x
  where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'serie\_%'
    and (x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
),
-- Máquina de estados (09c-estados.sql, PP-DEC-26): catálogo de solo
-- lectura para la API, aplicar_transicion security invoker con
-- search_path, estados_registrar solo del dueño y cada tabla de
-- estados_entidades con su trigger zy_estados_guardia activo. La lista se
-- lee con query_to_xml y una consulta fija, solo si la tabla existe: una
-- consulta suelta no puede nombrar una tabla que quizá no existe
-- (PP-DEC-16); la consulta no lleva texto de fuera.
maquina_estados as (
  select distinct g.table_name || ' escribible por ' || g.grantee as motivo
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.table_name in ('estados_entidades', 'estados', 'estados_transiciones')
    and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT'
  union all
  select 'aplicar_transicion es security definer o no tiene search_path'
  from pg_proc p
  where p.oid = to_regprocedure('public.aplicar_transicion(text,uuid,text,text)')
    and (p.prosecdef or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  union all
  select 'estados_registrar ejecutable por ' || r.rol
  from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)
  where has_function_privilege(r.rol, to_regprocedure('public.estados_registrar(text,regclass)'), 'execute')
  union all
  select 'zy_estados_guardia ausente o desactivada en ' || x.tabla::text
  from unnest(case when to_regclass('public.estados_entidades') is null then '{}'::xml[]
                   else xpath('/table/row/t/text()', query_to_xml(
                     'select e.tabla::text as t from public.estados_entidades e
                       where not exists (select 1 from pg_catalog.pg_trigger g
                                          where g.tgrelid = e.tabla and g.tgname = ''zy_estados_guardia''
                                            and not g.tgisinternal and g.tgenabled in (''O'', ''A''))',
                     false, false, '')) end) as x(tabla)
),
-- Productos (22-catalogo.sql): solo si está instalado
hay_productos as (
  select to_regclass('public.productos') is not null as existe
),
-- Una consulta fija sobre una tabla del módulo, leída con query_to_xml solo
-- si el módulo está instalado (una consulta suelta no puede nombrarla)
productos_datos as (
  select
    case when not (select existe from hay_productos) then '{}'::text[]
         else array(select x::text from unnest(xpath('/table/row/t/text()', query_to_xml(
           'select l.tabla::oid::text as t from public.productos_lineas l', false, false, ''))) as x) end as lineas,
    case when not (select existe from hay_productos) then null
         else (xpath('/table/row/n/text()', query_to_xml(
           'select count(*) as n from public.productos_impuestos i where i.predeterminado and i.archivado_en is null',
           false, false, '')))[1]::text::int end as predeterminadas,
    case when not (select existe from hay_productos) then null
         else (xpath('/table/row/n/text()', query_to_xml(
           'select count(*) as n from public.productos_unidades u where u.clave = ''und'' and u.sistema and u.archivado_en is null',
           false, false, '')))[1]::text::int end as und_sistema,
    case when to_regclass('public.series') is null then null
         else (xpath('/table/row/n/text()', query_to_xml(
           'select count(*) as n from public.series s where s.clave = ''producto'' and s.modo = ''con_huecos'' and s.reinicio = ''nunca''',
           false, false, '')))[1]::text::int end as serie,
    case when not (select existe from hay_productos) then null
         else (xpath('/table/row/n/text()', query_to_xml(
           'select count(*) as n from public.productos p, public.instalacion i
             where i.id = 1 and p.precio_lista_moneda is not null and p.precio_lista_moneda <> i.moneda_base',
           false, false, '')))[1]::text::int end as otra_moneda
),
productos_funciones as (
  select x.firma, p.oid, p.prosecdef, p.proconfig, p.prosrc, l.lanname
  from unnest(array['public.productos_buscar(text,uuid,boolean,text,text,boolean,integer,integer)',
                    'public.productos_importar(jsonb,boolean)', 'public.productos_factor(uuid,text)',
                    'public.productos_puede_leer()', 'public.productos_impuesto_predeterminar(text)']) as x(firma)
  left join pg_proc p on p.oid = to_regprocedure(x.firma)
  left join pg_language l on l.oid = p.prolang
),
-- 19: funciones de la API sin security definer, con search_path y sin anon;
-- productos_aplicar_linea solo del dueño
productos_19 as (
  select f.firma || ' falta' as motivo from productos_funciones f where f.oid is null
  union all
  select f.firma || ' es security definer' from productos_funciones f where f.prosecdef
  union all
  select f.firma || ' sin search_path' from productos_funciones f
  where f.oid is not null and not exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%')
  union all
  select 'productos_factor no es plpgsql' from productos_funciones f
  where f.firma like 'public.productos_factor(%' and f.oid is not null and f.lanname <> 'plpgsql'
  union all
  select 'productos_importar no exige has_perm(''edit_productos'')' from productos_funciones f
  where f.firma like 'public.productos_importar(%' and f.oid is not null and position('has_perm(''edit_productos'')' in f.prosrc) = 0
  union all
  select f.firma || ' ejecutable por anon' from productos_funciones f
  where f.oid is not null and (select hay_anon from roles) and has_function_privilege('anon', f.oid, 'execute')
  union all
  select 'productos_aplicar_linea ejecutable por ' || r.rol
  from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)
  where has_function_privilege(r.rol, to_regprocedure('public.productos_aplicar_linea(regclass,text,boolean)'), 'execute')
),
-- 20: historial y registro de líneas cerrados a la API; triggers de
-- historial y auditoría; las dos definer sin EXECUTE para la API
productos_20 as (
  -- Privilegios de la tabla entera y por columna (column_privileges trae
  -- también los de la tabla), una línea por tabla, privilegio y rol
  select g.table_name || ': ' || lower(g.privilege_type) || ' para ' || g.grantee as motivo
  from (select t.table_name, t.privilege_type, t.grantee from information_schema.role_table_grants t
         where t.table_schema = 'public' and t.table_name in ('productos_cambios', 'productos_lineas')
        union
        select k.table_name, k.privilege_type, k.grantee from information_schema.column_privileges k
         where k.table_schema = 'public' and k.table_name in ('productos_cambios', 'productos_lineas')) g
  where g.grantee in ('anon', 'authenticated')
    and (g.table_name = 'productos_lineas' or g.privilege_type not in ('SELECT', 'REFERENCES', 'TRIGGER'))
  union all
  select 'falta productos_registrar_cambio en ' || t.tabla
  from unnest(array['productos', 'productos_conversiones', 'productos_unidades', 'productos_impuestos', 'productos_categorias']) as t(tabla)
  where not exists (select 1 from pg_trigger g
                    where g.tgrelid = to_regclass('public.' || t.tabla) and g.tgname = 'productos_registrar_cambio'
                      and not g.tgisinternal and g.tgenabled <> 'D')
  union all
  select 'falta auditar_cambio en productos'
  where not exists (select 1 from pg_trigger g
                    where g.tgrelid = to_regclass('public.productos') and g.tgname = 'auditar_cambio' and g.tgenabled <> 'D')
  union all
  select x.firma || ' no es security definer o la ejecuta authenticated'
  from unnest(array['public.productos_preparar()', 'public.productos_registrar_cambio()']) as x(firma)
  left join pg_proc p on p.oid = to_regprocedure(x.firma)
  where p.oid is null or not p.prosecdef or has_function_privilege('authenticated', p.oid, 'execute')
),
-- 21: catálogos con clave inmutable, una predeterminada activa y und del sistema
productos_21 as (
  select 'falta productos_clave_inmutable en ' || t.tabla as motivo
  from unnest(array['productos_unidades', 'productos_impuestos']) as t(tabla)
  where not exists (select 1 from pg_trigger g
                    where g.tgrelid = to_regclass('public.' || t.tabla) and g.tgname = 'productos_clave_inmutable'
                      and not g.tgisinternal and g.tgenabled <> 'D')
  union all
  select 'productos_impuestos_predeterminado falta o no es diferido'
  where not exists (select 1 from pg_trigger g
                    where g.tgrelid = to_regclass('public.productos_impuestos') and g.tgname = 'productos_impuestos_predeterminado'
                      and g.tgconstraint <> 0 and g.tgdeferrable and g.tginitdeferred and g.tgenabled <> 'D')
  union all
  select (select predeterminadas from productos_datos)::text || ' clases predeterminadas activas'
  where (select predeterminadas from productos_datos) is distinct from 1
  union all
  select 'falta und con sistema' where (select und_sistema from productos_datos) is distinct from 1
  union all
  -- column_privileges también trae lo que da un grant de toda la tabla
  select distinct 'productos_unidades.' || g.column_name || ': ' || lower(g.privilege_type) || ' para ' || g.grantee
  from information_schema.column_privileges g
  where g.table_schema = 'public' and g.table_name = 'productos_unidades' and g.column_name in ('sistema', 'codigo_dian')
    and g.grantee in ('anon', 'authenticated') and g.privilege_type not in ('SELECT', 'REFERENCES')
),
-- 22: llaves del catálogo y de las líneas registradas en on delete restrict
productos_22 as (
  select k.conrelid::regclass::text || '.' || k.conname as motivo
  from pg_constraint k
  where k.contype = 'f' and k.confdeltype <> 'r'
    and ((k.conrelid = to_regclass('public.productos')
          and k.confrelid in (to_regclass('public.productos_unidades'), to_regclass('public.productos_impuestos'),
                              to_regclass('public.productos_categorias')))
         or (k.conrelid = to_regclass('public.productos_conversiones') and k.confrelid = to_regclass('public.productos_unidades'))
         or (k.conrelid = to_regclass('public.productos_categorias') and k.confrelid = to_regclass('public.productos_categorias'))
         or (k.conrelid::text = any ((select lineas from productos_datos)::text[])
             and k.confrelid in (to_regclass('public.productos'), to_regclass('public.productos_unidades'),
                                 to_regclass('public.productos_impuestos'))))
),
-- 24: toda tabla con llave hacia productos(id), salvo las conversiones,
-- registrada, con productos_linea_preparar activo y con índice sobre producto_id
productos_24 as (
  select r.tabla::regclass::text || case when not r.registrada then ' sin registrar en productos_lineas'
                                         when not r.con_trigger then ' sin productos_linea_preparar'
                                         else ' sin índice sobre producto_id' end as motivo
  from (
    select t.tabla,
           t.tabla::text = any ((select lineas from productos_datos)::text[]) as registrada,
           exists (select 1 from pg_trigger g where g.tgrelid = t.tabla and g.tgname = 'productos_linea_preparar'
                     and not g.tgisinternal and g.tgenabled <> 'D') as con_trigger,
           exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                    where i.indrelid = t.tabla and a.attname = 'producto_id') as con_indice
    from (select k.conrelid as tabla from pg_constraint k
          where k.contype = 'f' and k.confrelid = to_regclass('public.productos')
            and k.conrelid is distinct from to_regclass('public.productos_conversiones')
          union
          select l::oid from unnest((select lineas from productos_datos)) as l) t
  ) r
  where not (r.registrada and r.con_trigger and r.con_indice)
),
-- 25: guardas de concurrencia en el código de los triggers
productos_25 as (
  select x.funcion || ' sin ' || x.guarda as motivo
  from (values ('public.productos_categorias_validar()', 'pg_advisory_xact_lock('),
               ('public.productos_conversiones_validar()', 'for share'),
               ('public.productos_linea_preparar()', 'pg_advisory_xact_lock_shared('),
               ('public.productos_preparar()', 'pg_advisory_xact_lock(')) as x(funcion, guarda)
  left join pg_proc p on p.oid = to_regprocedure(x.funcion)
  where p.oid is null or position(x.guarda in p.prosrc) = 0
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
    'crm_exportar exige exportar_crm, sin security definer ni salud, devuelve un jsonb',
    case when not (select existe from hay_crm) then 'OMITIDO'
         when (select count(*) from exportar_crm) = 0 then 'DIFIERE'
         when exists (select 1 from exportar_crm
                       where prosecdef or prosrc ~* 'salud'
                          or proretset or prorettype <> 'jsonb'::regtype
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
  union all
  select 17,
    'numeración: contador sin escritura para la API y series_siguiente solo del servidor',
    case when to_regclass('public.series') is null or to_regprocedure('public.series_siguiente(text,date)') is null then 'DIFIERE'
         when (select count(*) from numeracion) = 0 then 'OK'
         else 'DIFIERE' end,
    case when to_regclass('public.series') is null or to_regprocedure('public.series_siguiente(text,date)') is null
           then 'falta 09b-numeracion.sql (npm run instalar)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from numeracion), '') end
  union all
  select 18,
    'máquina de estados: catálogo de solo lectura, aplicar_transicion sin security definer y guardas activas',
    case when to_regclass('public.estados_entidades') is null or to_regprocedure('public.aplicar_transicion(text,uuid,text,text)') is null then 'DIFIERE'
         when (select count(*) from maquina_estados) = 0 then 'OK'
         else 'DIFIERE' end,
    case when to_regclass('public.estados_entidades') is null or to_regprocedure('public.aplicar_transicion(text,uuid,text,text)') is null
           then 'falta 09c-estados.sql (npm run instalar)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from maquina_estados), '') end
  union all
  select 19,
    'productos: funciones de la API sin security definer, con search_path y sin anon, y productos_aplicar_linea solo del dueño',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_19) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_19), '') end
  union all
  select 20,
    'productos: historial y registro de líneas cerrados a la API, con sus triggers y la auditoría del borrado',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_20) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_20), '') end
  union all
  select 21,
    'productos: unidades y clases con clave inmutable, una clase predeterminada y und del sistema',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_21) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_21), '') end
  union all
  select 22,
    'productos: llaves del catálogo y de las líneas con borrado restringido (restrict)',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_22) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_22), '') end
  union all
  select 23,
    'productos: serie producto con huecos y sin reinicio',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select serie from productos_datos) = 1 and to_regclass('public.serie_producto') is not null then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         when (select serie from productos_datos) = 1 and to_regclass('public.serie_producto') is not null then ''
         else 'falta la serie producto, no es con huecos sin reinicio o no tiene su secuencia' end
  union all
  select 24,
    'productos: tablas de líneas registradas, con productos_linea_preparar y con índice sobre producto_id',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_24) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_24), '') end
  union all
  select 25,
    'productos: bloqueos de categorías, conversiones, líneas y cambio de unidad base',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when (select count(*) from productos_25) = 0 then 'OK'
         else 'DIFIERE' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         else coalesce((select string_agg(motivo, ', ' order by motivo) from productos_25), '') end
  union all
  select 26,
    'productos: precios de lista en una moneda distinta de la base',
    case when not (select existe from hay_productos) then 'OMITIDO'
         when coalesce((select otra_moneda from productos_datos), 0) = 0 then 'OK'
         else 'AVISO' end,
    case when not (select existe from hay_productos) then 'Productos no está instalado (22-catalogo.sql)'
         when coalesce((select otra_moneda from productos_datos), 0) = 0 then ''
         else (select otra_moneda from productos_datos)::text || ' producto(s) con precio en otra moneda: no se proponen en Ventas' end
) v
order by orden;

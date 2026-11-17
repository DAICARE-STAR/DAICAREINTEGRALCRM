-- ============================================================
-- 00b-contrato-tabla.sql — Núcleo: contrato base de las tablas de negocio
-- de un módulo (BL-02) e importe con moneda como par (BL-08)
-- Esquema consolidado del producto (PP-DEC-02, PP-DEC-23, PP-DEC-24). Lo
-- aplica tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un
-- archivo aplicado no se edita: un cambio va en un archivo nuevo. Lleva
-- letra para no renumerar: en una instalación hecha se aplica después de
-- 09; en una nueva, entre 00 y 01 (solo necesita el esquema auth).
--
-- Origen: código nuevo del producto. Convenciones en docs/esquema.md.
--
-- Contrato base (PP-DEC-23): toda tabla de negocio de un módulo lleva
-- created_by, updated_by, created_at, updated_at, creado_via y
-- archivado_en, y el trigger contrato_sellar. El trigger sella autoría y
-- fechas con la sesión de quien escribe (auth.uid(); null sin sesión: la
-- service role, el instalador o el SQL Editor) y el cliente no puede
-- falsearlas: lo que mande en esas columnas se ignora. creado_via lo
-- declara quien inserta (por defecto 'manual') y no cambia después; no es
-- una garantía de seguridad: un miembro puede declarar 'importacion'. El
-- archivo de cada módulo aplica el contrato con contrato_aplicar(tabla);
-- las tablas exentas y por qué están en src/lib/__tests__/contrato-tabla.test.ts.
--
-- Moneda como par (PP-DEC-24): un importe son dos columnas, <col>
-- public.importe y <col>_moneda public.codigo_moneda, con un check de
-- pareja (las dos o ninguna). Dos columnas y no un tipo compuesto: la API
-- y supabase-js filtran, ordenan y suman columnas simples; un compuesto
-- llega como objeto, no se filtra con eq y su not null no mira los campos.
-- La moneda por defecto de la instalación es instalacion.moneda_base
-- (04-instalacion-modulos.sql): la pone el cliente al escribir.
--
-- Requisitos: esquema auth de Supabase (auth.uid()); ejecutarlo como
-- postgres. El bloque 0 aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                         | Qué                                                   |
--   |--------------------------------|-------------------------------------------------------|
--   | via_creacion (dominio)         | manual, importacion, api, regla o sistema             |
--   | codigo_moneda (dominio)        | código ISO 4217: tres letras mayúsculas               |
--   | importe (dominio)              | numeric(18,4) sin NaN                                 |
--   | contrato_sellar()              | trigger: sella autoría y fechas, fija creado_via      |
--   | contrato_aplicar(tabla, sin)   | añade las columnas que falten y el trigger; solo la   |
--   |                                | ejecuta el dueño (archivos de módulo)                 |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '00b-contrato-tabla detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception '00b-contrato-tabla detenido: falta el esquema auth de Supabase (auth.uid())';
  end if;
end $$;

-- ============ 1) Dominios ============
-- Un dominio no admite «create … if not exists»: se crea solo si falta.
-- codigo_moneda usa la misma regla que instalacion.moneda_base. importe:
-- hasta 14 cifras enteras y 4 decimales (cubre toda moneda ISO 4217); un
-- valor con más decimales se redondea al guardarse y el infinito lo
-- rechaza la precisión.
do $$
begin
  if to_regtype('public.via_creacion') is null then
    create domain public.via_creacion as text
      constraint via_creacion_check check (value in ('manual', 'importacion', 'api', 'regla', 'sistema'));
  end if;
  if to_regtype('public.codigo_moneda') is null then
    create domain public.codigo_moneda as text
      constraint codigo_moneda_check check (value ~ '^[A-Z]{3}$');
  end if;
  if to_regtype('public.importe') is null then
    create domain public.importe as numeric(18, 4)
      constraint importe_check check (value <> 'NaN'::numeric);
  end if;
end $$;

-- ============ 2) Sello de autoría y fechas ============
-- Alta: created_by y updated_by de la sesión, created_at y updated_at
-- ahora, creado_via la declarada o 'manual'. Cambio: created_by,
-- created_at y creado_via los de antes; updated_by y updated_at de este
-- cambio. Funciona con las columnas que la tabla tenga (una tabla puede
-- omitir created_by o archivado_en con contrato_aplicar): las claves que no
-- son columnas se ignoran. Sin security definer: no lee ninguna tabla.
create or replace function public.contrato_sellar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_antes jsonb;
begin
  if tg_op = 'INSERT' then
    return jsonb_populate_record(new, jsonb_build_object(
      'created_by', auth.uid(), 'updated_by', auth.uid(), 'created_at', now(), 'updated_at', now(),
      'creado_via', coalesce(nullif(to_jsonb(new) -> 'creado_via', 'null'::jsonb), to_jsonb('manual'::text))));
  end if;
  v_antes := to_jsonb(old);
  return jsonb_populate_record(new, jsonb_build_object(
    'created_by', v_antes -> 'created_by', 'created_at', v_antes -> 'created_at', 'creado_via', v_antes -> 'creado_via',
    'updated_by', auth.uid(), 'updated_at', now()));
end;
$$;

revoke execute on function public.contrato_sellar() from public, anon, authenticated;

-- ============ 3) Aplicar el contrato a una tabla ============
-- Añade las columnas del contrato que falten (las nuevas con su valor por
-- defecto: las filas que ya existen quedan con creado_via 'manual' y
-- updated_by null), comprueba el tipo de las que ya estaban y pone el
-- trigger contrato_sellar. p_sin solo puede omitir created_by (la tabla
-- tiene su propia columna de autor) o archivado_en (la tabla no se
-- archiva); el motivo va en src/lib/__tests__/contrato-tabla.test.ts. El
-- trigger se nombra con %I en format: drop y create del mismo nombre.
create or replace function public.contrato_aplicar(p_tabla regclass, p_sin text[] default '{}')
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_esquema text;
  v_nombre text;
  v_falla text;
  c record;
begin
  select n.nspname, k.relname into v_esquema, v_nombre
    from pg_catalog.pg_class k join pg_catalog.pg_namespace n on n.oid = k.relnamespace
   where k.oid = p_tabla and k.relkind in ('r', 'p');
  if v_nombre is null then
    raise exception 'contrato_aplicar: % no es una tabla', p_tabla;
  end if;
  if exists (select 1 from unnest(coalesce(p_sin, '{}')) x where x is null or x not in ('created_by', 'archivado_en')) then
    raise exception 'contrato_aplicar: solo se omiten created_by o archivado_en';
  end if;

  for c in
    select x.columna, x.definicion, x.tipo, x.obligatoria
      from (values ('created_by', 'uuid', 'uuid'::regtype, false),
                   ('updated_by', 'uuid', 'uuid'::regtype, false),
                   ('created_at', 'timestamptz not null default now()', 'timestamptz'::regtype, true),
                   ('updated_at', 'timestamptz not null default now()', 'timestamptz'::regtype, true),
                   ('creado_via', 'public.via_creacion not null default ''manual''', 'public.via_creacion'::regtype, true),
                   ('archivado_en', 'timestamptz', 'timestamptz'::regtype, false)) x(columna, definicion, tipo, obligatoria)
     where not (x.columna = any (coalesce(p_sin, '{}')))
  loop
    execute format('alter table %I.%I add column if not exists %I %s', v_esquema, v_nombre, c.columna, c.definicion);
    select string_agg(c.columna, '') into v_falla
      from pg_catalog.pg_attribute a
     where a.attrelid = p_tabla and a.attname = c.columna and not a.attisdropped
       and (a.atttypid <> c.tipo or (c.obligatoria and not a.attnotnull));
    if v_falla is not null then
      raise exception 'contrato_aplicar: %.% ya existe con otro tipo o admite null', v_nombre, c.columna;
    end if;
  end loop;

  execute format('drop trigger if exists %I on %I.%I', 'contrato_sellar', v_esquema, v_nombre);
  execute format('create trigger %I before insert or update on %I.%I for each row execute function public.contrato_sellar()',
                 'contrato_sellar', v_esquema, v_nombre);
end;
$$;

revoke execute on function public.contrato_aplicar(regclass, text[]) from public, anon, authenticated, service_role;

-- ============ Verificación: aborta el archivo si algo no quedó ============
-- Prueba el contrato y los dominios sobre una tabla temporal que se borra
-- al final: un sello que no sella o un dominio que admite basura aborta.
do $$
declare
  v_otro uuid := gen_random_uuid();
  v_n int;
  v text;
begin
  if (select count(*) from pg_catalog.pg_proc p
       where p.oid in (to_regprocedure('public.contrato_sellar()'), to_regprocedure('public.contrato_aplicar(regclass,text[])'))
         and not p.prosecdef
         and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) <> 2 then
    raise exception '00b-contrato-tabla: contrato_sellar o contrato_aplicar falta, quedó security definer o sin search_path';
  end if;
  if has_function_privilege('anon', 'public.contrato_aplicar(regclass,text[])', 'execute')
     or has_function_privilege('authenticated', 'public.contrato_aplicar(regclass,text[])', 'execute')
     or has_function_privilege('service_role', 'public.contrato_aplicar(regclass,text[])', 'execute')
     or has_function_privilege('anon', 'public.contrato_sellar()', 'execute')
     or has_function_privilege('authenticated', 'public.contrato_sellar()', 'execute') then
    raise exception '00b-contrato-tabla: contrato_aplicar o contrato_sellar ejecutable por la API';
  end if;
  if to_regtype('public.via_creacion') is null or to_regtype('public.codigo_moneda') is null or to_regtype('public.importe') is null then
    raise exception '00b-contrato-tabla: faltan los dominios via_creacion, codigo_moneda o importe';
  end if;

  -- Sin sesión (como el instalador): created_by y updated_by quedan null
  perform set_config('request.jwt.claims', '', true);
  create temp table contrato_prueba (id int primary key, nombre text,
                                     total public.importe, total_moneda public.codigo_moneda,
                                     constraint contrato_prueba_total_moneda_check check ((total is null) = (total_moneda is null)));
  perform public.contrato_aplicar('contrato_prueba'::regclass);

  insert into contrato_prueba (id, nombre, created_by, updated_by, created_at, updated_at, creado_via)
  values (1, 'a', v_otro, v_otro, '2000-01-01', '2000-01-01', 'importacion');
  select count(*) into v_n from contrato_prueba
   where created_by is null and updated_by is null and created_at = now() and updated_at = now()
     and creado_via = 'importacion' and archivado_en is null;
  if v_n <> 1 then
    raise exception '00b-contrato-tabla: el alta no selló autoría ni fechas';
  end if;

  update contrato_prueba set nombre = 'b', created_by = v_otro, created_at = '2000-01-01', creado_via = 'api',
                             updated_by = v_otro, updated_at = '2000-01-01';
  select count(*) into v_n from contrato_prueba
   where created_by is null and updated_by is null and created_at = now() and updated_at = now() and creado_via = 'importacion';
  if v_n <> 1 then
    raise exception '00b-contrato-tabla: el cambio no conservó created_by, created_at o creado_via';
  end if;

  insert into contrato_prueba (id, nombre, total, total_moneda) values (2, 'c', 1234.5, 'COP');
  select count(*) into v_n from contrato_prueba where id = 2 and creado_via = 'manual';
  if v_n <> 1 then
    raise exception '00b-contrato-tabla: creado_via no quedó en manual por defecto';
  end if;

  foreach v in array array['moneda minúscula', 'moneda sin importe', 'importe sin moneda', 'importe NaN', 'vía desconocida'] loop
    begin
      case v
        when 'moneda minúscula' then insert into contrato_prueba (id, total, total_moneda) values (3, 1, 'cop');
        when 'moneda sin importe' then insert into contrato_prueba (id, total_moneda) values (3, 'COP');
        when 'importe sin moneda' then insert into contrato_prueba (id, total) values (3, 1);
        when 'importe NaN' then insert into contrato_prueba (id, total, total_moneda) values (3, 'NaN', 'COP');
        else insert into contrato_prueba (id, creado_via) values (3, 'otra');
      end case;
    exception when check_violation then
      continue;
    end;
    raise exception '00b-contrato-tabla: se admitió %', v;
  end loop;

  drop table contrato_prueba;
end $$;

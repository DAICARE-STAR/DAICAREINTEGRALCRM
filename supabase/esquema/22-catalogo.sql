-- ============================================================
-- 22-catalogo.sql — Módulo productos: catálogo de productos, categorías,
-- unidades y conversiones, clases de impuesto, historial y contrato de las
-- líneas que cuentan productos
-- Esquema del producto (PP-DEC-02, PP-DEC-23, PP-DEC-24, PP-DEC-25). Lo
-- aplica tools/instalar/aplicar.mjs --archivo al activar el módulo, en una
-- transacción. IDEMPOTENTE. Un archivo aplicado no se edita: un cambio va
-- en un archivo nuevo (22b-…).
--
-- Origen: código nuevo del producto (diseño en docs/modulos/productos.md).
-- Patrones de team-portal (solo lectura): catálogo buscable con historial
-- por trigger y archivo en lugar de borrado (migración 55), pg_trgm en
-- extensions, búsqueda paginada con total y escape de comodines, y
-- familias con padre como árbol (migración 91). Sin marcas, voltajes ni
-- monedas fijas.
--
-- Decisiones del usuario (2026-11-19): el código se escribe a mano o, si
-- llega vacío, lo pone la serie producto (P-00001); se guarda en
-- mayúsculas, sin espacios, solo A-Z, cifras y . _ / -; el código de un
-- producto archivado no se reutiliza; el precio de lista va SIN IVA; una
-- clase de impuesto por producto; cada producto lleva «se vende»
-- (vendible) y «se compra» (comprable); solo Colombia, con claves neutras y
-- tarifas editables.
--
-- Requisitos: núcleo 00 a 09 aplicado (con 00b, 09b y 09c); ejecutarlo
-- como postgres; pg_trgm ausente o en el esquema extensions. El bloque 0
-- aborta sin cambiar nada si falta algo. No necesita el CRM.
--
-- Efectos:
--   | Objeto                         | Qué                                                        |
--   |--------------------------------|------------------------------------------------------------|
--   | pg_trgm (extensions)           | índices gin de la búsqueda por código y nombre             |
--   | productos_unidades             | catálogo de unidades con clave inmutable; sistema y        |
--   |                                | codigo_dian no los escribe la API; und no se borra         |
--   | productos_impuestos            | clases de impuesto con clave, tipo y tratamiento           |
--   |                                | inmutables; exactamente una predeterminada activa          |
--   | productos_categorias           | árbol de hasta tres niveles, sin ciclos                    |
--   | productos                      | código único para siempre, normalizado y con serie;        |
--   |                                | precio de lista sin IVA por unidad base (par importe y     |
--   |                                | moneda); vendible y comprable                              |
--   | productos_conversiones         | unidades alternas con factor exacto                        |
--   | productos_cambios              | historial; solo lo escribe productos_registrar_cambio      |
--   | productos_lineas               | registro de las tablas de líneas de otros módulos          |
--   | productos_puede_leer()         | quien ve Productos o un módulo que depende del catálogo    |
--   | productos_buscar(…)            | búsqueda paginada con total (security invoker)             |
--   | productos_importar(…)          | importación por lotes con simulacro (security invoker)     |
--   | productos_factor(…)            | factor de una unidad del producto                          |
--   | productos_impuesto_predeterminar | cambia la clase predeterminada (administrador)           |
--   | productos_aplicar_linea(…)     | contrato de las líneas; solo el dueño (archivos de módulo) |
--   | serie producto                 | con huecos, sin reinicio, P- y 5 cifras                    |
--
-- Únicas funciones security definer: productos_preparar (pide el número a
-- la serie y mira las líneas de otros módulos) y productos_registrar_cambio
-- (escribe el historial, que la API no escribe).
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
declare
  v_esquema text;
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '22-catalogo detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.has_modulo(text)') is null or to_regprocedure('public.puede_ver_app(text)') is null
     or to_regprocedure('public.aplicar_politica_modulo(regclass,text[])') is null
     or to_regclass('public.instalacion') is null then
    raise exception '22-catalogo detenido: falta 04-instalacion-modulos.sql';
  end if;
  if to_regprocedure('public.auditar_cambio()') is null or to_regclass('public.audit_log') is null then
    raise exception '22-catalogo detenido: falta 02-auditoria.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '22-catalogo detenido: falta 03-mfa.sql';
  end if;
  if to_regprocedure('public.contrato_aplicar(regclass,text[])') is null
     or to_regtype('public.importe') is null or to_regtype('public.codigo_moneda') is null then
    raise exception '22-catalogo detenido: falta 00b-contrato-tabla.sql (npm run instalar aplica el núcleo)';
  end if;
  if to_regprocedure('public.series_siguiente(text,date)') is null or to_regclass('public.series') is null then
    raise exception '22-catalogo detenido: falta 09b-numeracion.sql (npm run instalar aplica el núcleo)';
  end if;
  if to_regnamespace('extensions') is null then
    raise exception '22-catalogo detenido: falta el esquema extensions de Supabase';
  end if;
  select n.nspname into v_esquema
    from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_esquema is not null and v_esquema <> 'extensions' then
    raise exception '22-catalogo detenido: pg_trgm está instalada en el esquema % y no en extensions', v_esquema;
  end if;
end $$;

-- ============ 1) Extensión ============
create extension if not exists pg_trgm with schema extensions;

-- ============ 2) Tablas ============
-- En el orden de sus llaves: unidades, impuestos, categorías, productos,
-- conversiones, historial y registro de líneas.

-- Unidades: la clave es lo que guardan el producto y las líneas; el nombre
-- se corrige sin tocar datos. decimales lo usarán los documentos al validar
-- cantidades. codigo_dian lo carga Facturación (0.9) desde el anexo técnico
-- vigente; sistema marca la unidad por defecto, que no se borra ni se
-- archiva. Ni sistema ni codigo_dian los escribe la API (grants por columna).
create table if not exists public.productos_unidades (
  clave text primary key constraint productos_unidades_clave_check check (clave ~ '^[a-z][a-z0-9_]{0,19}$'),
  nombre text not null constraint productos_unidades_nombre_check check (char_length(btrim(nombre)) between 1 and 40),
  simbolo text constraint productos_unidades_simbolo_check check (simbolo is null or char_length(simbolo) <= 10),
  decimales smallint not null default 0 constraint productos_unidades_decimales_check check (decimales between 0 and 6),
  codigo_dian text constraint productos_unidades_codigo_dian_check check (codigo_dian is null or codigo_dian ~ '^[A-Z0-9]{1,3}$'),
  sistema boolean not null default false
);

select public.contrato_aplicar('public.productos_unidades');

create unique index if not exists productos_unidades_nombre_unico
  on public.productos_unidades (lower(btrim(nombre))) where archivado_en is null;

-- Clases de impuesto: el producto guarda la clase, no la tarifa. Tipo y
-- tratamiento no cambian tras el alta (un tratamiento distinto es otra
-- clase); el porcentaje sí, y las líneas lo copian al crearse. Se llama
-- porcentaje y no tarifa: un numeric con nombre de dinero tiene que ser un
-- importe (contrato-tabla.test.ts).
create table if not exists public.productos_impuestos (
  clave text primary key constraint productos_impuestos_clave_check check (clave ~ '^[a-z][a-z0-9_]{0,29}$'),
  nombre text not null constraint productos_impuestos_nombre_check check (char_length(btrim(nombre)) between 1 and 60),
  tipo text not null constraint productos_impuestos_tipo_check check (tipo in ('iva', 'inc', 'otro')),
  tratamiento text not null constraint productos_impuestos_tratamiento_check check (tratamiento in ('gravado', 'exento', 'excluido')),
  porcentaje numeric(7, 4) not null default 0 constraint productos_impuestos_porcentaje_check check (porcentaje between 0 and 100),
  predeterminado boolean not null default false,
  constraint productos_impuestos_porcentaje_gravado_check check (tratamiento = 'gravado' or porcentaje = 0)
);

select public.contrato_aplicar('public.productos_impuestos');

create unique index if not exists productos_impuestos_predeterminado_unico
  on public.productos_impuestos (predeterminado) where predeterminado and archivado_en is null;

-- Categorías: árbol por id (el nombre se edita libremente). Sin «/» en el
-- nombre: el CSV escribe la ruta como «A / B».
create table if not exists public.productos_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
    constraint productos_categorias_nombre_check check (char_length(btrim(nombre)) between 1 and 80 and position('/' in nombre) = 0),
  padre_id uuid constraint productos_categorias_padre_id_fkey references public.productos_categorias (id) on delete restrict,
  orden int not null default 0,
  constraint productos_categorias_padre_check check (padre_id is distinct from id)
);

select public.contrato_aplicar('public.productos_categorias');

create unique index if not exists productos_categorias_nombre_unico
  on public.productos_categorias (coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nombre)))
  where archivado_en is null;
create index if not exists productos_categorias_padre_idx on public.productos_categorias (padre_id);

-- Productos. El código lo normaliza productos_preparar (sin espacios, en
-- mayúsculas) y es único entre todos, también los archivados: recuperarlo
-- es restaurar el producto. El precio de lista es el general de venta, SIN
-- IVA, por unidad base, en la moneda base de la instalación; nulo es sin
-- precio publicado.
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null constraint productos_codigo_check check (codigo ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  nombre text not null constraint productos_nombre_check check (char_length(btrim(nombre)) between 1 and 200),
  descripcion text constraint productos_descripcion_check check (descripcion is null or char_length(descripcion) <= 4000),
  tipo text not null default 'bien' constraint productos_tipo_check check (tipo in ('bien', 'servicio')),
  vendible boolean not null default true,
  comprable boolean not null default true,
  categoria_id uuid constraint productos_categoria_id_fkey references public.productos_categorias (id) on delete restrict,
  unidad_base text not null default 'und'
    constraint productos_unidad_base_fkey references public.productos_unidades (clave) on delete restrict,
  impuesto text not null constraint productos_impuesto_fkey references public.productos_impuestos (clave) on delete restrict,
  precio_lista public.importe constraint productos_precio_lista_check check (precio_lista is null or precio_lista >= 0),
  precio_lista_moneda public.codigo_moneda,
  constraint productos_precio_lista_moneda_check check ((precio_lista is null) = (precio_lista_moneda is null))
);

select public.contrato_aplicar('public.productos');

create unique index if not exists productos_codigo_unico on public.productos (codigo);
create index if not exists productos_codigo_trgm on public.productos using gin (codigo extensions.gin_trgm_ops);
create index if not exists productos_nombre_trgm on public.productos using gin (nombre extensions.gin_trgm_ops);
create index if not exists productos_categoria_idx on public.productos (categoria_id);
create index if not exists productos_unidad_idx on public.productos (unidad_base);
create index if not exists productos_impuesto_idx on public.productos (impuesto);
create index if not exists productos_activos_nombre_idx on public.productos (nombre, id) where archivado_en is null;

-- Conversiones: cuántas unidades base hay en una unidad alterna (1 caja =
-- 12 und es factor 12). Un factor menor que 1 solo si es el inverso de un
-- entero: la base es la unidad menor y así todo factor guardado es exacto.
-- Se quitan, no se archivan: las líneas guardan su propio factor.
create table if not exists public.productos_conversiones (
  producto_id uuid not null constraint productos_conversiones_producto_id_fkey references public.productos (id) on delete cascade,
  unidad text not null constraint productos_conversiones_unidad_fkey references public.productos_unidades (clave) on delete restrict,
  factor numeric(18, 6) not null constraint productos_conversiones_factor_check check (factor > 0),
  constraint productos_conversiones_factor_exacto_check check (factor >= 1 or mod(1::numeric, factor) = 0),
  primary key (producto_id, unidad)
);

select public.contrato_aplicar('public.productos_conversiones', array['archivado_en']);

create index if not exists productos_conversiones_unidad_idx on public.productos_conversiones (unidad);

-- Historial del producto, sus conversiones y los tres catálogos. Sin llave
-- foránea: el historial de un producto borrado sobrevive. entidad_id es el
-- id del producto (también para sus conversiones), la clave de la unidad o
-- de la clase, o el id de la categoría.
create table if not exists public.productos_cambios (
  id bigint generated always as identity primary key,
  entidad text not null
    constraint productos_cambios_entidad_check check (entidad in ('producto', 'conversion', 'unidad', 'impuesto', 'categoria')),
  entidad_id text not null,
  operacion text not null constraint productos_cambios_operacion_check check (operacion in ('insert', 'update', 'delete')),
  campos text[] not null default '{}',
  antes jsonb,
  despues jsonb,
  autor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists productos_cambios_entidad_idx on public.productos_cambios (entidad_id, created_at desc);

-- Registro de las tablas de líneas de Inventario, Compras, Ventas y
-- Facturación: solo lo escribe productos_aplicar_linea (el dueño); lo lee
-- productos_preparar antes de dejar cambiar una unidad base.
create table if not exists public.productos_lineas (
  tabla regclass primary key,
  modulo text not null constraint productos_lineas_modulo_check check (modulo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  con_impuesto boolean not null,
  created_at timestamptz not null default now()
);

-- ============ 3) Lectura del catálogo y factor ============
-- Lee el catálogo quien ve Productos o un módulo que depende directamente
-- de él (los que tienen 'productos' en depende del registro): quien
-- registra un pedido elige un producto sin tener el módulo entero. La
-- lista la compara esquema.test.ts con el registro; un dependiente nuevo
-- exige un 22b que reescriba esta función. puede_ver_app ya es definer y
-- da falso con el módulo inactivo.
create or replace function public.productos_puede_leer()
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1
      from unnest(array['productos', 'cotizador', 'inventario', 'compras', 'ventas', 'facturacion']) s
     where public.puede_ver_app(s)
  );
$$;

revoke execute on function public.productos_puede_leer() from public, anon;
grant execute on function public.productos_puede_leer() to authenticated;

-- 1 para la unidad base, el de la conversión para una alterna; sin
-- conversión es un error con pista. Única fuente del factor de las líneas.
create or replace function public.productos_factor(p_producto uuid, p_unidad text)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_base text;
  v_factor numeric;
begin
  select p.unidad_base into v_base from public.productos p where p.id = p_producto;
  if not found then
    raise exception 'productos: el producto no existe' using errcode = 'P0002', hint = 'productos_no_existe';
  end if;
  if p_unidad = v_base then
    return 1;
  end if;
  select c.factor into v_factor from public.productos_conversiones c where c.producto_id = p_producto and c.unidad = p_unidad;
  if not found then
    raise exception 'productos: el producto no tiene conversión a esa unidad' using errcode = '22023', hint = 'productos_unidad_sin_conversion';
  end if;
  return v_factor;
end;
$$;

revoke execute on function public.productos_factor(uuid, text) from public, anon;
grant execute on function public.productos_factor(uuid, text) to authenticated;

-- ============ 4) Triggers ============
-- Prepara el producto antes de escribirlo: código, impuesto, moneda,
-- unidad base y referencias archivadas. security definer porque pide el
-- número a series_siguiente (solo service role y definer, PP-DEC-25) y
-- mira las líneas de otros módulos sin la RLS de quien edita. No confía en
-- nada del cliente: lee la propia fila, instalacion, los catálogos, el
-- registro de líneas y la serie. El cambio de unidad base toma un bloqueo
-- exclusivo por producto que choca con el compartido de
-- productos_linea_preparar: una línea nueva y el cambio no se cruzan.
create or replace function public.productos_preparar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_codigo text;
  v_intento bigint := 0;
  v_tope bigint;
  v_moneda text;
  v_en_uso boolean;
  t record;
begin
  -- 1) Código: sin espacios y en mayúsculas. Vacío en el alta: de la serie,
  -- normalizado y validado como uno manual; si ya existe, el siguiente
  if tg_op = 'INSERT' and nullif(regexp_replace(coalesce(new.codigo, ''), '[[:space:]]', '', 'g'), '') is null then
    select count(*) + 1 into v_tope from public.productos;
    loop
      v_intento := v_intento + 1;
      v_codigo := upper(regexp_replace(public.series_siguiente('producto'), '[[:space:]]', '', 'g'));
      if v_codigo !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
        raise exception 'productos: el prefijo de la serie producto no da un código válido'
          using errcode = '23514', hint = 'productos_codigo_serie';
      end if;
      exit when not exists (select 1 from public.productos p where p.codigo = v_codigo);
      if v_intento >= v_tope then
        raise exception 'productos: la serie producto no dio un código libre' using errcode = '23505', hint = 'productos_codigo_serie';
      end if;
    end loop;
    new.codigo := v_codigo;
  elsif tg_op = 'INSERT' or new.codigo is distinct from old.codigo then
    new.codigo := upper(regexp_replace(new.codigo, '[[:space:]]', '', 'g'));
  end if;

  -- 2) Impuesto: en el alta, la clase predeterminada si llega nula. En un
  -- cambio, nula falla por el not null: no se reclasifica en silencio
  if tg_op = 'INSERT' and new.impuesto is null then
    select i.clave into new.impuesto
      from public.productos_impuestos i
     where i.predeterminado and i.archivado_en is null;
    if new.impuesto is null then
      raise exception 'productos: no hay una clase de impuesto predeterminada' using errcode = '23514', hint = 'productos_sin_impuesto';
    end if;
  end if;

  -- 3) Moneda: solo si cambian precio o moneda. Con precio y sin moneda,
  -- la base; otra moneda falla; quitar el precio quita la moneda. Una
  -- moneda sin precio la rechaza el check de pareja
  if tg_op = 'INSERT' or new.precio_lista is distinct from old.precio_lista
     or new.precio_lista_moneda is distinct from old.precio_lista_moneda then
    if new.precio_lista is null then
      if tg_op = 'UPDATE' and old.precio_lista is not null then
        new.precio_lista_moneda := null;
      end if;
    else
      select i.moneda_base into v_moneda from public.instalacion i where i.id = 1;
      if new.precio_lista_moneda is null then
        new.precio_lista_moneda := v_moneda;
      elsif new.precio_lista_moneda is distinct from v_moneda then
        raise exception 'productos: el precio de lista va en la moneda base de la instalación'
          using errcode = '23514', hint = 'productos_moneda';
      end if;
    end if;
  end if;

  -- 4) Unidad base: no cambia con conversiones, con precio (es por la unidad
  -- anterior) ni con líneas en cualquier tabla registrada
  if tg_op = 'UPDATE' and new.unidad_base is distinct from old.unidad_base then
    perform pg_advisory_xact_lock(hashtext('public.productos'), hashtext(new.id::text));
    if exists (select 1 from public.productos_conversiones c where c.producto_id = new.id) then
      raise exception 'productos: la unidad base no cambia mientras el producto tenga unidades alternas'
        using errcode = '23514', hint = 'productos_unidad_con_conversiones';
    end if;
    if new.precio_lista is not null then
      raise exception 'productos: la unidad base no cambia con precio de lista; quita el precio, cambia la unidad y vuelve a ponerlo'
        using errcode = '23514', hint = 'productos_unidad_con_precio';
    end if;
    for t in select l.tabla from public.productos_lineas l loop
      execute format('select exists (select 1 from %s x where x.producto_id = $1)', t.tabla) into v_en_uso using new.id;
      if v_en_uso then
        raise exception 'productos: la unidad base no cambia con el producto en uso en documentos o movimientos'
          using errcode = '23514', hint = 'productos_unidad_en_uso';
      end if;
    end loop;
  end if;

  -- 5) Referencias archivadas: en el alta o si cambian. Un producto viejo
  -- con una unidad que se archivó después se sigue editando
  if (tg_op = 'INSERT' or new.unidad_base is distinct from old.unidad_base)
     and exists (select 1 from public.productos_unidades u where u.clave = new.unidad_base and u.archivado_en is not null) then
    raise exception 'productos: la unidad está archivada' using errcode = '23514', hint = 'productos_unidad_archivada';
  end if;
  if (tg_op = 'INSERT' or new.impuesto is distinct from old.impuesto)
     and exists (select 1 from public.productos_impuestos i where i.clave = new.impuesto and i.archivado_en is not null) then
    raise exception 'productos: la clase de impuesto está archivada' using errcode = '23514', hint = 'productos_impuesto_archivado';
  end if;
  if new.categoria_id is not null and (tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id)
     and exists (select 1 from public.productos_categorias c where c.id = new.categoria_id and c.archivado_en is not null) then
    raise exception 'productos: la categoría está archivada' using errcode = '23514', hint = 'productos_categoria_archivada';
  end if;
  return new;
end;
$$;

revoke execute on function public.productos_preparar() from public, anon, authenticated;

-- Historial: en un cambio, solo los campos que cambian, sin updated_at,
-- updated_by ni creado_via; cada lado recortado a 2 KB; una conversión
-- lleva siempre su unidad. El borrado deja la fila completa en antes (el
-- catálogo no tiene datos de personas). security definer: la API no tiene
-- insert sobre productos_cambios.
create or replace function public.productos_registrar_cambio()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entidad text;
  v_entidad_id text;
  v_antes jsonb;
  v_despues jsonb;
  v_campos text[];
begin
  v_entidad := case tg_table_name when 'productos' then 'producto' when 'productos_conversiones' then 'conversion'
                                  when 'productos_unidades' then 'unidad' when 'productos_impuestos' then 'impuesto'
                                  else 'categoria' end;
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old) - 'updated_at' - 'updated_by' - 'creado_via'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_despues := to_jsonb(new) - 'updated_at' - 'updated_by' - 'creado_via'; end if;
  v_entidad_id := coalesce(v_despues, v_antes) ->> case v_entidad when 'conversion' then 'producto_id'
                                                                  when 'unidad' then 'clave' when 'impuesto' then 'clave' else 'id' end;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_despues) k
     where (v_despues -> k) is distinct from (v_antes -> k);
    if v_campos is null then return null; end if;
    select jsonb_object_agg(k, v_antes -> k), jsonb_object_agg(k, v_despues -> k)
      into v_antes, v_despues
      from unnest(case when v_entidad = 'conversion' then array_append(v_campos, 'unidad') else v_campos end) k;
  else
    select array_agg(k order by k) into v_campos from jsonb_object_keys(coalesce(v_despues, v_antes)) k;
  end if;

  if octet_length(v_antes::text) > 2048 then
    v_antes := jsonb_build_object('_recortado', left(v_antes::text, 500));
  end if;
  if octet_length(v_despues::text) > 2048 then
    v_despues := jsonb_build_object('_recortado', left(v_despues::text, 500));
  end if;

  insert into public.productos_cambios (entidad, entidad_id, operacion, campos, antes, despues, autor_id)
  values (v_entidad, v_entidad_id, lower(tg_op), coalesce(v_campos, '{}'), v_antes, v_despues, auth.uid());
  return null;
end;
$$;

revoke execute on function public.productos_registrar_cambio() from public, anon, authenticated;

-- Unidades y clases: la clave no cambia; tipo y tratamiento de una clase
-- tampoco; la unidad del sistema no se borra ni se archiva. Que una clave en
-- uso no se borre lo da la llave restrict (23503).
create or replace function public.productos_clave_inmutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.clave is distinct from old.clave then
      raise exception 'productos: la clave no se cambia; crea otra y archiva esta' using errcode = '23514', hint = 'productos_clave_inmutable';
    end if;
    if tg_table_name = 'productos_impuestos' then
      if new.tipo is distinct from old.tipo or new.tratamiento is distinct from old.tratamiento then
        raise exception 'productos: el tipo y el tratamiento de una clase no cambian; crea otra clase'
          using errcode = '23514', hint = 'productos_clase_inmutable';
      end if;
    elsif old.sistema and new.archivado_en is not null then
      raise exception 'productos: la unidad del sistema no se archiva' using errcode = '23514', hint = 'productos_sistema';
    end if;
    return new;
  end if;
  if tg_table_name = 'productos_unidades' then
    if old.sistema then
      raise exception 'productos: la unidad del sistema no se borra' using errcode = '23514', hint = 'productos_sistema';
    end if;
  end if;
  return old;
end;
$$;

revoke execute on function public.productos_clave_inmutable() from public, anon, authenticated;

-- Al confirmar: exactamente una clase activa predeterminada. Diferido para
-- que productos_impuesto_predeterminar desmarque y marque en la misma
-- transacción.
create or replace function public.productos_impuestos_predeterminado()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.productos_impuestos i where i.predeterminado and i.archivado_en is null) <> 1 then
    raise exception 'productos: tiene que haber exactamente una clase de impuesto predeterminada y activa'
      using errcode = '23514', hint = 'productos_sin_predeterminado';
  end if;
  return null;
end;
$$;

revoke execute on function public.productos_impuestos_predeterminado() from public, anon, authenticated;

-- Árbol de categorías: sin ciclos, hasta tres niveles contando el subárbol
-- de la fila que se mueve, sin padre archivado y sin archivar una categoría
-- con hijas activas. Las escrituras del árbol se serializan con un bloqueo:
-- dos movimientos cruzados no pasan los dos la comprobación de ciclo. Las
-- consultas recursivas usan union y un tope de nivel: terminan aunque un
-- dato corrupto dejara un ciclo.
create or replace function public.productos_categorias_validar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_ciclo boolean;
  v_profundidad int;
  v_altura int;
begin
  if tg_op = 'INSERT' or new.padre_id is distinct from old.padre_id or new.archivado_en is distinct from old.archivado_en then
    perform pg_advisory_xact_lock(hashtext('public.productos_categorias'));

    if new.padre_id is not null and (tg_op = 'INSERT' or new.padre_id is distinct from old.padre_id) then
      with recursive a(id, padre_id, nivel) as (
        select c.id, c.padre_id, 1 from public.productos_categorias c where c.id = new.padre_id
        union
        select c.id, c.padre_id, a.nivel + 1
          from public.productos_categorias c join a on c.id = a.padre_id
         where a.nivel < 10
      )
      select coalesce(bool_or(a.id = new.id), false), coalesce(max(a.nivel), 0) into v_ciclo, v_profundidad from a;
      if v_ciclo then
        raise exception 'productos: una categoría no puede quedar dentro de sí misma' using errcode = '23514', hint = 'productos_categoria_ciclo';
      end if;
      with recursive d(id, nivel) as (
        select c.id, 1 from public.productos_categorias c where c.padre_id = new.id
        union
        select c.id, d.nivel + 1
          from public.productos_categorias c join d on c.padre_id = d.id
         where d.nivel < 10
      )
      select coalesce(max(d.nivel), 0) + 1 into v_altura from d;
      if v_profundidad + v_altura > 3 then
        raise exception 'productos: las categorías llegan hasta tres niveles' using errcode = '23514', hint = 'productos_categoria_profundidad';
      end if;
    end if;

    if new.padre_id is not null and new.archivado_en is null
       and (tg_op = 'INSERT' or new.padre_id is distinct from old.padre_id or old.archivado_en is not null)
       and exists (select 1 from public.productos_categorias c where c.id = new.padre_id and c.archivado_en is not null) then
      raise exception 'productos: la categoría superior está archivada' using errcode = '23514', hint = 'productos_categoria_archivada';
    end if;
    if tg_op = 'UPDATE' and new.archivado_en is not null and old.archivado_en is null
       and exists (select 1 from public.productos_categorias h where h.padre_id = new.id and h.archivado_en is null) then
      raise exception 'productos: archiva antes sus subcategorías' using errcode = '23514', hint = 'productos_categoria_con_hijas';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.productos_categorias_validar() from public, anon, authenticated;

-- Conversiones: lee el producto con for share, que choca con el bloqueo de
-- fila de un cambio de unidad base; rechaza la unidad base (su factor es 1
-- y no se guarda), un factor inexacto y una unidad archivada en el alta.
create or replace function public.productos_conversiones_validar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_base text;
begin
  select p.unidad_base into v_base from public.productos p where p.id = new.producto_id for share;
  if not found then
    raise exception 'productos: el producto no existe' using errcode = '23503', hint = 'productos_no_existe';
  end if;
  if new.unidad = v_base then
    raise exception 'productos: la unidad base no lleva conversión' using errcode = '23514', hint = 'productos_conversion_base';
  end if;
  if new.factor > 0 and new.factor < 1 and mod(1::numeric, new.factor) <> 0 then
    raise exception 'productos: ese factor no es exacto; usa como unidad base la unidad menor'
      using errcode = '23514', hint = 'productos_factor_inexacto';
  end if;
  if (tg_op = 'INSERT' or new.unidad is distinct from old.unidad)
     and exists (select 1 from public.productos_unidades u where u.clave = new.unidad and u.archivado_en is not null) then
    raise exception 'productos: la unidad está archivada' using errcode = '23514', hint = 'productos_unidad_archivada';
  end if;
  return new;
end;
$$;

revoke execute on function public.productos_conversiones_validar() from public, anon, authenticated;

-- Líneas de otros módulos (las pone productos_aplicar_linea con el
-- argumento con_impuesto). En el alta copia código, nombre, unidad, factor
-- y, con impuesto, la clase y su porcentaje, ignorando lo que mande el
-- cliente; en un cambio recalcula solo lo que depende de lo que cambió y
-- deja lo demás como estaba. Quien escribe una línea lee el catálogo pero
-- no tiene edit_productos, y un for share exige la política de update: por
-- eso el producto se protege con un bloqueo compartido por producto, que
-- choca con el exclusivo de productos_preparar al cambiar la unidad base.
create or replace function public.productos_linea_preparar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_con_impuesto boolean := coalesce(tg_argv[0], 'false')::boolean;
  v_cambia_producto boolean := tg_op = 'INSERT' or new.producto_id is distinct from old.producto_id;
  v_cambia_unidad boolean;
  v_porcentaje numeric;
  v_archivado timestamptz;
  p record;
begin
  v_cambia_unidad := v_cambia_producto or new.unidad is null or new.unidad is distinct from old.unidad;
  if v_cambia_unidad then
    perform pg_advisory_xact_lock_shared(hashtext('public.productos'), hashtext(new.producto_id::text));
  end if;
  select pr.codigo, pr.nombre, pr.unidad_base, pr.impuesto, pr.archivado_en into p
    from public.productos pr where pr.id = new.producto_id;
  if not found then
    raise exception 'productos: el producto no existe' using errcode = '23503', hint = 'productos_no_existe';
  end if;

  if v_cambia_producto then
    if p.archivado_en is not null then
      raise exception 'productos: el producto está archivado' using errcode = '23514', hint = 'productos_archivado';
    end if;
    new.producto_codigo := p.codigo;
    new.producto_nombre := p.nombre;
  else
    new.producto_codigo := old.producto_codigo;
    new.producto_nombre := old.producto_nombre;
  end if;

  if v_cambia_unidad then
    new.unidad := coalesce(new.unidad, p.unidad_base);
    if exists (select 1 from public.productos_unidades u where u.clave = new.unidad and u.archivado_en is not null) then
      raise exception 'productos: la unidad está archivada' using errcode = '23514', hint = 'productos_unidad_archivada';
    end if;
    new.factor := public.productos_factor(new.producto_id, new.unidad);
  else
    new.factor := old.factor;
  end if;

  if v_con_impuesto then
    if v_cambia_producto or new.impuesto is null or new.impuesto is distinct from old.impuesto then
      new.impuesto := coalesce(new.impuesto, p.impuesto);
      select i.porcentaje, i.archivado_en into v_porcentaje, v_archivado
        from public.productos_impuestos i where i.clave = new.impuesto;
      if not found then
        raise exception 'productos: la clase de impuesto no existe' using errcode = '23503', hint = 'productos_impuesto_no_existe';
      end if;
      if v_archivado is not null then
        raise exception 'productos: la clase de impuesto está archivada' using errcode = '23514', hint = 'productos_impuesto_archivado';
      end if;
      new.porcentaje_impuesto := v_porcentaje;
    else
      new.porcentaje_impuesto := old.porcentaje_impuesto;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.productos_linea_preparar() from public, anon, authenticated;

-- Los BEFORE de cada tabla van antes de zz_contrato_sellar (orden por nombre)
drop trigger if exists productos_preparar on public.productos;
create trigger productos_preparar before insert or update on public.productos
  for each row execute function public.productos_preparar();
drop trigger if exists productos_registrar_cambio on public.productos;
create trigger productos_registrar_cambio after insert or update or delete on public.productos
  for each row execute function public.productos_registrar_cambio();
-- El borrado físico (administrador, sin líneas) queda también en la auditoría
drop trigger if exists auditar_cambio on public.productos;
create trigger auditar_cambio after delete on public.productos
  for each row execute function public.auditar_cambio();

drop trigger if exists productos_conversiones_validar on public.productos_conversiones;
create trigger productos_conversiones_validar before insert or update on public.productos_conversiones
  for each row execute function public.productos_conversiones_validar();
drop trigger if exists productos_registrar_cambio on public.productos_conversiones;
create trigger productos_registrar_cambio after insert or update or delete on public.productos_conversiones
  for each row execute function public.productos_registrar_cambio();

drop trigger if exists productos_clave_inmutable on public.productos_unidades;
create trigger productos_clave_inmutable before update or delete on public.productos_unidades
  for each row execute function public.productos_clave_inmutable();
drop trigger if exists productos_registrar_cambio on public.productos_unidades;
create trigger productos_registrar_cambio after insert or update or delete on public.productos_unidades
  for each row execute function public.productos_registrar_cambio();

drop trigger if exists productos_clave_inmutable on public.productos_impuestos;
create trigger productos_clave_inmutable before update or delete on public.productos_impuestos
  for each row execute function public.productos_clave_inmutable();
drop trigger if exists productos_impuestos_predeterminado on public.productos_impuestos;
create constraint trigger productos_impuestos_predeterminado after insert or update or delete on public.productos_impuestos
  deferrable initially deferred
  for each row execute function public.productos_impuestos_predeterminado();
drop trigger if exists productos_registrar_cambio on public.productos_impuestos;
create trigger productos_registrar_cambio after insert or update or delete on public.productos_impuestos
  for each row execute function public.productos_registrar_cambio();

drop trigger if exists productos_categorias_validar on public.productos_categorias;
create trigger productos_categorias_validar before insert or update on public.productos_categorias
  for each row execute function public.productos_categorias_validar();
drop trigger if exists productos_registrar_cambio on public.productos_categorias;
create trigger productos_registrar_cambio after insert or update or delete on public.productos_categorias
  for each row execute function public.productos_registrar_cambio();

-- ============ 5) Búsqueda, importación y clase predeterminada ============
-- security invoker: la RLS de quien llama decide qué filas ve. Devuelve la
-- fila entera (fila public.productos): una columna nueva en un 22b no
-- obliga a recrear la función. Escapa \ % _ antes de armar el patrón y
-- compara además el código normalizado, que sale primero. p_uso 'venta'
-- filtra vendible y 'compra' comprable. p_categoria con p_subcategorias
-- incluye sus descendientes. Tope de 200 por página.
create or replace function public.productos_buscar(
  p_q text default null,
  p_categoria uuid default null,
  p_subcategorias boolean default true,
  p_tipo text default null,
  p_uso text default null,
  p_archivados boolean default false,
  p_limite int default 50,
  p_desde int default 0
)
returns table (fila public.productos, total bigint)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_uso is not null and p_uso not in ('venta', 'compra') then
    raise exception 'productos: el uso es venta o compra' using errcode = '22023', hint = 'productos_uso';
  end if;
  return query
  with recursive cats(id, nivel) as (
    select c.id, 1 from public.productos_categorias c where p_categoria is not null and c.id = p_categoria
    union
    select c.id, k.nivel + 1
      from public.productos_categorias c join cats k on c.padre_id = k.id
     where coalesce(p_subcategorias, true) and k.nivel < 10
  ),
  b as (
    select '%' || replace(replace(replace(nullif(btrim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron,
           nullif(upper(regexp_replace(coalesce(p_q, ''), '[[:space:]]', '', 'g')), '') as codigo
  )
  select p, count(*) over ()
    from public.productos p, b
   where (b.patron is null or p.codigo ilike b.patron or p.nombre ilike b.patron or p.codigo = b.codigo)
     and (p_categoria is null or p.categoria_id in (select cats.id from cats))
     and (p_tipo is null or p.tipo = p_tipo)
     and (p_uso is null or (p_uso = 'venta' and p.vendible) or (p_uso = 'compra' and p.comprable))
     and (coalesce(p_archivados, false) or p.archivado_en is null)
   order by (p.codigo = b.codigo) desc nulls last, p.nombre, p.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_desde, 0), 0);
end;
$$;

revoke execute on function public.productos_buscar(text, uuid, boolean, text, text, boolean, int, int) from public, anon;
grant execute on function public.productos_buscar(text, uuid, boolean, text, text, boolean, int, int) to authenticated;

-- Importación por lotes (hasta 500 filas ya mapeadas por el navegador).
-- security invoker: escribe lo mismo que el formulario, por la misma RLS.
-- Empareja por código normalizado (archivados incluidos); sin código crea
-- con el de la serie, salvo que ya exista un producto activo con el mismo
-- nombre. Una clave ausente o nula no cambia el valor guardado.
-- conversiones presente es el conjunto deseado: solo se tocan las que
-- difieren. Repetidos del lote (mismo código normalizado o, sin código,
-- mismo nombre) son error y no se escriben. Cada fila va en su propio
-- bloque: un error se anota en ella y no tumba las demás. Con p_simular
-- todo se deshace al final (y las altas sin código llevan un marcador
-- SIM- en lugar de pedir número a la serie, que no avanza); sin simular
-- deja una fila productos.importar en la auditoría.
create or replace function public.productos_importar(p_filas jsonb, p_simular boolean default true)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_repetidos jsonb;
  v_conteo jsonb := jsonb_build_object('crear', 0, 'actualizar', 0, 'sin_cambio', 0, 'error', 0);
  v_filas jsonb := '[]'::jsonb;
  e record;
  c record;
  v_prod public.productos;
  v_cod text;
  v_nombre text;
  v_id uuid;
  v_accion text;
  v_cambia boolean;
  v_errores jsonb;
  v_n int;
  v_msg text;
  v_pista text;
  v_estado text;
begin
  if not public.has_perm('edit_productos') then
    raise exception 'productos: no tienes permiso para importar' using errcode = '42501', hint = 'productos_importar';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 500 then
    raise exception 'productos: un lote es una lista de hasta 500 filas' using errcode = '22023', hint = 'productos_importar_lote';
  end if;

  with x as (
    select a.o::int as i, coalesce(a.v ->> 'fila', a.o::text) as fila,
           case when nullif(upper(regexp_replace(coalesce(a.v ->> 'codigo', ''), '[[:space:]]', '', 'g')), '') is not null
                  then 'c:' || upper(regexp_replace(a.v ->> 'codigo', '[[:space:]]', '', 'g'))
                when nullif(btrim(coalesce(a.v ->> 'nombre', '')), '') is not null
                  then 'n:' || lower(regexp_replace(btrim(a.v ->> 'nombre'), '[[:space:]]+', ' ', 'g'))
           end as clave
      from jsonb_array_elements(p_filas) with ordinality a(v, o)
  ),
  r as (
    select x.clave, string_agg(x.fila, ', ' order by x.i) as filas
      from x where x.clave is not null group by x.clave having count(*) > 1
  )
  select coalesce(jsonb_object_agg(x.i::text, r.filas), '{}'::jsonb) into v_repetidos
    from x join r on r.clave = x.clave;

  begin
    for e in select a.o::int as i, a.v as f from jsonb_array_elements(p_filas) with ordinality a(v, o) order by a.o loop
      v_id := null;
      v_accion := null;
      v_cambia := false;
      v_errores := '[]'::jsonb;
      v_cod := case when jsonb_typeof(e.f) = 'object'
                    then nullif(upper(regexp_replace(coalesce(e.f ->> 'codigo', ''), '[[:space:]]', '', 'g')), '') end;
      if jsonb_typeof(e.f) <> 'object' then
        v_accion := 'error';
        v_errores := jsonb_build_array(jsonb_build_object('pista', 'productos_importar_fila', 'mensaje', 'la fila no es un objeto'));
      elsif v_repetidos ? e.i::text then
        v_accion := 'error';
        v_errores := jsonb_build_array(jsonb_build_object('pista', 'productos_importar_repetido',
                                                          'mensaje', 'repetido en las filas ' || (v_repetidos ->> e.i::text)));
      else
        begin
          v_nombre := nullif(btrim(coalesce(e.f ->> 'nombre', '')), '');
          v_prod := null;
          if v_cod is not null then
            select * into v_prod from public.productos p where p.codigo = v_cod;
          elsif v_nombre is not null
                and exists (select 1 from public.productos p
                             where p.archivado_en is null
                               and lower(regexp_replace(btrim(p.nombre), '[[:space:]]+', ' ', 'g'))
                                   = lower(regexp_replace(v_nombre, '[[:space:]]+', ' ', 'g'))) then
            raise exception 'productos: ya existe un producto con ese nombre; pon su código'
              using errcode = '23505', hint = 'productos_importar_nombre';
          end if;

          if v_prod.id is null then
            insert into public.productos (codigo, nombre, descripcion, tipo, vendible, comprable, categoria_id,
                                          unidad_base, impuesto, precio_lista, archivado_en, creado_via)
            values (case when v_cod is not null then v_cod
                         when v_simular then 'SIM-' || replace(gen_random_uuid()::text, '-', '') end,
                    e.f ->> 'nombre',
                    e.f ->> 'descripcion',
                    coalesce(e.f ->> 'tipo', 'bien'),
                    coalesce((e.f ->> 'vendible')::boolean, true),
                    coalesce((e.f ->> 'comprable')::boolean, true),
                    (e.f ->> 'categoria_id')::uuid,
                    coalesce(e.f ->> 'unidad_base', 'und'),
                    e.f ->> 'impuesto',
                    (e.f ->> 'precio_lista')::numeric,
                    case when coalesce((e.f ->> 'archivado')::boolean, false) then now() end,
                    'importacion')
            returning id into v_id;
            v_accion := 'crear';
            if v_cod is null and not v_simular then
              select p.codigo into v_cod from public.productos p where p.id = v_id;
            end if;
          else
            v_id := v_prod.id;
            if ((e.f ->> 'nombre') is not null and (e.f ->> 'nombre') is distinct from v_prod.nombre)
               or ((e.f ->> 'descripcion') is not null and (e.f ->> 'descripcion') is distinct from v_prod.descripcion)
               or ((e.f ->> 'tipo') is not null and (e.f ->> 'tipo') is distinct from v_prod.tipo)
               or ((e.f ->> 'vendible') is not null and (e.f ->> 'vendible')::boolean is distinct from v_prod.vendible)
               or ((e.f ->> 'comprable') is not null and (e.f ->> 'comprable')::boolean is distinct from v_prod.comprable)
               or ((e.f ->> 'categoria_id') is not null and (e.f ->> 'categoria_id')::uuid is distinct from v_prod.categoria_id)
               or ((e.f ->> 'unidad_base') is not null and (e.f ->> 'unidad_base') is distinct from v_prod.unidad_base)
               or ((e.f ->> 'impuesto') is not null and (e.f ->> 'impuesto') is distinct from v_prod.impuesto)
               or ((e.f ->> 'precio_lista') is not null
                   and (e.f ->> 'precio_lista')::numeric(18, 4) is distinct from v_prod.precio_lista::numeric)
               or ((e.f ->> 'archivado') is not null
                   and (e.f ->> 'archivado')::boolean is distinct from (v_prod.archivado_en is not null)) then
              update public.productos p
                 set nombre = coalesce(e.f ->> 'nombre', p.nombre),
                     descripcion = coalesce(e.f ->> 'descripcion', p.descripcion),
                     tipo = coalesce(e.f ->> 'tipo', p.tipo),
                     vendible = coalesce((e.f ->> 'vendible')::boolean, p.vendible),
                     comprable = coalesce((e.f ->> 'comprable')::boolean, p.comprable),
                     categoria_id = coalesce((e.f ->> 'categoria_id')::uuid, p.categoria_id),
                     unidad_base = coalesce(e.f ->> 'unidad_base', p.unidad_base),
                     impuesto = coalesce(e.f ->> 'impuesto', p.impuesto),
                     precio_lista = coalesce((e.f ->> 'precio_lista')::numeric, p.precio_lista),
                     archivado_en = case when (e.f ->> 'archivado') is null then p.archivado_en
                                         when (e.f ->> 'archivado')::boolean then coalesce(p.archivado_en, now()) end
               where p.id = v_id;
              get diagnostics v_n = row_count;
              if v_n = 0 then
                raise exception 'productos: no se pudo actualizar el producto' using errcode = '42501', hint = 'productos_importar';
              end if;
              v_cambia := true;
            end if;
          end if;

          if jsonb_typeof(e.f -> 'conversiones') = 'array' then
            if exists (select 1 from jsonb_array_elements(e.f -> 'conversiones') x
                        group by x ->> 'unidad' having count(*) > 1) then
              raise exception 'productos: una unidad alterna va una sola vez' using errcode = '22023', hint = 'productos_conversion_repetida';
            end if;
            delete from public.productos_conversiones k
             where k.producto_id = v_id
               and not exists (select 1 from jsonb_array_elements(e.f -> 'conversiones') x where x ->> 'unidad' = k.unidad);
            get diagnostics v_n = row_count;
            if v_n > 0 then v_cambia := true; end if;
            for c in select x ->> 'unidad' as unidad, (x ->> 'factor')::numeric(18, 6) as factor
                       from jsonb_array_elements(e.f -> 'conversiones') x loop
              update public.productos_conversiones k set factor = c.factor
               where k.producto_id = v_id and k.unidad = c.unidad and k.factor is distinct from c.factor;
              get diagnostics v_n = row_count;
              if v_n > 0 then
                v_cambia := true;
              elsif not exists (select 1 from public.productos_conversiones k where k.producto_id = v_id and k.unidad = c.unidad) then
                insert into public.productos_conversiones (producto_id, unidad, factor, creado_via)
                values (v_id, c.unidad, c.factor, 'importacion');
                v_cambia := true;
              end if;
            end loop;
          end if;

          if v_accion is null then
            v_accion := case when v_cambia then 'actualizar' else 'sin_cambio' end;
          end if;
        exception when others then
          get stacked diagnostics v_msg = message_text, v_pista = pg_exception_hint, v_estado = returned_sqlstate;
          v_accion := 'error';
          v_id := null;
          v_cod := nullif(upper(regexp_replace(coalesce(e.f ->> 'codigo', ''), '[[:space:]]', '', 'g')), '');
          v_errores := jsonb_build_array(jsonb_build_object('pista', coalesce(nullif(v_pista, ''), v_estado), 'mensaje', v_msg));
        end;
      end if;

      v_conteo := jsonb_set(v_conteo, array[v_accion], to_jsonb((v_conteo ->> v_accion)::int + 1));
      v_filas := v_filas || jsonb_build_array(jsonb_build_object(
        'fila', case when jsonb_typeof(e.f) = 'object' and e.f ? 'fila' then e.f -> 'fila' else to_jsonb(e.i) end,
        'accion', v_accion,
        'id', case when v_simular and v_accion = 'crear' then null else v_id end,
        'codigo', v_cod,
        'errores', v_errores));
    end loop;

    if v_simular then
      raise exception 'productos: simulacro' using errcode = 'PPSIM';
    end if;
  exception when sqlstate 'PPSIM' then
    null;
  end;

  if not v_simular then
    insert into public.audit_log (user_id, action, detail, entity, origen)
    values (auth.uid(), 'productos.importar',
            format('Importó un lote: %s creados, %s actualizados, %s sin cambio, %s con error',
                   v_conteo ->> 'crear', v_conteo ->> 'actualizar', v_conteo ->> 'sin_cambio', v_conteo ->> 'error'),
            'productos', 'cliente');
  end if;
  return v_conteo || jsonb_build_object('filas', v_filas);
end;
$$;

revoke execute on function public.productos_importar(jsonb, boolean) from public, anon;
grant execute on function public.productos_importar(jsonb, boolean) to authenticated;

-- Cambia la clase predeterminada: desmarca la actual y marca la nueva, en
-- ese orden (el índice único no choca); el trigger diferido comprueba al
-- confirmar que queda exactamente una. La RLS la limita a un administrador.
create or replace function public.productos_impuesto_predeterminar(p_clave text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.productos_impuestos i where i.clave = p_clave and i.archivado_en is null) then
    raise exception 'productos: la clase de impuesto no existe o está archivada' using errcode = '23514', hint = 'productos_impuesto_archivado';
  end if;
  update public.productos_impuestos i set predeterminado = false where i.predeterminado and i.clave <> p_clave;
  update public.productos_impuestos i set predeterminado = true where i.clave = p_clave and not i.predeterminado;
  if not exists (select 1 from public.productos_impuestos i where i.clave = p_clave and i.predeterminado) then
    raise exception 'productos: solo un administrador cambia la clase predeterminada' using errcode = '42501', hint = 'productos_impuestos_admin';
  end if;
end;
$$;

revoke execute on function public.productos_impuesto_predeterminar(text) from public, anon;
grant execute on function public.productos_impuesto_predeterminar(text) to authenticated;

-- ============ 6) Contrato de las líneas que cuentan productos ============
-- Toda tabla de Inventario, Compras, Ventas o Facturación que cuente un
-- producto se crea en su archivo y luego llama
--   select public.productos_aplicar_linea('public.<tabla>', '<modulo>', <con_impuesto>);
-- Añade lo que falte (producto_id, producto_codigo, producto_nombre, unidad,
-- factor, cantidad, cantidad_base generada y, con impuesto, impuesto y
-- porcentaje_impuesto), comprueba el tipo de lo que ya estaba, pone las
-- llaves restrict, el check del factor, el índice <tabla>_producto_idx y el
-- trigger productos_linea_preparar, y registra la tabla en productos_lineas.
-- Solo la ejecuta el dueño (el instalador), como contrato_aplicar.
create or replace function public.productos_aplicar_linea(p_tabla regclass, p_modulo text, p_impuesto boolean default false)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_esquema text;
  v_nombre text;
  v_falla text;
  v_impuesto boolean := coalesce(p_impuesto, false);
  c record;
begin
  select n.nspname, k.relname into v_esquema, v_nombre
    from pg_catalog.pg_class k join pg_catalog.pg_namespace n on n.oid = k.relnamespace
   where k.oid = p_tabla and k.relkind = 'r';
  if v_nombre is null or v_esquema <> 'public' or v_nombre = 'productos' or v_nombre like 'productos\_%' then
    raise exception 'productos_aplicar_linea: % no es una tabla de líneas de public', p_tabla using errcode = '22023';
  end if;
  if p_modulo is null or p_modulo !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or p_modulo in ('nucleo', 'productos') then
    raise exception 'productos_aplicar_linea: módulo no válido: %', coalesce(p_modulo, 'null') using errcode = '22023';
  end if;

  for c in
    select x.columna, x.definicion, x.tipo, x.generada
      from (values ('producto_id', 'uuid not null', 'uuid', false, false),
                   ('producto_codigo', 'text not null', 'text', false, false),
                   ('producto_nombre', 'text not null', 'text', false, false),
                   ('unidad', 'text not null', 'text', false, false),
                   ('factor', 'numeric(18, 6) not null', 'numeric(18,6)', false, false),
                   ('cantidad', 'numeric(18, 6) not null', 'numeric(18,6)', false, false),
                   ('cantidad_base', 'numeric(18, 6) generated always as (round(cantidad * factor, 6)) stored', 'numeric(18,6)', true, false),
                   ('impuesto', 'text not null', 'text', false, true),
                   ('porcentaje_impuesto', 'numeric(7, 4) not null', 'numeric(7,4)', false, true)) x(columna, definicion, tipo, generada, de_impuesto)
     where not x.de_impuesto or v_impuesto
  loop
    execute format('alter table %I.%I add column if not exists %I %s', v_esquema, v_nombre, c.columna, c.definicion);
    select string_agg(c.columna, '') into v_falla
      from pg_catalog.pg_attribute a
     where a.attrelid = p_tabla and a.attname = c.columna and not a.attisdropped
       and (pg_catalog.format_type(a.atttypid, a.atttypmod) <> c.tipo
            or (a.attgenerated = 's') <> c.generada
            or (not c.generada and not a.attnotnull));
    if v_falla is not null then
      raise exception 'productos_aplicar_linea: %.% ya existe con otro tipo o admite null', v_nombre, c.columna;
    end if;
  end loop;

  execute format('alter table %I.%I drop constraint if exists %I', v_esquema, v_nombre, v_nombre || '_producto_id_fkey');
  execute format('alter table %I.%I add constraint %I foreign key (producto_id) references public.productos (id) on delete restrict',
                 v_esquema, v_nombre, v_nombre || '_producto_id_fkey');
  execute format('alter table %I.%I drop constraint if exists %I', v_esquema, v_nombre, v_nombre || '_unidad_fkey');
  execute format('alter table %I.%I add constraint %I foreign key (unidad) references public.productos_unidades (clave) on delete restrict',
                 v_esquema, v_nombre, v_nombre || '_unidad_fkey');
  if v_impuesto then
    execute format('alter table %I.%I drop constraint if exists %I', v_esquema, v_nombre, v_nombre || '_impuesto_fkey');
    execute format('alter table %I.%I add constraint %I foreign key (impuesto) references public.productos_impuestos (clave) on delete restrict',
                   v_esquema, v_nombre, v_nombre || '_impuesto_fkey');
  end if;
  execute format('alter table %I.%I drop constraint if exists %I', v_esquema, v_nombre, v_nombre || '_factor_check');
  execute format('alter table %I.%I add constraint %I check (factor > 0)', v_esquema, v_nombre, v_nombre || '_factor_check');
  execute format('create index if not exists %I on %I.%I (producto_id)', v_nombre || '_producto_idx', v_esquema, v_nombre);
  execute format('drop trigger if exists %I on %I.%I', 'productos_linea_preparar', v_esquema, v_nombre);
  execute format('create trigger %I before insert or update on %I.%I for each row execute function public.productos_linea_preparar(%L)',
                 'productos_linea_preparar', v_esquema, v_nombre, v_impuesto::text);

  insert into public.productos_lineas (tabla, modulo, con_impuesto) values (p_tabla, p_modulo, v_impuesto)
  on conflict (tabla) do update set modulo = excluded.modulo, con_impuesto = excluded.con_impuesto;
end;
$$;

revoke execute on function public.productos_aplicar_linea(regclass, text, boolean) from public, anon, authenticated, service_role;

-- ============ 7) RLS, grants y políticas ============
alter table public.productos_unidades enable row level security;
alter table public.productos_impuestos enable row level security;
alter table public.productos_categorias enable row level security;
alter table public.productos enable row level security;
alter table public.productos_conversiones enable row level security;
alter table public.productos_cambios enable row level security;
alter table public.productos_lineas enable row level security;

revoke all on table public.productos, public.productos_categorias, public.productos_unidades, public.productos_conversiones,
                    public.productos_impuestos, public.productos_cambios, public.productos_lineas from anon, authenticated;
revoke all on table public.productos_cambios, public.productos_lineas from service_role;

grant select, insert, update, delete on table public.productos, public.productos_categorias, public.productos_conversiones,
                                              public.productos_impuestos to authenticated;
-- Unidades por columna, como series: sistema y codigo_dian no los escribe la API
grant select, delete on table public.productos_unidades to authenticated;
grant insert (clave, nombre, simbolo, decimales, archivado_en, creado_via) on table public.productos_unidades to authenticated;
grant update (nombre, simbolo, decimales, archivado_en) on table public.productos_unidades to authenticated;
grant select on table public.productos_cambios to authenticated;
-- productos_lineas: nada para la API
grant all on table public.productos, public.productos_categorias, public.productos_unidades, public.productos_conversiones,
                   public.productos_impuestos to service_role;
grant select on table public.productos_cambios, public.productos_lineas to service_role;

-- Productos y categorías: leer con productos_puede_leer, escribir con
-- edit_productos, borrar solo un administrador (las llaves restrict frenan
-- lo que está en uso; lo normal es archivar)
drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select to authenticated using ((select public.productos_puede_leer()));
drop policy if exists productos_insert on public.productos;
create policy productos_insert on public.productos
  for insert to authenticated with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_update on public.productos;
create policy productos_update on public.productos
  for update to authenticated
  using ((select public.has_perm('edit_productos')))
  with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_delete on public.productos;
create policy productos_delete on public.productos
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists productos_categorias_select on public.productos_categorias;
create policy productos_categorias_select on public.productos_categorias
  for select to authenticated using ((select public.productos_puede_leer()));
drop policy if exists productos_categorias_insert on public.productos_categorias;
create policy productos_categorias_insert on public.productos_categorias
  for insert to authenticated with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_categorias_update on public.productos_categorias;
create policy productos_categorias_update on public.productos_categorias
  for update to authenticated
  using ((select public.has_perm('edit_productos')))
  with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_categorias_delete on public.productos_categorias;
create policy productos_categorias_delete on public.productos_categorias
  for delete to authenticated using ((select public.is_admin()));

-- Unidades: igual, con los grants por columna de arriba; und la frena el trigger
drop policy if exists productos_unidades_select on public.productos_unidades;
create policy productos_unidades_select on public.productos_unidades
  for select to authenticated using ((select public.productos_puede_leer()));
drop policy if exists productos_unidades_insert on public.productos_unidades;
create policy productos_unidades_insert on public.productos_unidades
  for insert to authenticated with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_unidades_update on public.productos_unidades;
create policy productos_unidades_update on public.productos_unidades
  for update to authenticated
  using ((select public.has_perm('edit_productos')))
  with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_unidades_delete on public.productos_unidades;
create policy productos_unidades_delete on public.productos_unidades
  for delete to authenticated using ((select public.is_admin()));

-- Conversiones: son parte del producto; quien lo edita las pone y las quita
drop policy if exists productos_conversiones_select on public.productos_conversiones;
create policy productos_conversiones_select on public.productos_conversiones
  for select to authenticated using ((select public.productos_puede_leer()));
drop policy if exists productos_conversiones_insert on public.productos_conversiones;
create policy productos_conversiones_insert on public.productos_conversiones
  for insert to authenticated with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_conversiones_update on public.productos_conversiones;
create policy productos_conversiones_update on public.productos_conversiones
  for update to authenticated
  using ((select public.has_perm('edit_productos')))
  with check ((select public.has_perm('edit_productos')));
drop policy if exists productos_conversiones_delete on public.productos_conversiones;
create policy productos_conversiones_delete on public.productos_conversiones
  for delete to authenticated using ((select public.has_perm('edit_productos')));

-- Clases de impuesto: las escribe solo un administrador (una tarifa mal
-- puesta pasa a las líneas que se creen)
drop policy if exists productos_impuestos_select on public.productos_impuestos;
create policy productos_impuestos_select on public.productos_impuestos
  for select to authenticated using ((select public.productos_puede_leer()));
drop policy if exists productos_impuestos_insert on public.productos_impuestos;
create policy productos_impuestos_insert on public.productos_impuestos
  for insert to authenticated with check ((select public.is_admin()));
drop policy if exists productos_impuestos_update on public.productos_impuestos;
create policy productos_impuestos_update on public.productos_impuestos
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists productos_impuestos_delete on public.productos_impuestos;
create policy productos_impuestos_delete on public.productos_impuestos
  for delete to authenticated using ((select public.is_admin()));

-- Historial: lo lee quien ve Productos, no quien solo ve un módulo
-- dependiente. productos_lineas: sin políticas permisivas
drop policy if exists productos_cambios_select on public.productos_cambios;
create policy productos_cambios_select on public.productos_cambios
  for select to authenticated using ((select public.puede_ver_app('productos')));

select public.aplicar_politica_modulo('public.productos_unidades', array['productos']);
select public.aplicar_politica_modulo('public.productos_impuestos', array['productos']);
select public.aplicar_politica_modulo('public.productos_categorias', array['productos']);
select public.aplicar_politica_modulo('public.productos', array['productos']);
select public.aplicar_politica_modulo('public.productos_conversiones', array['productos']);
select public.aplicar_politica_modulo('public.productos_cambios', array['productos']);
select public.aplicar_politica_modulo('public.productos_lineas', array['productos']);

-- ============ 8) Semillas ============
-- No pisan lo editado (on conflict do nothing, también ante un nombre ya
-- usado). Las unidades de empaque no traen factor: es de cada producto.
insert into public.productos_unidades (clave, nombre, simbolo, decimales, sistema, creado_via) values
  ('und', 'Unidad', 'und', 0, true, 'sistema'),
  ('kg', 'Kilogramo', 'kg', 3, false, 'sistema'),
  ('g', 'Gramo', 'g', 0, false, 'sistema'),
  ('l', 'Litro', 'l', 3, false, 'sistema'),
  ('ml', 'Mililitro', 'ml', 0, false, 'sistema'),
  ('m', 'Metro', 'm', 2, false, 'sistema'),
  ('m2', 'Metro cuadrado', 'm2', 2, false, 'sistema'),
  ('m3', 'Metro cúbico', 'm3', 3, false, 'sistema'),
  ('h', 'Hora', 'h', 2, false, 'sistema'),
  ('caja', 'Caja', 'caja', 0, false, 'sistema'),
  ('paquete', 'Paquete', 'paq', 0, false, 'sistema'),
  ('docena', 'Docena', 'doc', 0, false, 'sistema')
on conflict do nothing;

-- Claves neutras (no llevan la tarifa) y tarifas colombianas como datos
-- editables; las confirma el asesor contable antes de entregar la
-- instalación. Otro país edita nombre y porcentaje y archiva lo que no usa.
insert into public.productos_impuestos (clave, nombre, tipo, tratamiento, porcentaje, predeterminado, creado_via) values
  ('iva_general', 'IVA general', 'iva', 'gravado', 19, true, 'sistema'),
  ('iva_reducido', 'IVA reducido', 'iva', 'gravado', 5, false, 'sistema'),
  ('iva_exento', 'Exento de IVA', 'iva', 'exento', 0, false, 'sistema'),
  ('iva_excluido', 'Excluido de IVA', 'iva', 'excluido', 0, false, 'sistema')
on conflict do nothing;

-- Serie del código automático: con huecos (un alta deshecha no devuelve su
-- número), sin reinicio, P- y 5 cifras. Quien tiene gestionar_series cambia
-- prefijo y relleno después; el modo y el reinicio no cambian.
insert into public.series (clave, prefijo, relleno, modo) values ('producto', 'P-', 5, 'con_huecos')
on conflict (clave) do nothing;

do $$
begin
  if not exists (select 1 from public.series s where s.clave = 'producto' and s.modo = 'con_huecos' and s.reinicio = 'nunca') then
    raise exception '22-catalogo: la serie producto ya existe con otro modo o con reinicio; el código automático necesita una con huecos y sin reinicio';
  end if;
end $$;

-- exigir_mfa en las tablas nuevas (03-mfa)
select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare
  v text;
  t text;
  v_tablas text[] := array['productos_unidades', 'productos_impuestos', 'productos_categorias', 'productos',
                           'productos_conversiones', 'productos_cambios', 'productos_lineas'];
begin
  select string_agg(x, ', ') into v
    from unnest(v_tablas) x
   where to_regclass('public.' || x) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.' || x))
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = x
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE')
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = x
                        and p.policyname = 'modulo_productos' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '22-catalogo: tablas sin crear, sin RLS, sin exigir_mfa o sin modulo_productos: %', v;
  end if;

  -- Historial y registro de líneas cerrados a la API
  if exists (select 1 from pg_catalog.pg_policies p
              where p.schemaname = 'public' and p.tablename = 'productos_lineas' and p.permissive = 'PERMISSIVE') then
    raise exception '22-catalogo: productos_lineas tiene políticas permisivas';
  end if;
  -- has_any_column_privilege solo admite select, insert, update y references
  foreach t in array array['select', 'insert', 'update', 'references'] loop
    if has_any_column_privilege('authenticated', 'public.productos_lineas', t)
       or has_any_column_privilege('anon', 'public.productos_lineas', t)
       or (t <> 'select' and (has_any_column_privilege('authenticated', 'public.productos_cambios', t)
                              or has_any_column_privilege('anon', 'public.productos_cambios', t))) then
      raise exception '22-catalogo: productos_lineas o productos_cambios admiten % para la API', t;
    end if;
  end loop;
  foreach t in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('authenticated', 'public.productos_lineas', t)
       or has_table_privilege('anon', 'public.productos_lineas', t)
       or (t <> 'select' and (has_table_privilege('authenticated', 'public.productos_cambios', t)
                              or has_table_privilege('anon', 'public.productos_cambios', t)
                              or has_table_privilege('service_role', 'public.productos_cambios', t))) then
      raise exception '22-catalogo: productos_lineas o productos_cambios admiten % para la API', t;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.productos_unidades', 'sistema', 'insert')
     or has_column_privilege('authenticated', 'public.productos_unidades', 'sistema', 'update')
     or has_column_privilege('authenticated', 'public.productos_unidades', 'codigo_dian', 'insert')
     or has_column_privilege('authenticated', 'public.productos_unidades', 'codigo_dian', 'update')
     or has_column_privilege('authenticated', 'public.productos_unidades', 'clave', 'update')
     or has_table_privilege('anon', 'public.productos', 'select') then
    raise exception '22-catalogo: la API escribe sistema, codigo_dian o la clave de productos_unidades, o anon lee productos';
  end if;

  -- 19) Funciones de la API: security invoker, con search_path y sin anon
  select string_agg(f, ', ') into v
    from unnest(array['public.productos_buscar(text,uuid,boolean,text,text,boolean,integer,integer)',
                      'public.productos_importar(jsonb,boolean)', 'public.productos_factor(uuid,text)',
                      'public.productos_puede_leer()', 'public.productos_impuesto_predeterminar(text)']) f
   where not exists (select 1 from pg_catalog.pg_proc p
                      where p.oid = to_regprocedure(f) and not p.prosecdef
                        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
      or has_function_privilege('anon', f, 'execute')
      or not has_function_privilege('authenticated', f, 'execute');
  if v is not null then
    raise exception '22-catalogo: funciones que faltan, son security definer, no tienen search_path o tienen mal el EXECUTE: %', v;
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
                  where p.oid = to_regprocedure('public.productos_factor(uuid,text)') and l.lanname = 'plpgsql')
     or position('has_perm(''edit_productos'')' in
                 (select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.productos_importar(jsonb,boolean)'))) = 0 then
    raise exception '22-catalogo: productos_factor no es plpgsql o productos_importar no exige edit_productos';
  end if;
  if has_function_privilege('anon', 'public.productos_aplicar_linea(regclass,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.productos_aplicar_linea(regclass,text,boolean)', 'execute')
     or has_function_privilege('service_role', 'public.productos_aplicar_linea(regclass,text,boolean)', 'execute') then
    raise exception '22-catalogo: productos_aplicar_linea ejecutable por la API';
  end if;

  -- 20) Las únicas definer son productos_preparar y productos_registrar_cambio,
  -- y ninguna función de trigger la ejecuta la API
  select string_agg(p.proname, ', ' order by p.proname) into v
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'productos\_%' and p.prosecdef;
  if v is distinct from 'productos_preparar, productos_registrar_cambio' then
    raise exception '22-catalogo: funciones security definer de productos distintas de las dos previstas: %', coalesce(v, 'ninguna');
  end if;
  select string_agg(f, ', ') into v
    from unnest(array['productos_preparar', 'productos_registrar_cambio', 'productos_clave_inmutable', 'productos_categorias_validar',
                      'productos_conversiones_validar', 'productos_impuestos_predeterminado', 'productos_linea_preparar']) f
   where to_regprocedure('public.' || f || '()') is null
      or not exists (select 1 from pg_catalog.pg_proc p
                      where p.oid = to_regprocedure('public.' || f || '()')
                        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
      or has_function_privilege('anon', 'public.' || f || '()', 'execute')
      or has_function_privilege('authenticated', 'public.' || f || '()', 'execute');
  if v is not null then
    raise exception '22-catalogo: funciones de trigger que faltan, sin search_path o ejecutables por la API: %', v;
  end if;
  select string_agg(x, ', ') into v
    from unnest(array['productos', 'productos_conversiones', 'productos_unidades', 'productos_impuestos', 'productos_categorias']) x
   where not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgrelid = to_regclass('public.' || x) and g.tgname = 'productos_registrar_cambio'
                        and not g.tgisinternal and g.tgenabled <> 'D');
  if v is not null
     or not exists (select 1 from pg_catalog.pg_trigger g
                     where g.tgrelid = 'public.productos'::regclass and g.tgname = 'auditar_cambio' and g.tgenabled <> 'D') then
    raise exception '22-catalogo: falta productos_registrar_cambio (%) o auditar_cambio en productos', coalesce(v, '');
  end if;

  -- 21) Catálogos con clave inmutable, una predeterminada y und del sistema
  if (select count(*) from pg_catalog.pg_trigger g
       where g.tgname = 'productos_clave_inmutable' and g.tgenabled <> 'D'
         and g.tgrelid in ('public.productos_unidades'::regclass, 'public.productos_impuestos'::regclass)) <> 2
     or not exists (select 1 from pg_catalog.pg_trigger g
                     where g.tgrelid = 'public.productos_impuestos'::regclass and g.tgname = 'productos_impuestos_predeterminado'
                       and g.tgconstraint <> 0 and g.tgdeferrable and g.tginitdeferred and g.tgenabled <> 'D')
     or (select count(*) from public.productos_impuestos i where i.predeterminado and i.archivado_en is null) <> 1
     or not exists (select 1 from public.productos_unidades u where u.clave = 'und' and u.sistema and u.archivado_en is null) then
    raise exception '22-catalogo: faltan las guardas de los catálogos, la clase predeterminada o la unidad und del sistema';
  end if;

  -- 22) Llaves del catálogo en restrict
  if exists (select 1 from pg_catalog.pg_constraint k
              where k.contype = 'f' and k.confdeltype <> 'r'
                and ((k.conrelid = 'public.productos'::regclass
                      and k.confrelid in ('public.productos_unidades'::regclass, 'public.productos_impuestos'::regclass,
                                          'public.productos_categorias'::regclass))
                     or (k.conrelid = 'public.productos_conversiones'::regclass and k.confrelid = 'public.productos_unidades'::regclass)
                     or (k.conrelid = 'public.productos_categorias'::regclass and k.confrelid = 'public.productos_categorias'::regclass)
                     or (k.conrelid in (select l.tabla from public.productos_lineas l)
                         and k.confrelid in ('public.productos'::regclass, 'public.productos_unidades'::regclass,
                                             'public.productos_impuestos'::regclass))))
     or (select count(*) from pg_catalog.pg_constraint k
          where k.contype = 'f' and k.conrelid = 'public.productos'::regclass
            and k.confrelid in ('public.productos_unidades'::regclass, 'public.productos_impuestos'::regclass,
                                'public.productos_categorias'::regclass)) <> 3 then
    raise exception '22-catalogo: una llave del catálogo no es on delete restrict o falta';
  end if;

  -- 23) Serie del código
  if not exists (select 1 from public.series s where s.clave = 'producto' and s.modo = 'con_huecos' and s.reinicio = 'nunca')
     or to_regclass('public.serie_producto') is null then
    raise exception '22-catalogo: la serie producto falta, no es con huecos sin reinicio o no tiene su secuencia';
  end if;

  -- 24) Toda tabla con llave hacia productos(id), salvo las conversiones,
  -- registrada, con productos_linea_preparar y con índice sobre producto_id
  select string_agg(r.oid::regclass::text, ', ') into v
    from (select k.conrelid as oid from pg_catalog.pg_constraint k
           where k.contype = 'f' and k.confrelid = 'public.productos'::regclass
             and k.conrelid <> 'public.productos_conversiones'::regclass
          union
          select l.tabla::oid from public.productos_lineas l) r
   where r.oid not in (select l.tabla::oid from public.productos_lineas l)
      or not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgrelid = r.oid and g.tgname = 'productos_linea_preparar' and not g.tgisinternal and g.tgenabled <> 'D')
      or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                      where i.indrelid = r.oid and a.attname = 'producto_id');
  if v is not null then
    raise exception '22-catalogo: tablas de líneas sin registrar, sin productos_linea_preparar o sin índice sobre producto_id: %', v;
  end if;

  -- 25) Guardas de concurrencia en el código de los triggers
  if position('pg_advisory_xact_lock(' in (select p.prosrc from pg_catalog.pg_proc p
                                           where p.oid = 'public.productos_categorias_validar()'::regprocedure)) = 0
     or position('for share' in (select p.prosrc from pg_catalog.pg_proc p
                                 where p.oid = 'public.productos_conversiones_validar()'::regprocedure)) = 0
     or position('pg_advisory_xact_lock_shared(' in (select p.prosrc from pg_catalog.pg_proc p
                                                     where p.oid = 'public.productos_linea_preparar()'::regprocedure)) = 0
     or position('pg_advisory_xact_lock(' in (select p.prosrc from pg_catalog.pg_proc p
                                              where p.oid = 'public.productos_preparar()'::regprocedure)) = 0 then
    raise exception '22-catalogo: faltan los bloqueos de categorías, conversiones, líneas o del cambio de unidad base';
  end if;

  if not exists (select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
                  where e.extname = 'pg_trgm' and n.nspname = 'extensions') then
    raise exception '22-catalogo: pg_trgm no quedó en el esquema extensions';
  end if;
end $$;

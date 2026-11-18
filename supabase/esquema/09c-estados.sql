-- ============================================================
-- 09c-estados.sql — Núcleo: máquina de estados por entidad (BL-06)
-- Esquema consolidado del producto (PP-DEC-02, PP-DEC-26). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo. Lleva letra para
-- no renumerar: va después de 09 en una instalación nueva y en una hecha
-- (necesita has_perm, audit_log y aplicar_exigir_mfa).
--
-- Origen: código nuevo del producto. Convenciones en docs/esquema.md.
--
-- Una entidad (factura, pedido…) se registra con su tabla en
-- estados_entidades; sus estados, cada uno con una categoría fija
-- (borrador, en_curso, aprobado, hecho o anulado) y uno inicial, van en
-- estados; las transiciones permitidas, cada una con el permiso que exige,
-- en estados_transiciones. Lo escriben los archivos de esquema de cada
-- módulo, como postgres; la API solo lo lee.
--
-- aplicar_transicion(entidad, id, desde, hacia) cambia el estado: exige la
-- transición en el catálogo y su permiso (has_perm), hace
-- update … where id = … and estado = desde, exige exactamente una fila
-- (si no, error de conflicto: otro lo cambió antes, no existe o la RLS no
-- lo deja cambiar) y deja una fila estados.transicion en audit_log. Es
-- security invoker: la RLS de la tabla del documento decide quién lo
-- toca. Sin sesión (service role, SQL Editor) has_perm es falso y no
-- aplica nada: falla cerrado.
--
-- El trigger zy_estados_guardia (función estados_guardia), que pone
-- estados_registrar en la tabla, obliga a nacer en el estado inicial,
-- rechaza cualquier cambio de estado que no venga de aplicar_transicion y
-- todo borrado fuera de la categoría borrador: un administrador tampoco se
-- salta el catálogo con un update directo ni lo esquiva borrando
-- (PP-DEC-26, D-9). SQL dinámico
-- solo con format y %I sobre tablas de la lista cerrada estados_entidades.
--
-- Requisitos: 00 a 09 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                          | Qué                                                 |
--   |---------------------------------|-----------------------------------------------------|
--   | estados_entidades               | lista cerrada de entidades y su tabla               |
--   | estados                         | estados por entidad con categoría fija e inicial    |
--   | estados_transiciones            | desde, hacia y el permiso que exige                 |
--   | estados_guardia()               | trigger: estado inicial, cambio solo por la función |
--   |                                 | y borrado solo en borrador                          |
--   | estados_registrar(entidad, t)   | registra la tabla y pone el trigger; solo el dueño  |
--   | aplicar_transicion(e, id, d, h) | cambio de estado con control optimista y registro   |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '09c-estados detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.has_perm(text)') is null then
    raise exception '09c-estados detenido: falta 00-base.sql';
  end if;
  if to_regclass('public.audit_log') is null then
    raise exception '09c-estados detenido: falta 02-auditoria.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '09c-estados detenido: falta 03-mfa.sql';
  end if;
end $$;

-- ============ 1) Catálogo ============
create table if not exists public.estados_entidades (
  entidad text primary key constraint estados_entidades_entidad_check check (entidad ~ '^[a-z][a-z0-9_]{0,39}$'),
  tabla regclass not null constraint estados_entidades_tabla_key unique
);

create table if not exists public.estados (
  entidad text not null references public.estados_entidades (entidad) on delete cascade,
  clave text not null constraint estados_clave_check check (clave ~ '^[a-z][a-z0-9_]{0,39}$'),
  nombre text not null constraint estados_nombre_check check (char_length(nombre) between 1 and 60),
  categoria text not null
    constraint estados_categoria_check check (categoria in ('borrador', 'en_curso', 'aprobado', 'hecho', 'anulado')),
  inicial boolean not null default false,
  orden int not null default 0,
  primary key (entidad, clave)
);

-- Un solo estado inicial por entidad
create unique index if not exists estados_inicial_unico on public.estados (entidad) where inicial;

create table if not exists public.estados_transiciones (
  entidad text not null,
  desde text not null,
  hacia text not null,
  permiso text not null constraint estados_transiciones_permiso_check check (permiso ~ '^[a-z][a-z0-9_]{0,59}$'),
  primary key (entidad, desde, hacia),
  foreign key (entidad, desde) references public.estados (entidad, clave) on delete cascade,
  foreign key (entidad, hacia) references public.estados (entidad, clave) on delete cascade,
  constraint estados_transiciones_distintos_check check (desde <> hacia)
);

alter table public.estados_entidades enable row level security;
alter table public.estados enable row level security;
alter table public.estados_transiciones enable row level security;

-- Solo lectura para la API: la pantalla pinta estados y botones
revoke all on table public.estados_entidades, public.estados, public.estados_transiciones from anon, authenticated, service_role;
grant select on table public.estados_entidades, public.estados, public.estados_transiciones to authenticated, service_role;

drop policy if exists estados_entidades_select on public.estados_entidades;
create policy estados_entidades_select on public.estados_entidades
  for select to authenticated
  using (true);

drop policy if exists estados_select on public.estados;
create policy estados_select on public.estados
  for select to authenticated
  using (true);

drop policy if exists estados_transiciones_select on public.estados_transiciones;
create policy estados_transiciones_select on public.estados_transiciones
  for select to authenticated
  using (true);

-- ============ 2) Guarda de la tabla del documento ============
-- Alta: el estado es el inicial de la entidad. Cambio de estado: solo si
-- aplicar_transicion dejó la marca de esta fila y este estado
-- (estados.transicion, local a la transacción; la API no fija variables
-- de sesión). Borrado: solo si el estado es de la categoría borrador; un
-- documento aprobado, hecho o anulado no sale de la máquina borrándose (en
-- una serie sin huecos dejaría un hueco), tampoco por un administrador.
-- Una tabla que perdió su registro no admite altas, cambios de estado ni
-- borrados. Sin security definer: lee el catálogo, que es de lectura para
-- authenticated; anon no lo lee, así que una tabla registrada no admite
-- altas sin sesión (un formulario público).
create or replace function public.estados_guardia()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_entidad text;
begin
  select e.entidad into v_entidad from public.estados_entidades e where e.tabla = tg_relid;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.estados s where s.entidad = v_entidad and s.clave = new.estado and s.inicial) then
      raise exception 'estados: un registro de % nace en su estado inicial', coalesce(v_entidad, tg_table_name)
        using errcode = '23514', hint = 'estados_inicial';
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.estados s where s.entidad = v_entidad and s.clave = old.estado and s.categoria = 'borrador') then
      raise exception 'estados: un registro de % solo se borra en borrador', coalesce(v_entidad, tg_table_name)
        using errcode = '42501', hint = 'estados_borrado';
    end if;
    return old;
  elsif new.estado is distinct from old.estado
        and (v_entidad is null
             or current_setting('estados.transicion', true) is distinct from v_entidad || ':' || new.id || ':' || new.estado) then
    raise exception 'estados: el estado de % solo cambia con aplicar_transicion', coalesce(v_entidad, tg_table_name)
      using errcode = '42501', hint = 'estados_directo';
  end if;
  return new;
end;
$$;

revoke execute on function public.estados_guardia() from public, anon, authenticated;

-- ============ 3) Registrar una entidad ============
-- La tabla necesita id uuid y estado text y no puede ser particionada ni
-- una partición: en una partición tg_relid no es la tabla registrada. El
-- trigger se nombra con %I en format: drop y create del mismo nombre. Se
-- dispara en todo update (no solo «of estado») y se llama
-- zy_estados_guardia para ir después de los BEFORE de los módulos, que se
-- ordenan por nombre, y ver el estado final de la fila; justo antes de
-- zz_contrato_sellar (PP-DEC-23).
create or replace function public.estados_registrar(p_entidad text, p_tabla regclass)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_esquema text;
  v_nombre text;
begin
  select n.nspname, k.relname into v_esquema, v_nombre
    from pg_catalog.pg_class k join pg_catalog.pg_namespace n on n.oid = k.relnamespace
   where k.oid = p_tabla and k.relkind = 'r' and not k.relispartition;
  if v_nombre is null then
    raise exception 'estados_registrar: % no es una tabla simple (ni particionada ni partición)', p_tabla;
  end if;
  if (select count(*) from pg_catalog.pg_attribute a
       where a.attrelid = p_tabla and not a.attisdropped
         and ((a.attname = 'id' and a.atttypid = 'uuid'::regtype)
              or (a.attname = 'estado' and a.atttypid = 'text'::regtype))) <> 2 then
    raise exception 'estados_registrar: % necesita id uuid y estado text', v_nombre;
  end if;

  insert into public.estados_entidades (entidad, tabla) values (p_entidad, p_tabla)
  on conflict (entidad) do nothing;
  if not exists (select 1 from public.estados_entidades where entidad = p_entidad and tabla = p_tabla) then
    raise exception 'estados_registrar: la entidad % ya está registrada con otra tabla', p_entidad;
  end if;

  execute format('drop trigger if exists %I on %I.%I', 'zy_estados_guardia', v_esquema, v_nombre);
  execute format('create trigger %I before insert or update or delete on %I.%I for each row execute function public.estados_guardia()',
                 'zy_estados_guardia', v_esquema, v_nombre);
end;
$$;

revoke execute on function public.estados_registrar(text, regclass) from public, anon, authenticated, service_role;

-- ============ 4) Aplicar una transición ============
-- security invoker: el update pasa por la RLS de quien llama. La fila de
-- auditoría va como 'cliente' porque la escribe su sesión (la política de
-- audit_log no admite otra), pero la pone la base.
create or replace function public.aplicar_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_esquema text;
  v_nombre text;
  v_permiso text;
  v_n int;
begin
  select n.nspname, k.relname into v_esquema, v_nombre
    from public.estados_entidades e
    join pg_catalog.pg_class k on k.oid = e.tabla
    join pg_catalog.pg_namespace n on n.oid = k.relnamespace
   where e.entidad = p_entidad;
  if v_nombre is null then
    raise exception 'estados: % no es una entidad registrada', p_entidad using errcode = '22023', hint = 'estados_entidad';
  end if;

  select t.permiso into v_permiso
    from public.estados_transiciones t
   where t.entidad = p_entidad and t.desde = p_desde and t.hacia = p_hacia;
  if v_permiso is null then
    raise exception 'estados: no se puede pasar de % a %', p_desde, p_hacia using errcode = '22023', hint = 'estados_transicion';
  end if;
  if not public.has_perm(v_permiso) then
    raise exception 'estados: no tienes permiso para pasar de % a %', p_desde, p_hacia using errcode = '42501', hint = 'estados_permiso';
  end if;

  perform set_config('estados.transicion', p_entidad || ':' || p_id || ':' || p_hacia, true);
  execute format('update %I.%I set estado = $1 where id = $2 and estado = $3', v_esquema, v_nombre)
    using p_hacia, p_id, p_desde;
  get diagnostics v_n = row_count;
  perform set_config('estados.transicion', '', true);
  if v_n <> 1 then
    raise exception 'estados: el registro no existe o cambió de estado antes; vuelve a cargarlo'
      using errcode = '40001', hint = 'estados_conflicto';
  end if;

  insert into public.audit_log (user_id, action, detail, entity, entity_id, origen)
  values (auth.uid(), 'estados.transicion', p_desde || ' → ' || p_hacia, p_entidad, p_id::text, 'cliente');
end;
$$;

revoke execute on function public.aplicar_transicion(text, uuid, text, text) from public, anon;
grant execute on function public.aplicar_transicion(text, uuid, text, text) to authenticated;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
-- Prueba la guarda sobre una tabla temporal que se borra al final: un alta
-- fuera del estado inicial, un update directo, una transición sin sesión o
-- un borrado fuera de borrador que pasen abortan.
do $$
declare
  v text;
  v_id uuid;
begin
  if (select count(*) from pg_catalog.pg_class c
       where c.oid in (to_regclass('public.estados_entidades'), to_regclass('public.estados'), to_regclass('public.estados_transiciones'))
         and c.relrowsecurity
         and exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE')) <> 3 then
    raise exception '09c-estados: estados_entidades, estados o estados_transiciones sin crear, sin RLS o sin exigir_mfa';
  end if;
  if has_table_privilege('authenticated', 'public.estados_entidades', 'insert, update, delete')
     or has_table_privilege('authenticated', 'public.estados', 'insert, update, delete')
     or has_table_privilege('authenticated', 'public.estados_transiciones', 'insert, update, delete')
     or has_table_privilege('anon', 'public.estados', 'select') then
    raise exception '09c-estados: el catálogo de estados quedó escribible por la API';
  end if;

  if (select count(*) from pg_catalog.pg_proc p
       where p.oid in (to_regprocedure('public.aplicar_transicion(text,uuid,text,text)'), to_regprocedure('public.estados_guardia()'),
                       to_regprocedure('public.estados_registrar(text,regclass)'))
         and not p.prosecdef
         and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) <> 3 then
    raise exception '09c-estados: aplicar_transicion, estados_guardia o estados_registrar falta, quedó security definer o sin search_path';
  end if;
  if has_function_privilege('anon', 'public.aplicar_transicion(text,uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.aplicar_transicion(text,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.estados_registrar(text,regclass)', 'execute')
     or has_function_privilege('service_role', 'public.estados_registrar(text,regclass)', 'execute')
     or has_function_privilege('authenticated', 'public.estados_guardia()', 'execute') then
    raise exception '09c-estados: grants de las funciones de estados distintos de lo previsto';
  end if;

  -- Sin sesión, como el instalador
  perform set_config('request.jwt.claims', '', true);
  create temp table estados_prueba (id uuid primary key default gen_random_uuid(), estado text not null);
  perform public.estados_registrar('prueba_09c', 'estados_prueba'::regclass);
  insert into public.estados (entidad, clave, nombre, categoria, inicial)
  values ('prueba_09c', 'borrador', 'Borrador', 'borrador', true), ('prueba_09c', 'aprobado', 'Aprobado', 'aprobado', false);
  insert into public.estados_transiciones (entidad, desde, hacia, permiso) values ('prueba_09c', 'borrador', 'aprobado', 'prueba_09c');

  begin
    insert into estados_prueba (estado) values ('aprobado');
    v := 'entró';
  exception when sqlstate '23514' then
    v := 'inicial';
  end;
  if v <> 'inicial' then
    raise exception '09c-estados: se creó un registro fuera de su estado inicial';
  end if;

  insert into estados_prueba (estado) values ('borrador') returning id into v_id;
  begin
    update estados_prueba set estado = 'aprobado' where id = v_id;
    v := 'cambió';
  exception when sqlstate '42501' then
    v := 'directo';
  end;
  if v <> 'directo' then
    raise exception '09c-estados: un update directo cambió el estado';
  end if;

  begin
    perform public.aplicar_transicion('prueba_09c', v_id, 'borrador', 'aprobado');
    v := 'cambió';
  exception when sqlstate '42501' then
    v := 'permiso';
  end;
  if v <> 'permiso' or (select estado from estados_prueba where id = v_id) <> 'borrador' then
    raise exception '09c-estados: una transición sin sesión cambió el estado';
  end if;

  -- La guarda cubre alta, todo update y borrado (tgtype: fila, before,
  -- insert, delete, update), sin lista de columnas
  if not exists (select 1 from pg_catalog.pg_trigger g
                  where g.tgrelid = 'estados_prueba'::regclass and g.tgname = 'zy_estados_guardia'
                    and (g.tgtype::int & 31) = 31 and g.tgattr::text = '') then
    raise exception '09c-estados: zy_estados_guardia no cubre alta, todo update y borrado';
  end if;
  -- Borrar: un borrador sí; un aprobado no (se crea con la guarda apagada)
  delete from estados_prueba where id = v_id;
  if found is not true then
    raise exception '09c-estados: no se pudo borrar un borrador';
  end if;
  alter table estados_prueba disable trigger zy_estados_guardia;
  insert into estados_prueba (estado) values ('aprobado') returning id into v_id;
  alter table estados_prueba enable trigger zy_estados_guardia;
  begin
    delete from estados_prueba where id = v_id;
    v := 'borró';
  exception when sqlstate '42501' then
    v := 'borrado';
  end;
  if v <> 'borrado' then
    raise exception '09c-estados: se borró un registro fuera de borrador';
  end if;

  delete from public.estados_entidades where entidad = 'prueba_09c';
  drop table estados_prueba;
end $$;

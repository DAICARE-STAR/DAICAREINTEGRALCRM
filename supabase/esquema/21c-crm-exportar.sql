-- ============================================================
-- 21c-crm-exportar.sql — Módulo crm: exportar es un permiso propio,
-- distinto de leer (BL-12)
-- Esquema del producto (PP-DEC-02, PP-DEC-19). Lo aplica
-- tools/instalar/modulos.mjs --activar crm (aplicar.mjs --archivo), en una
-- transacción, después de 21-crm.sql y 21b. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen: código nuevo del producto.
--
-- Qué cambia y por qué: hasta aquí la pantalla Exportar armaba el CSV en el
-- navegador con páginas de crm_buscar y registraba la exportación desde el
-- cliente; bastaba leer el CRM para descargar la base de cuentas. Ahora la
-- pantalla exporta solo por crm_exportar, que exige exportar_crm (un
-- administrador lo tiene por serlo, como todo permiso de has_perm), corta
-- en 10 000 filas y deja la fila crm.exportar en audit_log en la misma
-- transacción. Lo que no cierra: quien lee el CRM sigue pudiendo recorrer
-- crm_cuentas o crm_buscar por la API; acotar ese volumen es otra pieza.
--
-- Semilla: exportar_crm va a todo rol (salvo admin) que tenga app_crm,
-- porque hasta aquí todo el que veía el CRM tenía el botón Exportar. Nadie
-- pierde lo que ya hacía; un administrador lo quita después en Roles a
-- quien solo deba leer. En una instalación nueva no hay roles con app_crm
-- y la semilla no toca nada.
--
-- Sin datos de salud (PP-DEC-19): crm_exportar devuelve las columnas de
-- crm_buscar, que no toca crm_salud.
--
-- Requisitos: 21-crm.sql aplicado; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto           | Qué                                                         |
--   |------------------|-------------------------------------------------------------|
--   | crm_exportar(…)  | exportación con exportar_crm, tope y fila en audit_log      |
--   |                  | (security invoker: la RLS decide las filas)                 |
--   | roles            | exportar_crm en los roles con app_crm                       |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '21c-crm-exportar detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.crm_buscar(text,text,text,text,uuid,text,boolean,integer,integer)') is null then
    raise exception '21c-crm-exportar detenido: falta 21-crm.sql';
  end if;
  if to_regclass('public.audit_log') is null or to_regprocedure('public.has_perm(text)') is null then
    raise exception '21c-crm-exportar detenido: falta el núcleo (00-base.sql o 02-auditoria.sql)';
  end if;
end $$;

-- ============ 1) Exportación ============
-- security invoker: lee con la RLS de quien exporta, por crm_buscar (que
-- topa cada página en 200), hasta 50 páginas. La fila de auditoría va como
-- 'cliente' porque la escribe la sesión de quien exporta (la política de
-- audit_log no admite otra), pero la pone la base: la pantalla no puede
-- saltársela.
create or replace function public.crm_exportar(
  p_q text default null,
  p_tipo text default null,
  p_etapa text default null,
  p_origen text default null,
  p_responsable uuid default null,
  p_etiqueta text default null,
  p_archivadas boolean default false
)
returns table (
  id uuid, tipo text, nombre text, documento text, etapa text, origen text, tipo_empresa text,
  responsable_id uuid, telefono text, email text, direccion text, ciudad text, pais text,
  etiquetas text[], campos jsonb, notas text, archivado_en timestamptz, created_by uuid,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_pagina int;
  v_n int := 0;
begin
  if not public.has_perm('exportar_crm') then
    raise exception 'crm: no tienes permiso para exportar' using errcode = '42501', hint = 'crm_exportar';
  end if;

  for i in 0 .. 49 loop
    return query
      select b.id, b.tipo, b.nombre, b.documento, b.etapa, b.origen, b.tipo_empresa,
             b.responsable_id, b.telefono, b.email, b.direccion, b.ciudad, b.pais,
             b.etiquetas, b.campos, b.notas, b.archivado_en, b.created_by,
             b.created_at, b.updated_at
        from public.crm_buscar(p_q, p_tipo, p_etapa, p_origen, p_responsable, p_etiqueta,
                               p_archivadas, 200, i * 200) b;
    get diagnostics v_pagina = row_count;
    v_n := v_n + v_pagina;
    exit when v_pagina < 200;
  end loop;

  insert into public.audit_log (user_id, action, detail, entity, origen)
  values (auth.uid(), 'crm.exportar', 'Exportó ' || v_n || ' cuentas', 'crm_cuentas', 'cliente');
end;
$$;

revoke execute on function public.crm_exportar(text, text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.crm_exportar(text, text, text, text, uuid, text, boolean) to authenticated;

-- ============ 2) Semilla: exportar_crm a quien hoy exporta ============
-- Corre como postgres (sin auth.uid()): roles_guard_escalada no frena y
-- auditar_cambio deja una fila 'base' por rol tocado.
update public.roles
   set permissions = array_append(permissions, 'exportar_crm')
 where name <> 'admin'
   and 'app_crm' = any (permissions)
   and not ('exportar_crm' = any (permissions));

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.crm_exportar(text,text,text,text,uuid,text,boolean)')
     and not p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  if v_src is null then
    raise exception '21c-crm-exportar: crm_exportar falta, quedó security definer o sin search_path';
  end if;
  if position('has_perm(''exportar_crm'')' in v_src) = 0 or v_src ~* 'salud' then
    raise exception '21c-crm-exportar: crm_exportar no exige exportar_crm o toca salud';
  end if;

  if has_function_privilege('anon', 'public.crm_exportar(text,text,text,text,uuid,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.crm_exportar(text,text,text,text,uuid,text,boolean)', 'execute') then
    raise exception '21c-crm-exportar: crm_exportar con grants distintos de solo authenticated';
  end if;

  if exists (select 1 from public.roles
              where name <> 'admin' and 'app_crm' = any (permissions)
                and not ('exportar_crm' = any (permissions))) then
    raise exception '21c-crm-exportar: quedó un rol con app_crm sin exportar_crm';
  end if;
end $$;

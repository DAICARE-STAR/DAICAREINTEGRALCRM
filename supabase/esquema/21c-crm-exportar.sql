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
-- administrador lo tiene por serlo, como todo permiso de has_perm), devuelve
-- la lista entera en un solo jsonb (fuera del «Max rows» de PostgREST), se
-- niega con más de 10 000 cuentas y deja la fila crm.exportar en audit_log
-- en la misma transacción. Lo que no cierra: quien lee el CRM sigue
-- pudiendo recorrer crm_cuentas o crm_buscar por la API sin exportar_crm y
-- sin fila crm.exportar; el permiso gobierna la exportación de la pantalla,
-- no la lectura masiva. Acotar ese volumen es otra pieza (HANDOFF).
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
--   |                  | (security invoker: la RLS decide las filas; returns jsonb)  |
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
-- topa cada página en 200), hasta 50 páginas. Devuelve un solo valor jsonb
-- ({total, filas}) y no un conjunto de filas: PostgREST corta en su «Max
-- rows» (1000 por defecto) toda respuesta con varias filas, también la de
-- una función, sin avisar al navegador. Con más de 10 000 cuentas, o si la
-- lista cambia entre páginas, falla sin exportar nada en vez de entregar
-- un archivo incompleto. La fila de auditoría va como 'cliente' porque la
-- escribe la sesión de quien exporta (la política de audit_log no admite
-- otra), pero la pone la base: la pantalla no puede saltársela.
create or replace function public.crm_exportar(
  p_q text default null,
  p_tipo text default null,
  p_etapa text default null,
  p_origen text default null,
  p_responsable uuid default null,
  p_etiqueta text default null,
  p_archivadas boolean default false
)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_total bigint;
  v_filas jsonb := '[]'::jsonb;
begin
  if not public.has_perm('exportar_crm') then
    raise exception 'crm: no tienes permiso para exportar' using errcode = '42501', hint = 'crm_exportar';
  end if;

  select b.total into v_total
    from public.crm_buscar(p_q, p_tipo, p_etapa, p_origen, p_responsable, p_etiqueta,
                           p_archivadas, 1, 0) b;
  v_total := coalesce(v_total, 0);
  if v_total > 10000 then
    raise exception 'crm: más de 10 000 cuentas para exportar' using errcode = '54000', hint = 'crm_exportar_tope';
  end if;

  for i in 0 .. 49 loop
    exit when i * 200 >= v_total;
    v_filas := v_filas || coalesce((
      select jsonb_agg(to_jsonb(b) - 'total' - 'ordinality' order by b.ordinality)
        from public.crm_buscar(p_q, p_tipo, p_etapa, p_origen, p_responsable, p_etiqueta,
                               p_archivadas, 200, i * 200) with ordinality b), '[]'::jsonb);
  end loop;

  if jsonb_array_length(v_filas) <> v_total then
    raise exception 'crm: la lista cambió durante la exportación' using errcode = '40001', hint = 'crm_exportar_cambio';
  end if;

  insert into public.audit_log (user_id, action, detail, entity, origen)
  values (auth.uid(), 'crm.exportar', 'Exportó ' || v_total || ' cuentas', 'crm_cuentas', 'cliente');
  return jsonb_build_object('total', v_total, 'filas', v_filas);
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
     and not p.proretset
     and p.prorettype = 'jsonb'::regtype
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  if v_src is null then
    raise exception '21c-crm-exportar: crm_exportar falta, quedó security definer, sin search_path o no devuelve un solo jsonb';
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

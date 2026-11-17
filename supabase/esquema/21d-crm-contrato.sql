-- ============================================================
-- 21d-crm-contrato.sql — Módulo crm: contrato base de tabla en cuentas,
-- contactos y actividades (BL-02)
-- Esquema del producto (PP-DEC-02, PP-DEC-23). Lo aplica
-- tools/instalar/modulos.mjs --activar crm (aplicar.mjs --archivo), en una
-- transacción, después de 21-crm.sql. IDEMPOTENTE. Un archivo aplicado no
-- se edita: un cambio va en un archivo nuevo.
--
-- Origen: código nuevo del producto. Corrige 21-crm.sql, que ya está
-- aplicado y no se edita.
--
-- Qué cambia y por qué: 21-crm.sql ya sellaba created_by (crm_preparar) y
-- traía created_at, updated_at y archivado_en, pero no updated_by ni
-- creado_via. contrato_aplicar (00b-contrato-tabla.sql) añade lo que falta
-- y pone el trigger contrato_sellar, que sella también created_at y
-- updated_at. Datos existentes: las filas que ya están quedan con
-- creado_via 'manual' y updated_by null hasta su próximo cambio; nada se
-- reescribe. crm_actividades omite created_by (su autoría es autor_id,
-- que sigue sellando crm_preparar) y archivado_en (una actividad la borra
-- su autor o un administrador, no se archiva).
--
-- crm_registrar_cambio es el de 21-crm.sql salvo que tampoco lleva al
-- historial updated_by ni creado_via: sin eso, cada cambio de otra persona
-- anotaría updated_by como un campo cambiado (BL-23 los declara no
-- auditados).
--
-- Requisitos: 21-crm.sql y 00b-contrato-tabla.sql aplicados; ejecutarlo
-- como postgres. El bloque 0 aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                          | Qué                                                 |
--   |---------------------------------|-----------------------------------------------------|
--   | crm_cuentas, crm_contactos      | updated_by, creado_via y trigger contrato_sellar    |
--   | crm_actividades                 | updated_by, creado_via y trigger contrato_sellar    |
--   | crm_registrar_cambio()          | sin updated_by ni creado_via en el historial        |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '21d-crm-contrato detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('public.crm_cuentas') is null or to_regclass('public.crm_contactos') is null
     or to_regclass('public.crm_actividades') is null
     or to_regprocedure('public.crm_registrar_cambio()') is null then
    raise exception '21d-crm-contrato detenido: falta 21-crm.sql';
  end if;
  if to_regprocedure('public.contrato_aplicar(regclass,text[])') is null
     or to_regprocedure('public.contrato_sellar()') is null then
    raise exception '21d-crm-contrato detenido: falta 00b-contrato-tabla.sql (npm run instalar aplica el núcleo)';
  end if;
end $$;

-- ============ 1) Contrato base ============
select public.contrato_aplicar('public.crm_cuentas');
select public.contrato_aplicar('public.crm_contactos');
select public.contrato_aplicar('public.crm_actividades', array['created_by', 'archivado_en']);

-- ============ 2) Historial sin updated_by ni creado_via ============
-- Historial: solo los campos que cambian, cada lado recortado a 2 KB. Nunca
-- toca salud (no está en estas tablas).
create or replace function public.crm_registrar_cambio()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_campos text[];
  v_id uuid;
  v_entidad text;
begin
  if tg_op = 'DELETE' then
    -- Supresión (Ley 1581 art. 8): se borra el historial y los vínculos
    -- externos de la entidad; queda solo id, entidad y autor del borrado
    v_entidad := case tg_table_name when 'crm_cuentas' then 'cuenta' when 'crm_contactos' then 'contacto' else 'actividad' end;
    delete from public.crm_cambios c where c.entidad = v_entidad and c.entidad_id = old.id;
    delete from public.crm_vinculos_externos x where x.entidad = v_entidad and x.entidad_id = old.id;
    insert into public.crm_cambios (entidad, entidad_id, operacion, campos, antes, despues, autor_id)
    values (v_entidad, old.id, 'delete', '{}', null, null, auth.uid());
    return old;
  end if;
  v_id := new.id;
  if tg_op = 'UPDATE' then v_antes := to_jsonb(old) - 'updated_at' - 'updated_by' - 'creado_via'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_despues := to_jsonb(new) - 'updated_at' - 'updated_by' - 'creado_via'; end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_despues) k
     where (v_despues -> k) is distinct from (v_antes -> k);
    if v_campos is null then return new; end if;
    select jsonb_object_agg(k, v_antes -> k), jsonb_object_agg(k, v_despues -> k)
      into v_antes, v_despues
      from unnest(v_campos) k;
  else
    select array_agg(k order by k) into v_campos from jsonb_object_keys(v_despues) k;
  end if;

  if octet_length(v_antes::text) > 2048 then
    v_antes := jsonb_build_object('_recortado', left(v_antes::text, 500));
  end if;
  if octet_length(v_despues::text) > 2048 then
    v_despues := jsonb_build_object('_recortado', left(v_despues::text, 500));
  end if;

  insert into public.crm_cambios (entidad, entidad_id, operacion, campos, antes, despues, autor_id)
  values (case tg_table_name when 'crm_cuentas' then 'cuenta' when 'crm_contactos' then 'contacto' else 'actividad' end,
          v_id, lower(tg_op), coalesce(v_campos, '{}'), v_antes, v_despues, auth.uid());
  return new;
end;
$$;

revoke execute on function public.crm_registrar_cambio() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare
  v text;
  v_src text;
begin
  select string_agg(t.x || '.' || c.y, ', ') into v
    from (values ('crm_cuentas'), ('crm_contactos'), ('crm_actividades')) t(x)
    cross join (values ('updated_by'), ('creado_via'), ('created_at'), ('updated_at')) c(y)
   where not exists (select 1 from pg_catalog.pg_attribute a
                      where a.attrelid = to_regclass('public.' || t.x) and a.attname = c.y and not a.attisdropped);
  if v is not null then
    raise exception '21d-crm-contrato: faltan columnas del contrato: %', v;
  end if;

  select string_agg(t.x, ', ') into v
    from (values ('crm_cuentas'), ('crm_contactos'), ('crm_actividades')) t(x)
   where not exists (select 1 from pg_catalog.pg_trigger g
                      where g.tgname = 'contrato_sellar'
                        and g.tgrelid = to_regclass('public.' || t.x)
                        and g.tgfoid = to_regprocedure('public.contrato_sellar()')
                        and not g.tgisinternal and g.tgenabled <> 'D');
  if v is not null then
    raise exception '21d-crm-contrato: falta el trigger contrato_sellar en %', v;
  end if;

  select p.prosrc into v_src
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.crm_registrar_cambio()')
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  if v_src is null then
    raise exception '21d-crm-contrato: crm_registrar_cambio falta, dejó de ser security definer o quedó sin search_path';
  end if;
  if (char_length(v_src) - char_length(replace(v_src, '- ''updated_at'' - ''updated_by'' - ''creado_via''', '')))
     / char_length('- ''updated_at'' - ''updated_by'' - ''creado_via''') <> 2 then
    raise exception '21d-crm-contrato: crm_registrar_cambio todavía lleva updated_by o creado_via al historial';
  end if;

  if has_function_privilege('anon', 'public.crm_registrar_cambio()', 'execute')
     or has_function_privilege('authenticated', 'public.crm_registrar_cambio()', 'execute') then
    raise exception '21d-crm-contrato: crm_registrar_cambio ejecutable por la API';
  end if;
end $$;

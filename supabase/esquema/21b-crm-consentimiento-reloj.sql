-- ============================================================
-- 21b-crm-consentimiento-reloj.sql — Módulo crm: los consentimientos se
-- sellan con la hora del reloj, no con la de inicio de la transacción
-- Esquema del producto (PP-DEC-02, PP-DEC-19). Lo aplica
-- tools/instalar/modulos.mjs --activar crm (aplicar.mjs --archivo), en una
-- transacción, después de 21-crm.sql. IDEMPOTENTE. Un archivo aplicado no
-- se edita: un cambio va en un archivo nuevo.
--
-- Origen: código nuevo del producto. Corrige 21-crm.sql, que ya está
-- aplicado y no se edita.
--
-- Qué cambia y por qué: crm_consentimientos_preparar sellaba created_at y
-- revocado_en con now(), que es la hora de inicio de la transacción. Dos
-- consentimientos registrados en la misma transacción recibían el mismo
-- created_at y el vigente («el último por created_at desc, id desc») lo
-- decidía el uuid, al azar (caso 13.9 de rls-simulacion.sql). Con
-- clock_timestamp() cada fila lleva la hora real en que se escribió. El
-- resto de la función es el de 21-crm.sql, sin cambios.
--
-- Requisitos: 21-crm.sql aplicado; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                         | Qué                                            |
--   |--------------------------------|------------------------------------------------|
--   | crm_consentimientos_preparar() | created_at y revocado_en con clock_timestamp() |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '21b-crm-consentimiento-reloj detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('public.crm_consentimientos') is null
     or to_regprocedure('public.crm_consentimientos_preparar()') is null then
    raise exception '21b-crm-consentimiento-reloj detenido: falta 21-crm.sql';
  end if;
end $$;

-- ============ 1) Sellado de consentimientos ============
-- Consentimientos: registrado_por y created_at (hora del servidor, decide
-- el vigente) sellados; fecha no futura; el único cambio admitido es
-- revocar una vez (revocado_en y revocado_por sellados).
create or replace function public.crm_consentimientos_preparar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.fecha is null or new.fecha > current_date + 1 then
      raise exception 'crm: la fecha del consentimiento no puede ser futura' using errcode = '23514', hint = 'crm_consentimiento_fecha';
    end if;
    new.registrado_por := auth.uid();
    new.revocado_en := null;
    new.revocado_por := null;
    new.created_at := clock_timestamp();
    return new;
  end if;
  if old.revocado_en is not null then
    raise exception 'crm: el consentimiento ya está revocado' using errcode = '23514', hint = 'crm_consentimiento_revocado';
  end if;
  if (to_jsonb(new) - 'revocado_en' - 'revocado_por') is distinct from (to_jsonb(old) - 'revocado_en' - 'revocado_por') then
    raise exception 'crm: un consentimiento solo se revoca' using errcode = '23514', hint = 'crm_consentimiento_inmutable';
  end if;
  if new.revocado_en is not null then
    new.revocado_en := clock_timestamp();
    new.revocado_por := auth.uid();
  else
    new.revocado_por := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_consentimientos_preparar() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.crm_consentimientos_preparar()')
     and not p.prosecdef
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  if v_src is null then
    raise exception '21b-crm-consentimiento-reloj: crm_consentimientos_preparar falta, quedó security definer o sin search_path';
  end if;
  if position('now()' in v_src) > 0
     or position('new.created_at := clock_timestamp()' in v_src) = 0
     or position('new.revocado_en := clock_timestamp()' in v_src) = 0 then
    raise exception '21b-crm-consentimiento-reloj: crm_consentimientos_preparar no sella con clock_timestamp()';
  end if;

  if has_function_privilege('anon', 'public.crm_consentimientos_preparar()', 'execute')
     or has_function_privilege('authenticated', 'public.crm_consentimientos_preparar()', 'execute') then
    raise exception '21b-crm-consentimiento-reloj: crm_consentimientos_preparar ejecutable por la API';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger g
                  where g.tgname = 'crm_consentimientos_preparar'
                    and g.tgrelid = 'public.crm_consentimientos'::regclass
                    and g.tgfoid = to_regprocedure('public.crm_consentimientos_preparar()')
                    and not g.tgisinternal and g.tgenabled <> 'D') then
    raise exception '21b-crm-consentimiento-reloj: falta el trigger crm_consentimientos_preparar en crm_consentimientos';
  end if;
end $$;

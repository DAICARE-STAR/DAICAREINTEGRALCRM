-- ============================================================
-- 06b-avisos-endpoint.sql — Núcleo: corrige el check del endpoint de
-- push_subscriptions
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción, después de 06-avisos.sql.
-- IDEMPOTENTE. Un archivo aplicado no se edita: un cambio va en un archivo
-- nuevo.
--
-- Origen: código nuevo del producto. Corrige 06-avisos.sql, que ya está
-- aplicado y no se edita.
--
-- Qué cambia y por qué: el check push_subscriptions_endpoint_https de 06
-- usaba la cota {1,1000} y Postgres no admite cotas de repetición mayores
-- de 255: la expresión se compila al evaluarla, así que la tabla se creó
-- pero todo insert fallaba con SQLSTATE 2201B (invalid_regular_expression)
-- y nadie podía suscribirse a push (caso 9.7 de rls-simulacion.sql). El
-- check nuevo exige lo mismo (https://, sin espacios, hasta 1000 caracteres
-- después del prefijo) con el largo fuera de la expresión regular.
--
-- Requisitos: 06-avisos.sql aplicado; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                            | Qué                                           |
--   |-----------------------------------|-----------------------------------------------|
--   | push_subscriptions_endpoint_https | se quita y se vuelve a crear: https://, sin   |
--   |                                   | espacios y hasta 1008 caracteres en total     |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '06b-avisos-endpoint detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('public.push_subscriptions') is null then
    raise exception '06b-avisos-endpoint detenido: falta 06-avisos.sql';
  end if;
end $$;

-- ============ 1) Check del endpoint ============
-- Quitar el check no evalúa la expresión vieja; crear el nuevo evalúa las
-- filas que haya (ninguna pudo entrar con el check anterior).
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_https;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_https
  check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 1008);

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
-- Evalúa el check tal como quedó guardado en el catálogo: una expresión
-- regular inválida falla aquí y no en el primer insert.
do $$
declare
  v_check text;
  v_ok boolean;
begin
  select pg_catalog.pg_get_expr(k.conbin, k.conrelid) into v_check
    from pg_catalog.pg_constraint k
   where k.conrelid = 'public.push_subscriptions'::regclass
     and k.conname = 'push_subscriptions_endpoint_https' and k.contype = 'c' and k.convalidated;
  if v_check is null then
    raise exception '06b-avisos-endpoint: falta el check push_subscriptions_endpoint_https';
  end if;

  begin
    execute 'select bool_and((' || v_check || ') = t.esperado) from (values '
         || '($1::text, true), ($2, true), ($3, false), ($4, false), ($5, false), ($6, false)) as t (endpoint, esperado)'
       into v_ok
      using 'https://push.ejemplo.test/x',
            'https://' || repeat('a', 1000),
            'https://' || repeat('a', 1001),
            'http://push.ejemplo.test/x',
            'https://push.ejemplo.test/con espacio',
            'https://';
  exception when others then
    raise exception '06b-avisos-endpoint: el check del endpoint no se puede evaluar (%)', sqlstate;
  end;
  if v_ok is distinct from true then
    raise exception '06b-avisos-endpoint: el check del endpoint no admite o no rechaza lo esperado';
  end if;
end $$;

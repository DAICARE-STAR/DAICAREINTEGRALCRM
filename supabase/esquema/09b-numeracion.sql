-- ============================================================
-- 09b-numeracion.sql — Núcleo: numeración de documentos en la base (BL-05a)
-- Esquema consolidado del producto (PP-DEC-02, PP-DEC-25). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo. Lleva letra para
-- no renumerar: va después de 09 en una instalación nueva y en una hecha
-- (necesita has_perm, audit_log y aplicar_exigir_mfa).
--
-- Origen: código nuevo del producto. Convenciones en docs/esquema.md.
--
-- Una serie es un contador con nombre (clave): prefijo, relleno con ceros,
-- valor actual, tope opcional, vigencia opcional y reinicio (nunca, anual
-- o mensual). Con reinicio, el número lleva el periodo para no repetirse:
-- prefijo 'COT-', anual, relleno 4 → 'COT-2026-0001'. Dos modos:
--   · con_huecos: secuencia de Postgres propia de la serie (serie_<clave>).
--     No bloquea a nadie; un número entregado no vuelve aunque la
--     transacción se deshaga. Para cotizaciones y pedidos.
--   · sin_huecos: la fila de la serie con bloqueo (select … for update)
--     dentro de la transacción del documento; si esa transacción se
--     deshace, el número se deshace con ella. Espera hasta 2 s
--     (lock_timeout) a que otro documento termine y luego falla con un
--     mensaje claro. Para lo fiscal.
-- Fuera de vigencia, con el tope agotado o con una fecha de un periodo ya
-- pasado, falla cerrado: no entrega número.
--
-- Uso para lo fiscal: el número se asigna al publicar, no al crear el
-- borrador. La función security definer que publica el documento llama a
-- series_siguiente en la misma transacción en la que cambia su estado:
--   update public.<documentos> set numero = public.series_siguiente('<serie>', fecha) …
-- Una serie sin huecos no se avanza suelta desde la API (quedaría un
-- número sin documento): series_siguiente lo rechaza si la llamada llega
-- directa por /rpc/series_siguiente.
--
-- Quién: solo la service role y las funciones security definer avanzan
-- una serie; ningún miembro ejecuta series_siguiente ni escribe actual o
-- periodo, tampoco un administrador (PP-DEC-25, D-9). Quien tiene
-- gestionar_series (un administrador por serlo) ve las series, crea una y
-- cambia prefijo, relleno, tope y vigencia; el modo y el reinicio se fijan
-- al crearla. En una serie con huecos el último número está en su
-- secuencia; actual queda en 0.
--
-- Requisitos: 00 a 09 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                     | Qué                                                     |
--   |----------------------------|---------------------------------------------------------|
--   | series                     | una fila por serie; la ve y la edita gestionar_series   |
--   | series_crear_secuencia()   | trigger: crea serie_<clave> a las series con huecos     |
--   | serie_<clave> (secuencia)  | contador de una serie con huecos; sin grants a la API   |
--   | series_siguiente(clave, f) | siguiente número formateado; service role y definer     |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '09b-numeracion detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.has_perm(text)') is null then
    raise exception '09b-numeracion detenido: falta 00-base.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '09b-numeracion detenido: falta 03-mfa.sql';
  end if;
end $$;

-- ============ 1) Series ============
create table if not exists public.series (
  clave text primary key constraint series_clave_check check (clave ~ '^[a-z][a-z0-9_]{0,39}$'),
  prefijo text not null default '' constraint series_prefijo_check check (char_length(prefijo) <= 20),
  relleno int not null default 4 constraint series_relleno_check check (relleno between 0 and 12),
  actual bigint not null default 0 constraint series_actual_check check (actual >= 0),
  tope bigint constraint series_tope_check check (tope is null or tope >= 1),
  vigente_desde date,
  vigente_hasta date,
  reinicio text not null default 'nunca' constraint series_reinicio_check check (reinicio in ('nunca', 'anual', 'mensual')),
  -- 'AAAA' o 'AAAA-MM' del último número entregado; null sin reinicio
  periodo text,
  modo text not null constraint series_modo_check check (modo in ('con_huecos', 'sin_huecos')),
  created_at timestamptz not null default now(),
  constraint series_vigencia_check check (vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta)
);

alter table public.series enable row level security;

-- La API no escribe actual ni periodo (solo series_siguiente) ni borra
-- series: grants por columna
revoke all on table public.series from anon, authenticated, service_role;
grant select on table public.series to authenticated, service_role;
grant insert (clave, prefijo, relleno, tope, vigente_desde, vigente_hasta, reinicio, modo) on table public.series to authenticated;
grant update (prefijo, relleno, tope, vigente_desde, vigente_hasta) on table public.series to authenticated;

drop policy if exists series_select on public.series;
create policy series_select on public.series
  for select to authenticated
  using ((select public.has_perm('gestionar_series')));

drop policy if exists series_insert on public.series;
create policy series_insert on public.series
  for insert to authenticated
  with check ((select public.has_perm('gestionar_series')));

drop policy if exists series_update on public.series;
create policy series_update on public.series
  for update to authenticated
  using ((select public.has_perm('gestionar_series')))
  with check ((select public.has_perm('gestionar_series')));

-- ============ 2) Secuencia de las series con huecos ============
-- security definer: quien crea la serie (gestionar_series) no puede crear
-- objetos. La secuencia queda sin grants: los privilegios por defecto de
-- Supabase la abrirían a la API.
create or replace function public.series_crear_secuencia()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.modo = 'con_huecos' then
    execute format('create sequence if not exists public.%I as bigint minvalue 1', 'serie_' || new.clave);
    execute format('revoke all on sequence public.%I from public, anon, authenticated, service_role', 'serie_' || new.clave);
  end if;
  return null;
end;
$$;

revoke execute on function public.series_crear_secuencia() from public, anon, authenticated;

drop trigger if exists series_crear_secuencia on public.series;
create trigger series_crear_secuencia
  after insert on public.series
  for each row execute function public.series_crear_secuencia();

-- ============ 3) Siguiente número ============
-- p_fecha es la fecha del documento (vigencia y periodo); por defecto, hoy.
-- lock_timeout va en la función: rige solo mientras corre y no cambia el
-- resto de la transacción del documento.
create or replace function public.series_siguiente(p_clave text, p_fecha date default current_date)
returns text language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  s public.series;
  v_fecha date := coalesce(p_fecha, current_date);
  v_periodo text;
  v_secuencia regclass;
  v_n bigint;
begin
  select * into s from public.series where clave = p_clave;
  if not found then
    raise exception 'numeración: no existe la serie %', p_clave using errcode = 'P0002', hint = 'series_no_existe';
  end if;

  if s.modo = 'sin_huecos' then
    if current_setting('request.path', true) = '/rpc/series_siguiente' then
      raise exception 'numeración: la serie % es sin huecos y se numera al publicar el documento', p_clave
        using errcode = '42501', hint = 'series_suelta';
    end if;
    begin
      select * into s from public.series where clave = p_clave for update;
    exception when lock_not_available then
      raise exception 'numeración: otro documento está tomando un número de la serie %; inténtalo de nuevo', p_clave
        using errcode = '55P03', hint = 'series_ocupada';
    end;
  end if;

  if (s.vigente_desde is not null and v_fecha < s.vigente_desde)
     or (s.vigente_hasta is not null and v_fecha > s.vigente_hasta) then
    raise exception 'numeración: la serie % no está vigente el %', p_clave, v_fecha
      using errcode = '22023', hint = 'series_fuera_de_vigencia';
  end if;

  v_periodo := case s.reinicio when 'anual' then to_char(v_fecha, 'YYYY')
                               when 'mensual' then to_char(v_fecha, 'YYYY-MM') end;
  if v_periodo < s.periodo then
    raise exception 'numeración: el % es de un periodo anterior al de la serie %', v_fecha, p_clave
      using errcode = '22023', hint = 'series_periodo';
  end if;

  if s.modo = 'sin_huecos' then
    v_n := case when v_periodo is distinct from s.periodo then 1 else s.actual + 1 end;
    if s.tope is not null and v_n > s.tope then
      raise exception 'numeración: la serie % llegó a su tope', p_clave using errcode = '54000', hint = 'series_agotada';
    end if;
    update public.series set actual = v_n, periodo = v_periodo where clave = p_clave;
  else
    v_secuencia := format('public.%I', 'serie_' || p_clave)::regclass;
    -- Periodo nuevo: el primero que llega lo anota y reinicia la secuencia;
    -- los demás encuentran el periodo ya anotado y no reinician
    if v_periodo is distinct from s.periodo then
      update public.series set periodo = v_periodo
       where clave = p_clave and (periodo is null or periodo < v_periodo);
      if found then
        perform setval(v_secuencia, 1, false);
      end if;
    end if;
    v_n := nextval(v_secuencia);
    if s.tope is not null and v_n > s.tope then
      raise exception 'numeración: la serie % llegó a su tope', p_clave using errcode = '54000', hint = 'series_agotada';
    end if;
  end if;

  return s.prefijo || coalesce(v_periodo || '-', '') || lpad(v_n::text, greatest(s.relleno, char_length(v_n::text)), '0');
end;
$$;

revoke execute on function public.series_siguiente(text, date) from public, anon, authenticated;
grant execute on function public.series_siguiente(text, date) to service_role;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
-- Prueba los dos modos con series de prueba que se borran al final: un
-- número mal formado, una serie sin huecos que deja hueco al deshacerse o
-- un tope que no frena abortan.
do $$
declare
  v text;
  v_n bigint;
begin
  if to_regclass('public.series') is null
     or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.series'::regclass)
     or not exists (select 1 from pg_catalog.pg_policies p
                     where p.schemaname = 'public' and p.tablename = 'series'
                       and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE') then
    raise exception '09b-numeracion: series sin crear, sin RLS o sin exigir_mfa';
  end if;

  if has_column_privilege('authenticated', 'public.series', 'actual', 'update')
     or has_column_privilege('authenticated', 'public.series', 'periodo', 'update')
     or has_column_privilege('authenticated', 'public.series', 'modo', 'update')
     or has_column_privilege('authenticated', 'public.series', 'actual', 'insert')
     or has_column_privilege('service_role', 'public.series', 'actual', 'update')
     or has_table_privilege('authenticated', 'public.series', 'delete')
     or has_table_privilege('anon', 'public.series', 'select') then
    raise exception '09b-numeracion: la API puede escribir el contador, borrar series o leerlas sin sesión';
  end if;

  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = to_regprocedure('public.series_siguiente(text,date)')
                    and p.prosecdef
                    and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
                    and 'lock_timeout=2s' = any (p.proconfig)) then
    raise exception '09b-numeracion: series_siguiente falta, no es security definer o le falta search_path o lock_timeout';
  end if;
  if has_function_privilege('anon', 'public.series_siguiente(text,date)', 'execute')
     or has_function_privilege('authenticated', 'public.series_siguiente(text,date)', 'execute')
     or not has_function_privilege('service_role', 'public.series_siguiente(text,date)', 'execute')
     or has_function_privilege('authenticated', 'public.series_crear_secuencia()', 'execute') then
    raise exception '09b-numeracion: grants de series_siguiente distintos de solo service_role';
  end if;

  insert into public.series (clave, prefijo, relleno, tope, modo) values ('prueba_09b_sin', 'F-', 4, 2, 'sin_huecos');
  insert into public.series (clave, prefijo, relleno, reinicio, modo) values ('prueba_09b_con', 'C-', 3, 'anual', 'con_huecos');

  if has_sequence_privilege('authenticated', 'public.serie_prueba_09b_con', 'usage')
     or has_sequence_privilege('anon', 'public.serie_prueba_09b_con', 'usage')
     or has_sequence_privilege('service_role', 'public.serie_prueba_09b_con', 'update') then
    raise exception '09b-numeracion: la secuencia de una serie con huecos quedó abierta a la API';
  end if;

  if public.series_siguiente('prueba_09b_sin') <> 'F-0001' then
    raise exception '09b-numeracion: la serie sin huecos no entregó F-0001';
  end if;
  -- Deshacer la transacción del documento deshace el número
  begin
    perform public.series_siguiente('prueba_09b_sin');
    raise exception using errcode = 'P0004';
  exception when sqlstate 'P0004' then
    null;
  end;
  if public.series_siguiente('prueba_09b_sin') <> 'F-0002' then
    raise exception '09b-numeracion: la serie sin huecos dejó un hueco al deshacerse';
  end if;
  begin
    v := public.series_siguiente('prueba_09b_sin');
  exception when sqlstate '54000' then
    v := 'agotada';
  end;
  if v <> 'agotada' then
    raise exception '09b-numeracion: la serie sin huecos pasó su tope';
  end if;
  update public.series set vigente_hasta = current_date - 1, tope = null where clave = 'prueba_09b_sin';
  begin
    v := public.series_siguiente('prueba_09b_sin');
  exception when sqlstate '22023' then
    v := 'fuera';
  end;
  if v <> 'fuera' then
    raise exception '09b-numeracion: la serie entregó número fuera de vigencia';
  end if;

  if public.series_siguiente('prueba_09b_con') <> 'C-' || to_char(current_date, 'YYYY') || '-001' then
    raise exception '09b-numeracion: la serie con huecos no entregó C-<año>-001';
  end if;
  begin
    perform public.series_siguiente('prueba_09b_con', (current_date - interval '1 year')::date);
    v := 'entregó';
  exception when sqlstate '22023' then
    v := 'periodo';
  end;
  if v <> 'periodo' then
    raise exception '09b-numeracion: la serie con huecos numeró en un periodo anterior';
  end if;
  select actual into v_n from public.series where clave = 'prueba_09b_con';
  if v_n <> 0 then
    raise exception '09b-numeracion: la serie con huecos escribió actual';
  end if;

  delete from public.series where clave in ('prueba_09b_sin', 'prueba_09b_con');
  drop sequence public.serie_prueba_09b_con;
end $$;

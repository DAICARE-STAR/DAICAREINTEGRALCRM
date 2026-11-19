-- ============================================================
-- Simulación de RLS y privilegios del núcleo del producto. Lo corre quien
-- instala, contra la base de la instalación.
-- Ejecutar en: Supabase Dashboard → SQL Editor (rol postgres), o con psql
-- como postgres. Todo el archivo de una vez.
-- NO DEJA RASTRO: va en BEGIN … ROLLBACK y termina con un ERROR a propósito
-- cuyo mensaje es el resultado: una línea por caso (OK, FALLA u OMITIDO) y
-- el resumen. Una sección suelta se niega a correr: no está en la
-- transacción de la sección 0. Nunca muestra valores de la base: solo
-- conteos, códigos (SQLSTATE) y nombres de funciones o tablas.
--
-- Requiere: supabase/esquema 00 a 04 aplicados (05 a 09 para las secciones 8 a 11, con 06b para el caso 9.7; 21-crm.sql para la 12 y la 13, con 21b para el caso 13.9; 01b-ultimo-administrador.sql para la 14 y 21c-crm-exportar.sql para la 15; 00b-contrato-tabla.sql para la 16, con 21d-crm-contrato.sql para sus casos del CRM; 09b-numeracion.sql para la 17, 09c-estados.sql para la 18 y 22-catalogo.sql para la 19) y las cuentas de prueba de
-- node tools/instalar/cuentas-prueba.mjs (instalador.cuentas_prueba con qa,
-- miembro y admin). Sin una cuenta, sus casos salen OMITIDO.
--
-- Secciones:
--   0) datos de la simulación: lee instalador.cuentas_prueba
--   1) escalada: un miembro y un gestor de roles sin admin no se suben
--   2) anónimo: sin EXECUTE en security definer, sin filas, privilegios por
--      defecto de funciones y tablas nuevas
--   3) auditoría: solo filas propias 'cliente', correo de la base, inmutable
--   4) rate_limit_hit: solo la service role
--   5) instalacion: el miembro lee y no escribe; el admin escribe con tema
--      válido
--   6) modulos_instalacion: nadie autenticado escribe; módulo de prueba
--      inactivo cierra puede_ver_app y una tabla con aplicar_politica_modulo
--   7) límite de miembros por trigger, con las cuentas de servicio exentas
--   8) perfiles: columnas laborales frenadas, enlaces https:// y perfil de
--      un administrador
--   9) avisos: nadie inserta por la API, cada quien lee y marca los suyos,
--      enlace interno; suscripciones push propias
--  10) uso: latido con topes, lectura solo del administrador, ai_usage y
--      widgets sin escritura para un miembro
--  11) storage: avatar propio sí, ajeno no, marca solo admin, anónimo sin
--      listado, subida por encima del tope rechazada
--  12) crm: lectura con app_crm, alta con edit_crm, borrado de miembro,
--      historial, actividad ajena, catálogos, campos, módulo inactivo,
--      actividades que siguen a su contacto y supresión al borrar
--  13) salud: permiso explícito, aal2, registro de accesos, consentimiento,
--      crm_salud cerrada a la API, consentimientos sin borrado y vigente por
--      created_at, cuenta con salud o consentimientos que no se borra
--  14) último administrador: nadie se quita su propio admin ni borra su
--      perfil; sin sesión se quita admin a quien no es el último, pero no
--      al último (delete, update, es_servicio, truncate ni baja en Auth)
--  15) exportar del crm: sin exportar_crm no se exporta; con él, la lista
--      entera en un jsonb y una fila crm.exportar en la auditoría; más de
--      10 000 cuentas se niega; crm_exportar sin salud ni definer
--  16) contrato de tabla: dominios de moneda y vía; en el crm, autoría,
--      fechas y creado_via sellados aunque el cliente mande otros, y el
--      historial sin updated_by ni creado_via
--  17) numeración: sin huecos sin hueco al deshacer, tope y vigencia que
--      fallan cerrado, con huecos que no devuelve el número, la serie sin
--      huecos no se pide suelta; miembro sin acceso y admin sin contador
--  18) máquina de estados sobre una tabla temporal: estado inicial,
--      transición válida con auditoría, fuera del catálogo, sin permiso,
--      conflicto, update directo y administrador sin excepción
--  19) productos: lectura con app_productos, alta con edit_productos,
--      código normalizado, único y de la serie, impuesto y moneda por
--      defecto, conversiones exactas, unidad base fija con conversiones,
--      precio o líneas, copias de las líneas, borrado de administrador,
--      catálogos inmutables, clase predeterminada, árbol de categorías,
--      historial, lectura desde inventario, módulo inactivo, importación
--      simulada y real, repetidos, topes del lote y anónimo; sin lectura no
--      lee ni escribe, sin edit_productos no cambia nada ni gasta la serie,
--      código fijo en archivados y con líneas, línea que cambia de producto,
--      registro de líneas huérfano y unidad base o clase archivadas
-- Las secciones 8 a 11 salen OMITIDO si falta su archivo de 05 a 09; la 12
-- y la 13, si falta 21-crm.sql; la 14, si falta 01b-ultimo-administrador.sql;
-- la 15, si falta 21c-crm-exportar.sql; la 16, si falta 00b-contrato-tabla.sql
-- (sus casos del CRM, si falta 21d-crm-contrato.sql); la 17, si falta
-- 09b-numeracion.sql; la 18, si falta 09c-estados.sql, y la 19, si falta
-- 22-catalogo.sql.
-- ============================================================

begin;

-- ============ 0) Datos de la simulación (como postgres) ============
do $$
declare
  v_qa uuid;
  v_miembro uuid;
  v_admin uuid;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'rls-simulacion: ejecutar como postgres (SQL Editor), no como %', current_user;
  end if;
  if to_regprocedure('public.has_modulo(text)') is null then
    raise exception 'rls-simulacion: falta 04-instalacion-modulos.sql. Aplica el núcleo con tools/instalar/aplicar.mjs antes.';
  end if;
  if to_regclass('instalador.cuentas_prueba') is null then
    raise exception 'rls-simulacion: falta instalador.cuentas_prueba. Corre node tools/instalar/cuentas-prueba.mjs antes.';
  end if;

  select user_id into v_qa from instalador.cuentas_prueba where rol = 'qa';
  select user_id into v_miembro from instalador.cuentas_prueba where rol = 'miembro';
  select user_id into v_admin from instalador.cuentas_prueba where rol = 'admin';

  if (v_qa is not null and public.is_admin(v_qa)) or (v_miembro is not null and public.is_admin(v_miembro)) then
    raise exception 'rls-simulacion: las cuentas qa y miembro deben ser solo member';
  end if;
  if v_admin is not null and not public.is_admin(v_admin) then
    raise exception 'rls-simulacion: la cuenta admin de prueba no tiene el rol admin';
  end if;

  -- rls.txid: cada sección comprueba que corre en esta misma transacción
  perform set_config('rls.qa', coalesce(v_qa::text, ''), true),
          set_config('rls.miembro', coalesce(v_miembro::text, ''), true),
          set_config('rls.admin', coalesce(v_admin::text, ''), true),
          set_config('rls.txid', txid_current()::text, true),
          set_config('rls.res', '', true);
end $$;

-- ============ 1) Escalada: miembro y gestor de roles sin admin ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 1     escalada · falta la cuenta miembro', true);
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  begin
    insert into public.user_roles (user_id, role) values (v_miembro, 'admin');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.1   miembro se asigna admin → 42501 · ' || v;

  begin
    insert into public.roles (name, permissions) values ('prueba-rls-escala', array['manage_roles']);
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.2   miembro crea un rol con manage_roles → 42501 · ' || v;

  begin
    update public.profiles set role = 'admin', es_servicio = true where id = v_miembro;
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  reset role;
  -- auth.uid() lee el claim aunque el rol sea postgres: sin borrarlo, las
  -- altas de abajo pasarían por roles_guard_escalada como el miembro
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.profiles where id = v_miembro and (role = 'admin' or es_servicio);
  r := r || E'\n' || case when v_n = 0 then 'OK      ' else 'FALLA   ' end || '1.3   miembro cambia su profiles.role y es_servicio → sin cambio · ' || v || ' / ' || v_n || ' cambiados';

  -- Gestor de roles sin admin: un rol temporal con manage_roles para el miembro
  insert into public.roles (name, permissions, position) values ('prueba-rls-gestor', array['manage_roles'], 50);
  insert into public.roles (name, permissions, position) values ('prueba-rls-otro', '{}', 20);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-gestor');
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  begin
    update public.roles set permissions = array['manage_members'] where name = 'prueba-rls-otro';
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v in ('42501', '0 filas') then 'OK      ' else 'FALLA   ' end || '1.4   gestor sin admin otorga manage_members → 42501 · ' || v;

  begin
    update public.roles set permissions = array['delete_projects'] where name = 'prueba-rls-otro';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.5   gestor sin admin otorga un permiso solo-admin → 42501 · ' || v;

  begin
    update public.roles set position = 1000 where name = 'prueba-rls-otro';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.6   gestor sin admin sube un rol sobre admin → 42501 · ' || v;

  begin
    update public.roles set description = 'prueba' where name = 'admin';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.7   gestor sin admin modifica el rol admin → 42501 · ' || v;

  begin
    update public.roles set funcion = 'qa' where name = 'prueba-rls-otro';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '1.8   gestor sin admin asigna la funcion de un rol → 42501 · ' || v;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 2) Anónimo ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_lista text;
  v_tabla text;
  i int := 1;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_lista
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  r := r || E'\n' || case when v_lista is null then 'OK      ' else 'FALLA   ' end
         || '2.1   security definer ejecutables por anon → ninguna · ' || coalesce(v_lista, 'ninguna');

  -- Privilegios por defecto (87): una función y una tabla nuevas no nacen abiertas
  create function public.prueba_rls_defecto() returns int language sql set search_path = public, pg_temp as $f$ select 1 $f$;
  create table public.prueba_rls_defecto (id int);
  v := has_function_privilege('anon', 'public.prueba_rls_defecto()', 'execute')::text
       || ' / ' || has_table_privilege('anon', 'public.prueba_rls_defecto', 'select')::text;
  r := r || E'\n' || case when v = 'false / false' then 'OK      ' else 'FALLA   ' end
         || '2.2   función y tabla nuevas sin privilegios para anon → false / false · ' || v;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  foreach v_tabla in array array['instalacion', 'modulos_instalacion', 'profiles', 'roles', 'user_roles',
                                 'connectors', 'audit_log', 'api_rate_limits', 'security_settings'] loop
    i := i + 1;
    begin
      execute format('select count(*) from public.%I', v_tabla) into v_n;
      v := v_n || ' filas';
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v in ('42501', '0 filas') then 'OK      ' else 'FALLA   ' end
           || format('2.%s%s anónimo lee %s → 42501 o 0 filas · %s', i + 1, case when i + 1 < 10 then '   ' else '  ' end, v_tabla, v);
  end loop;

  begin
    perform public.has_modulo('nucleo');
    v := 'se ejecutó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '2.12  anónimo ejecuta has_modulo → 42501 · ' || v;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 3) Auditoría ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
  v_id bigint;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 3     auditoría · falta la cuenta miembro', true);
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  begin
    insert into public.audit_log (user_id, action, origen) values (v_miembro, 'prueba.rls', 'base');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '3.1   miembro escribe una fila ''base'' → 42501 · ' || v;

  begin
    insert into public.audit_log (user_id, action) values (coalesce(v_admin, gen_random_uuid()), 'prueba.rls');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '3.2   miembro escribe a nombre de otro → 42501 · ' || v;

  begin
    insert into public.audit_log (user_id, user_email, action) values (v_miembro, 'inventado', 'prueba.rls');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '3.3   miembro registra su propia acción → entró · ' || v;

  begin
    update public.audit_log set detail = 'cambiado' where action = 'prueba.rls';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '3.4   miembro edita el registro → 42501 · ' || v;

  begin
    select count(*) into v_n from public.audit_log;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '0 filas' then 'OK      ' else 'FALLA   ' end || '3.5   miembro lee el registro → 0 filas · ' || v;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- El correo lo pone la base desde auth.users, no el cliente
  select count(*) into v_n
    from public.audit_log a join auth.users u on u.id = a.user_id
   where a.action = 'prueba.rls' and a.user_email = coalesce(u.email, '');
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '3.6   user_email sale de auth.users → 1 fila · ' || v_n;

  -- Un cambio de rol deja su fila 'base'
  insert into public.roles (name) values ('prueba-rls-auditoria');
  select count(*) into v_n from public.audit_log where origen = 'base' and action = 'roles.insert' and entity_id = 'prueba-rls-auditoria';
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '3.7   auditar_cambio registra el alta de un rol → 1 fila · ' || v_n;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 4) rate_limit_hit: solo la service role ============
do $$
declare
  r text := '';
  v text;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  if v_miembro is null then
    r := r || E'\nOMITIDO 4.1   miembro ejecuta rate_limit_hit · falta la cuenta miembro';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    begin
      perform public.rate_limit_hit('prueba-rls', 60, 5);
      v := 'se ejecutó';
    exception when others then v := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '4.1   miembro ejecuta rate_limit_hit → 42501 · ' || v;
  end if;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.rate_limit_hit('prueba-rls', 60, 5);
    v := 'se ejecutó';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '4.2   anónimo ejecuta rate_limit_hit → 42501 · ' || v;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    set local role service_role;
    v := public.rate_limit_hit('prueba-rls', 60, 1)::text || ' / ' || public.rate_limit_hit('prueba-rls', 60, 1)::text;
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  r := r || E'\n' || case when v = 'false / true' then 'OK      ' else 'FALLA   ' end || '4.3   service role: primer golpe pasa, segundo supera el máximo 1 → false / true · ' || v;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 5) instalacion ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  if v_miembro is null then
    r := r || E'\nOMITIDO 5.1-4 instalacion como miembro · falta la cuenta miembro';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    begin
      select count(*) into v_n from public.instalacion;
      v := v_n || case when v_n = 1 then ' fila' else ' filas' end;
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v = '1 fila' then 'OK      ' else 'FALLA   ' end || '5.1   miembro lee instalacion → 1 fila · ' || v;

    begin
      update public.instalacion set nombre = 'prueba-rls' where id = 1;
      get diagnostics v_n = row_count;
      v := v_n || ' filas';
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v in ('0 filas', '42501') then 'OK      ' else 'FALLA   ' end || '5.2   miembro cambia instalacion → 0 filas · ' || v;

    begin
      insert into public.instalacion (id) values (1);
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '5.3   miembro inserta en instalacion → 42501 · ' || v;

    begin
      delete from public.instalacion;
      v := 'borró';
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '5.4   miembro borra instalacion → 42501 · ' || v;
    reset role;
  end if;

  if v_admin is null then
    r := r || E'\nOMITIDO 5.5-6 instalacion como administrador · falta la cuenta admin';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      update public.instalacion set tema = '{"--pal-acento-500": "#1f5f6b"}' where id = 1;
      get diagnostics v_n = row_count;
      v := v_n || case when v_n = 1 then ' fila' else ' filas' end;
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v = '1 fila' then 'OK      ' else 'FALLA   ' end || '5.5   admin cambia el tema con una primitiva válida → 1 fila · ' || v;

    begin
      update public.instalacion set tema = '{"--pal-acento-500": "red;background:url(x)"}' where id = 1;
      v := 'actualizó';
    exception when others then v := sqlstate;
    end;
    begin
      update public.instalacion set tema = '{"--txt": "#000000"}' where id = 1;
      v := v || ' / actualizó';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    r := r || E'\n' || case when v = '23514 / 23514' then 'OK      ' else 'FALLA   ' end || '5.6   admin guarda un valor que no es #rrggbb o una clave ajena → 23514 / 23514 · ' || v;

    begin
      update public.instalacion set zona_horaria = 'Bogota' where id = 1;
      v := 'actualizó';
    exception when others then v := sqlstate;
    end;
    r := r || E'\n' || case when v = '23514' then 'OK      ' else 'FALLA   ' end || '5.7   admin guarda una zona horaria que no existe → 23514 · ' || v;

    if v_miembro is null then
      r := r || E'\nOMITIDO 5.8   admin cambia es_servicio · falta la cuenta miembro';
    else
      begin
        update public.profiles set es_servicio = true where id = v_miembro;
        v := 'actualizó';
      exception when others then v := sqlstate;
      end;
      reset role;
      select count(*) into v_n from public.profiles where id = v_miembro and es_servicio;
      r := r || E'\n' || case when v_n = 0 then 'OK      ' else 'FALLA   ' end || '5.8   admin marca a un miembro como cuenta de servicio → sin cambio · ' || v || ' / ' || v_n || ' cambiados';
    end if;
    reset role;
  end if;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 6) modulos_instalacion y política de módulo ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
  v_quien uuid;
  v_etiqueta text;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  -- 6.1-6.6 Ni el miembro ni el administrador escriben modulos_instalacion
  foreach v_etiqueta in array array['miembro', 'admin'] loop
    v_quien := case v_etiqueta when 'miembro' then v_miembro else v_admin end;
    if v_quien is null then
      r := r || format(E'\nOMITIDO 6     escritura de modulos_instalacion como %s · falta la cuenta', v_etiqueta);
      continue;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_quien, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      insert into public.modulos_instalacion (slug, activo) values ('prueba-rls', true);
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    begin
      update public.modulos_instalacion set limites = '{}' where slug = 'nucleo';
      v := v || ' / actualizó';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    begin
      delete from public.modulos_instalacion where slug = 'nucleo';
      v := v || ' / borró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '42501 / 42501 / 42501' then 'OK      ' else 'FALLA   ' end
           || format('6.%s   %s inserta, cambia y borra en modulos_instalacion → 42501 / 42501 / 42501 · %s',
                     case v_etiqueta when 'miembro' then 1 else 2 end, v_etiqueta, v);
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- Módulo de prueba inactivo y una tabla suya cerrada con aplicar_politica_modulo
  insert into public.modulos_instalacion (slug, activo) values ('prueba-rls', false);
  insert into public.roles (name, permissions) values ('prueba-rls-ver', array['app_prueba-rls']);
  create table public.prueba_rls_modulo (id int);
  alter table public.prueba_rls_modulo enable row level security;
  grant select, insert on table public.prueba_rls_modulo to authenticated;
  create policy prueba_rls_select on public.prueba_rls_modulo for select to authenticated using (true);
  create policy prueba_rls_insert on public.prueba_rls_modulo for insert to authenticated with check (true);
  insert into public.prueba_rls_modulo values (1), (2);
  perform public.aplicar_politica_modulo('public.prueba_rls_modulo', array['prueba-rls']);

  v := has_function_privilege('authenticated', 'public.aplicar_politica_modulo(regclass,text[])', 'execute')::text;
  r := r || E'\n' || case when v = 'false' then 'OK      ' else 'FALLA   ' end || '6.3   authenticated ejecuta aplicar_politica_modulo → false · ' || v;

  if v_admin is null then
    r := r || E'\nOMITIDO 6.4   admin y módulo inactivo · falta la cuenta admin';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    v := public.puede_ver_app('prueba-rls')::text;
    reset role;
    r := r || E'\n' || case when v = 'false' then 'OK      ' else 'FALLA   ' end || '6.4   admin ve un módulo inactivo → false · ' || v;
  end if;

  if v_miembro is null then
    r := r || E'\nOMITIDO 6.5-8 miembro y módulo de prueba · falta la cuenta miembro';
  else
    insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-ver');
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    v := public.puede_ver_app('prueba-rls')::text;
    begin
      select count(*) into v_n from public.prueba_rls_modulo;
      v := v || ' / ' || v_n || ' filas';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    begin
      insert into public.prueba_rls_modulo values (3);
      v := v || ' / entró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = 'false / 0 filas / 42501' then 'OK      ' else 'FALLA   ' end
           || '6.5   módulo inactivo: miembro con el permiso no lo ve, lee 0 filas y no escribe → false / 0 filas / 42501 · ' || v;

    update public.modulos_instalacion set activo = true where slug = 'prueba-rls';
    set local role authenticated;
    v := public.puede_ver_app('prueba-rls')::text;
    begin
      select count(*) into v_n from public.prueba_rls_modulo;
      v := v || ' / ' || v_n || ' filas';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = 'true / 2 filas' then 'OK      ' else 'FALLA   ' end
           || '6.6   módulo activo: el mismo miembro lo ve y lee sus filas → true / 2 filas · ' || v;

    delete from public.user_roles where user_id = v_miembro and role = 'prueba-rls-ver';
    set local role authenticated;
    v := public.puede_ver_app('prueba-rls')::text;
    reset role;
    r := r || E'\n' || case when v = 'false' then 'OK      ' else 'FALLA   ' end
           || '6.7   módulo activo sin el permiso app_prueba-rls → false · ' || v;

    set local role authenticated;
    v := coalesce(public.limite_modulo('nucleo', 'miembros')::text, 'null') || ' / ' || public.has_modulo('nucleo')::text;
    reset role;
    r := r || E'\n' || case when v ~ '^(\d+|null) / true$' then 'OK      ' else 'FALLA   ' end
           || '6.8   miembro lee limite_modulo y has_modulo del núcleo → número o null / true · ' || v;
  end if;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 7) Límite de miembros (trigger de respaldo) ============
-- profiles_limite_miembros es diferido: cada caso lo dispara con SET
-- CONSTRAINTS … IMMEDIATE dentro de su bloque, como haría el COMMIT del alta.
do $$
declare
  r text := '';
  v text;
  v_n bigint;
  v_n2 bigint;
  v_id uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  select count(*) into v_n from public.profiles where not es_servicio;
  update public.modulos_instalacion set limites = limites || jsonb_build_object('miembros', v_n) where slug = 'nucleo';

  -- Las altas de Auth crean el perfil (handle_new_user) y el trigger lo frena
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    set constraints public.profiles_limite_miembros immediate;
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  set constraints public.profiles_limite_miembros deferred;
  r := r || E'\n' || case when v = 'limite_miembros' then 'OK      ' else 'FALLA   ' end || '7.1   alta con el cupo lleno → limite_miembros · ' || v;

  -- Orden de la API Admin de Auth: el usuario entra sin es_servicio y el
  -- app_metadata del cuerpo llega después con un UPDATE
  begin
    v_id := gen_random_uuid();
    insert into auth.users (id, aud, role, raw_app_meta_data)
    values (v_id, 'authenticated', 'authenticated', '{"provider": "email", "providers": ["email"]}');
    update auth.users set raw_app_meta_data = raw_app_meta_data || '{"es_servicio": true}' where id = v_id;
    set constraints public.profiles_limite_miembros immediate;
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  set constraints public.profiles_limite_miembros deferred;
  select count(*) into v_n2 from public.profiles where not es_servicio;
  r := r || E'\n' || case when v = 'entró' and v_n2 = v_n then 'OK      ' else 'FALLA   ' end
         || '7.2   alta de una cuenta de servicio por la API Admin con el cupo lleno → entró y no cuenta · ' || v || ' / ' || (v_n2 - v_n) || ' miembros de más';

  update public.modulos_instalacion set limites = limites || jsonb_build_object('miembros', v_n + 1) where slug = 'nucleo';
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    set constraints public.profiles_limite_miembros immediate;
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  set constraints public.profiles_limite_miembros deferred;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '7.3   alta con un cupo libre → entró · ' || v;

  update public.modulos_instalacion set limites = limites || '{"miembros": null}' where slug = 'nucleo';
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    set constraints public.profiles_limite_miembros immediate;
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  set constraints public.profiles_limite_miembros deferred;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '7.4   alta sin límite (null) → entró · ' || v;

  begin
    v_id := gen_random_uuid();
    insert into auth.users (id, aud, role, raw_app_meta_data)
    values (v_id, 'authenticated', 'authenticated', '{"provider": "email", "providers": ["email"]}');
    update auth.users set raw_app_meta_data = raw_app_meta_data || '{"es_servicio": true}' where id = v_id;
    set constraints public.profiles_limite_miembros immediate;
    select count(*) into v_n2 from public.profiles where id = v_id and es_servicio;
    v := v_n2::text;
  exception when others then v := sqlstate;
  end;
  set constraints public.profiles_limite_miembros deferred;
  r := r || E'\n' || case when v = '1' then 'OK      ' else 'FALLA   ' end || '7.5   cuenta de servicio sin límite (null) → nace con es_servicio · ' || v;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 8) Perfiles: columnas laborales, enlaces y perfil ajeno ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.guard_profile_laboral()') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 8     perfiles · falta 05-perfiles.sql', true);
    return;
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 8     perfiles · falta la cuenta miembro', true);
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    update public.profiles set area = 'prueba-rls', fecha_ingreso = date '2000-01-01', bio = 'prueba-rls' where id = v_miembro;
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.profiles
   where id = v_miembro and bio = 'prueba-rls'
     and area is distinct from 'prueba-rls' and fecha_ingreso is distinct from date '2000-01-01';
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end
         || '8.1   miembro cambia su bio, su área y su fecha de ingreso → solo la bio · ' || v || ' / ' || v_n;

  set local role authenticated;
  begin
    update public.profiles set enlaces = array['http://ejemplo.test'] where id = v_miembro;
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '23514' then 'OK      ' else 'FALLA   ' end || '8.2   miembro guarda un enlace que no es https:// → 23514 · ' || v;

  if v_admin is null then
    reset role;
    r := r || E'\nOMITIDO 8.3-4 perfil del administrador · falta la cuenta admin';
  else
    begin
      update public.profiles set bio = 'prueba-rls' where id = v_admin;
      get diagnostics v_n = row_count;
      v := v_n || ' filas';
    exception when others then v := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v in ('0 filas', '42501') then 'OK      ' else 'FALLA   ' end || '8.3   miembro edita el perfil de un administrador → 0 filas · ' || v;

    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      update public.profiles set area = 'prueba-rls-admin' where id = v_miembro;
      v := 'actualizó';
    exception when others then v := sqlstate;
    end;
    reset role;
    select count(*) into v_n from public.profiles where id = v_miembro and area = 'prueba-rls-admin';
    r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '8.4   admin cambia el área de un miembro → 1 fila · ' || v || ' / ' || v_n;
  end if;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 9) Avisos y suscripciones push ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regclass('public.user_notifications') is null or to_regclass('public.push_subscriptions') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 9     avisos · falta 06-avisos.sql', true);
    return;
  end if;
  if v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 9     avisos · faltan las cuentas miembro o admin', true);
    return;
  end if;

  -- Como postgres: un aviso de prueba para cada uno
  perform public.push_notification(v_miembro, null, 'sistema', 'prueba-rls', '', '/admin');
  perform public.push_notification(v_admin, null, 'sistema', 'prueba-rls', '', '/admin');
  begin
    insert into public.user_notifications (user_id, title, link) values (v_miembro, 'prueba-rls', '//ejemplo.test');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '23514' then 'OK      ' else 'FALLA   ' end || '9.1   aviso con enlace externo (//host) → 23514 · ' || v;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into public.user_notifications (user_id, title) values (v_admin, 'prueba-rls');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '9.2   miembro inserta un aviso para otro → 42501 · ' || v;

  begin
    perform public.push_notification(v_admin, v_miembro, 'sistema', 'prueba-rls', '', '/');
    v := 'se ejecutó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '9.3   miembro ejecuta push_notification → 42501 · ' || v;

  select count(*) into v_n from public.user_notifications where title = 'prueba-rls';
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '9.4   miembro lee los avisos de prueba → solo el suyo (1) · ' || v_n;

  begin
    update public.user_notifications set read = true where title = 'prueba-rls';
    get diagnostics v_n = row_count;
    v := v_n || case when v_n = 1 then ' fila' else ' filas' end;
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '1 fila' then 'OK      ' else 'FALLA   ' end || '9.5   miembro marca leídos los avisos de prueba → solo el suyo (1 fila) · ' || v;

  begin
    update public.user_notifications set title = 'cambiado' where user_id = v_miembro and title = 'prueba-rls';
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '9.6   miembro reescribe el título de su aviso → 42501 · ' || v;

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (v_admin, 'https://push.ejemplo.test/prueba-rls-ajena', 'x', 'x');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth)
    values ('https://push.ejemplo.test/prueba-rls-propia', 'x', 'x');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '42501 / entró' then 'OK      ' else 'FALLA   ' end || '9.7   miembro suscribe a otro y a sí mismo → 42501 / entró · ' || v;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.push_subscriptions where endpoint like 'https://push.ejemplo.test/prueba-rls%';
  reset role;
  r := r || E'\n' || case when v_n = 0 then 'OK      ' else 'FALLA   ' end || '9.8   admin lee la suscripción de un miembro → 0 filas · ' || v_n;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 10) Uso del portal, widgets e IA ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regclass('public.portal_uso') is null or to_regclass('public.ai_usage') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 10    uso e IA · faltan 07-widgets-uso.sql u 08-ia.sql', true);
    return;
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 10    uso e IA · falta la cuenta miembro', true);
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform public.uso_latido('prueba-rls', 99, 99);
    v := 'se ejecutó';
  exception when others then v := sqlstate;
  end;
  reset role;
  select coalesce(max(u.minutos || ' / ' || u.aperturas), 'sin fila') into v
    from public.portal_uso u where u.user_id = v_miembro and u.app = 'prueba-rls';
  r := r || E'\n' || case when v = '5 / 20' then 'OK      ' else 'FALLA   ' end || '10.1  latido inflado (99 / 99) queda en el tope → 5 / 20 · ' || v;

  set local role authenticated;
  begin
    select count(*) into v_n from public.portal_uso;
    v := v_n || ' filas';
    select count(*) into v_n from public.uso_resumen(current_date - 1, current_date + 1);
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '0 filas / 0 filas' then 'OK      ' else 'FALLA   ' end || '10.2  miembro lee portal_uso y uso_resumen → 0 filas / 0 filas · ' || v;

  begin
    insert into public.portal_uso (user_id, dia, app, minutos) values (v_miembro, current_date, 'prueba-rls-2', 600);
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    perform public.uso_purgar(30);
    v := v || ' / se ejecutó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '42501 / 42501' then 'OK      ' else 'FALLA   ' end || '10.3  miembro escribe portal_uso y ejecuta uso_purgar → 42501 / 42501 · ' || v;

  begin
    select count(*) into v_n from public.ai_usage;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.ai_usage (feature, user_id) values ('prueba-rls', v_miembro);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '0 filas / 42501' then 'OK      ' else 'FALLA   ' end || '10.4  miembro lee y escribe ai_usage → 0 filas / 42501 · ' || v;

  begin
    update public.portal_widgets set active = false where id = 'clock';
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v in ('0 filas', '42501') then 'OK      ' else 'FALLA   ' end || '10.5  miembro sin manage_apps cambia un widget → 0 filas · ' || v;
  reset role;

  if v_admin is null then
    r := r || E'\nOMITIDO 10.6  admin lee el uso · falta la cuenta admin';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      select count(*) into v_n from public.uso_resumen(current_date - 1, current_date + 1) where user_id = v_miembro and app = 'prueba-rls';
      v := v_n || case when v_n = 1 then ' fila' else ' filas' end;
    exception when others then v := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '1 fila' then 'OK      ' else 'FALLA   ' end || '10.6  admin lee el uso del miembro en uso_resumen → 1 fila · ' || v;
  end if;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.uso_latido('prueba-rls', 1, 1);
    v := 'se ejecutó';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '10.7  anónimo ejecuta uso_latido → 42501 · ' || v;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 11) Storage: avatares, marca, listado y tope de almacenamiento ============
-- Las filas de storage.objects se insertan directo, como haría la API de
-- Storage con la sesión del miembro: no se sube ningún archivo.
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_m int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.almacenamiento_disponible()') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 11    storage · falta 09-storage-base.sql', true);
    return;
  end if;
  if v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 11    storage · faltan las cuentas miembro o admin', true);
    return;
  end if;

  -- Sin límite durante los casos de permisos; el tope se prueba en 11.6
  update public.modulos_instalacion set limites = limites || '{"almacenamiento_mb": null}' where slug = 'nucleo';
  -- Un avatar del administrador, como postgres
  insert into storage.objects (bucket_id, name, metadata)
  values ('avatares', v_admin::text || '/prueba-rls.png', '{"size": 10}');

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('avatares', v_miembro::text || '/prueba-rls.png', '{"size": 10}');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '11.1  miembro sube a su carpeta de avatares → entró · ' || v;

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('avatares', v_admin::text || '/prueba-rls-ajeno.png', '{"size": 10}');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '11.2  miembro sube a la carpeta de otro → 42501 · ' || v;

  begin
    insert into storage.objects (bucket_id, name, metadata) values ('marca', 'prueba-rls.png', '{"size": 10}');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '11.3  miembro sube a marca → 42501 · ' || v;

  select count(*) into v_n from storage.objects
   where bucket_id in ('avatares', 'marca') and name not like v_miembro::text || '/%';
  begin
    delete from storage.objects where bucket_id = 'avatares' and name = v_admin::text || '/prueba-rls.png';
    get diagnostics v_m = row_count;
    v := v_m::text;
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v_n = 0 and v in ('0', '42501') then 'OK      ' else 'FALLA   ' end
         || '11.4  miembro lista y borra avatares ajenos → 0 filas / 0 · ' || v_n || ' filas / ' || v;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into v_n from storage.objects where bucket_id in ('avatares', 'marca');
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v in ('0 filas', '42501') then 'OK      ' else 'FALLA   ' end || '11.5  anónimo lista avatares y marca → 0 filas · ' || v;

  -- Tope en 0 MB: ya está lleno con cualquier uso
  update public.modulos_instalacion set limites = limites || '{"almacenamiento_mb": 0}' where slug = 'nucleo';
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('avatares', v_miembro::text || '/prueba-rls-2.png', '{"size": 10}');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '11.6  subida con el tope de almacenamiento superado → 42501 · ' || v;

  update public.modulos_instalacion set limites = limites || '{"almacenamiento_mb": null}' where slug = 'nucleo';
  set local role authenticated;
  v := public.almacenamiento_disponible()::text;
  reset role;
  r := r || E'\n' || case when v = 'true' then 'OK      ' else 'FALLA   ' end || '11.7  sin límite de almacenamiento (null) → true · ' || v;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 12) CRM: lectura, escritura, borrado, catálogos e historial ============
-- Activa crm en la transacción (se deshace) con roles de prueba app_crm y
-- edit_crm para el miembro.
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_cuenta uuid;
  v_act uuid;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regclass('public.crm_cuentas') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 12    crm · falta 21-crm.sql', true);
    return;
  end if;
  if v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 12    crm · faltan las cuentas miembro o admin', true);
    return;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into public.modulos_instalacion (slug, activo) values ('crm', true)
  on conflict (slug) do update set activo = true;
  insert into public.roles (name, permissions) values ('prueba-rls-crm-ver', array['app_crm']);
  insert into public.roles (name, permissions) values ('prueba-rls-crm-edit', array['app_crm', 'edit_crm']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-crm-ver');

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    select count(*) into v_n from public.crm_cuentas;
    v := 'lee';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.crm_cuentas (tipo, nombre) values ('persona', 'Prueba RLS lectura');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = 'lee / 42501' then 'OK      ' else 'FALLA   ' end || '12.1  miembro con app_crm lee y no escribe → lee / 42501 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-crm-edit');
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into public.crm_cuentas (tipo, nombre, documento) values ('persona', 'Prueba RLS', '1.234.567-8') returning id into v_cuenta;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.crm_cuentas where id = v_cuenta and created_by = v_miembro and documento = '12345678';
  r := r || E'\n' || case when v = 'entró' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '12.2  miembro con edit_crm crea una cuenta sellada y normalizada → entró / 1 · ' || v || ' / ' || v_n;

  if v_cuenta is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('rls.res', current_setting('rls.res') || r || E'\nOMITIDO 12.3-7 crm · no se creó la cuenta de prueba', true);
    return;
  end if;

  select count(*) into v_n from public.crm_cambios where entidad = 'cuenta' and entidad_id = v_cuenta and operacion = 'insert';
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '12.3  crm_cambios recibe la fila del alta → 1 · ' || v_n;

  set local role authenticated;
  begin
    delete from public.crm_cuentas where id = v_cuenta;
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.crm_cambios (entidad, entidad_id, operacion) values ('cuenta', v_cuenta, 'delete');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '0 filas / 42501' then 'OK      ' else 'FALLA   ' end || '12.4  miembro borra la cuenta y escribe crm_cambios → 0 filas / 42501 · ' || v;

  -- Actividad del administrador (auth.uid() lee el claim aunque el rol sea postgres)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into public.crm_actividades (tipo, cuenta_id, asunto) values ('nota', v_cuenta, 'Prueba RLS') returning id into v_act;
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    update public.crm_actividades set asunto = 'cambiada' where id = v_act;
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v in ('0 filas', '42501') then 'OK      ' else 'FALLA   ' end || '12.5  miembro edita una actividad ajena → 0 filas · ' || v;

  set local role authenticated;
  begin
    update public.crm_cuentas set etapa = 'etapa-inventada' where id = v_cuenta;
    v := 'actualizó';
  exception when others then v := sqlstate;
  end;
  begin
    update public.crm_cuentas set campos = '{"campo_inexistente": 1}' where id = v_cuenta;
    v := v || ' / actualizó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '23514 / 23514' then 'OK      ' else 'FALLA   ' end || '12.6  etapa inventada y campo no definido → 23514 / 23514 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  update public.modulos_instalacion set activo = false where slug = 'crm';
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    select count(*) into v_n from public.crm_cuentas;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.crm_cuentas (tipo, nombre) values ('persona', 'Prueba RLS inactivo');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '0 filas / 42501' then 'OK      ' else 'FALLA   ' end || '12.7  módulo inactivo: lee y escribe → 0 filas / 42501 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  update public.modulos_instalacion set activo = true where slug = 'crm';

  -- 12.8 Un contacto que cambia de cuenta se lleva sus actividades
  declare
    v_otra uuid;
    v_contacto uuid;
    v_act2 uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    insert into public.crm_cuentas (tipo, nombre) values ('empresa', 'Prueba RLS destino') returning id into v_otra;
    insert into public.crm_contactos (cuenta_id, nombre) values (v_cuenta, 'Prueba RLS contacto') returning id into v_contacto;
    insert into public.crm_actividades (tipo, contacto_id, asunto) values ('nota', v_contacto, 'Prueba RLS') returning id into v_act2;
    update public.crm_contactos set cuenta_id = v_otra where id = v_contacto;
    select count(*) into v_n from public.crm_actividades where id = v_act2 and cuenta_id = v_otra;
    v := v_n::text;
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '1' then 'OK      ' else 'FALLA   ' end || '12.8  contacto movido arrastra sus actividades → 1 · ' || v;

  -- 12.9 Supresión: borrar una cuenta deja una sola fila de borrado sin datos
  -- y quita sus vínculos externos
  declare
    v_sup uuid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    insert into public.crm_cuentas (tipo, nombre, notas) values ('persona', 'Prueba RLS supresión', 'dato personal') returning id into v_sup;
    update public.crm_cuentas set notas = 'otro dato' where id = v_sup;
    insert into public.crm_vinculos_externos (entidad, entidad_id, origen, id_externo) values ('cuenta', v_sup, 'prueba', 'x1');
    set local role authenticated;
    delete from public.crm_cuentas where id = v_sup;
    reset role;
    select count(*) || '/' || count(*) filter (where operacion = 'delete' and antes is null and despues is null and autor_id = v_admin)
           || '/' || (select count(*) from public.crm_vinculos_externos where entidad = 'cuenta' and entidad_id = v_sup)
      into v from public.crm_cambios where entidad = 'cuenta' and entidad_id = v_sup;
  exception when others then reset role; v := sqlstate;
  end;
  r := r || E'\n' || case when v = '1/1/0' then 'OK      ' else 'FALLA   ' end || '12.9  borrado de cuenta: historial suprimido y vínculos fuera → 1/1/0 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.crm_cuenta', v_cuenta::text, true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 13) Salud: permiso explícito, segundo factor, consentimiento y registro ============
do $$
declare
  r text := '';
  v text;
  v_hint text;
  v_n int;
  v_m int;
  v_cuenta uuid := nullif(current_setting('rls.crm_cuenta', true), '')::uuid;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.crm_salud_leer(uuid)') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 13    salud · falta 21-crm.sql', true);
    return;
  end if;
  if v_cuenta is null or v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 13    salud · falta la cuenta de prueba de la sección 12 o las cuentas miembro y admin', true);
    return;
  end if;

  -- 13.1 Con edit_crm pero sin ver_salud, aun con aal2
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    perform public.crm_salud_leer(v_cuenta);
    v := 'leyó';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '13.1  miembro sin ver_salud lee salud → 42501 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  insert into public.roles (name, permissions) values ('prueba-rls-salud', array['app_crm', 'edit_crm', 'ver_salud', 'edit_salud']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-salud');

  -- 13.2 Con el permiso y aal1
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform public.crm_salud_leer(v_cuenta);
    v_hint := 'leyó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  r := r || E'\n' || case when v_hint = 'salud_mfa' then 'OK      ' else 'FALLA   ' end || '13.2  con ver_salud y aal1 → salud_mfa · ' || coalesce(v_hint, 'null');

  -- 13.3 Con aal2 lee y deja fila en crm_accesos_salud
  select count(*) into v_m from public.crm_accesos_salud where cuenta_id = v_cuenta and operacion = 'leer';
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    v := public.crm_salud_leer(v_cuenta)::text;
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.crm_accesos_salud where cuenta_id = v_cuenta and operacion = 'leer';
  r := r || E'\n' || case when v = '{}' and v_n = v_m + 1 then 'OK      ' else 'FALLA   ' end || '13.3  con aal2 lee y queda el acceso → {} / +1 · ' || v || ' / +' || (v_n - v_m);

  -- 13.4 Guardar sin consentimiento
  set local role authenticated;
  begin
    perform public.crm_salud_guardar(v_cuenta, '{"alergias": ["prueba"]}');
    v_hint := 'guardó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  r := r || E'\n' || case when v_hint = 'salud_sin_consentimiento' then 'OK      ' else 'FALLA   ' end || '13.4  guardar sin consentimiento → salud_sin_consentimiento · ' || coalesce(v_hint, 'null');

  -- 13.5 Con consentimiento guarda cifrado y lee lo mismo (no se muestra el valor)
  set local role authenticated;
  begin
    insert into public.crm_consentimientos (cuenta_id, tipo, otorgado, medio, version_texto)
    values (v_cuenta, 'datos_salud', true, 'digital', 'prueba-rls');
    perform public.crm_salud_guardar(v_cuenta, '{"alergias": ["prueba"]}');
    v := (public.crm_salud_leer(v_cuenta) = '{"alergias": ["prueba"]}'::jsonb)::text;
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = 'true' then 'OK      ' else 'FALLA   ' end || '13.5  con consentimiento guarda y lee lo mismo → true · ' || v;

  -- 13.6 Select directo a crm_salud como authenticated
  set local role authenticated;
  begin
    select count(*) into v_n from public.crm_salud;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '13.6  select directo a crm_salud → 42501 · ' || v;

  -- 13.7 Admin sin ver_salud en sus roles
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.user_roles ur join public.roles ro on ro.name = ur.role
              where ur.user_id = v_admin and 'ver_salud' = any (ro.permissions)) then
    r := r || E'\nOMITIDO 13.7  admin sin ver_salud · la cuenta admin tiene ver_salud en un rol';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      perform public.crm_salud_leer(v_cuenta);
      v := 'leyó';
    exception when others then v := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '13.7  admin sin ver_salud lee salud → 42501 · ' || v;
  end if;

  -- 13.8 Consentimientos: fecha futura, revocación sellada y nadie los borra
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    insert into public.crm_consentimientos (cuenta_id, tipo, otorgado, medio, version_texto, fecha)
    values (v_cuenta, 'tratamiento_datos', true, 'digital', 'prueba-rls', current_date + 30);
    v_hint := 'entró';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  begin
    insert into public.crm_consentimientos (cuenta_id, tipo, otorgado, medio, version_texto)
    values (v_cuenta, 'tratamiento_datos', true, 'digital', 'prueba-rls');
    update public.crm_consentimientos set revocado_en = '2000-01-01' where cuenta_id = v_cuenta and tipo = 'tratamiento_datos';
    select count(*) into v_n from public.crm_consentimientos
     where cuenta_id = v_cuenta and tipo = 'tratamiento_datos' and revocado_por = v_miembro and revocado_en > now() - interval '1 hour';
    v := v_n::text;
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    delete from public.crm_consentimientos where cuenta_id = v_cuenta;
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v_hint = 'crm_consentimiento_fecha' and v = '1 / 42501' then 'OK      ' else 'FALLA   ' end
       || '13.8  fecha futura, revocar sellado y admin borra consentimientos → crm_consentimiento_fecha / 1 / 42501 · '
       || coalesce(v_hint, 'null') || ' / ' || v;

  -- 13.9 El vigente es el último registrado aunque otro tenga fecha mayor
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    insert into public.crm_consentimientos (cuenta_id, tipo, otorgado, medio, version_texto, fecha)
    values (v_cuenta, 'datos_salud', false, 'digital', 'prueba-rls', current_date - 365);
    perform public.crm_salud_guardar(v_cuenta, '{"alergias": ["prueba"]}');
    v_hint := 'guardó';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  r := r || E'\n' || case when v_hint = 'salud_sin_consentimiento' then 'OK      ' else 'FALLA   ' end
       || '13.9  negación registrada después con fecha vieja manda → salud_sin_consentimiento · ' || coalesce(v_hint, 'null');

  -- 13.10 Borrar la cuenta como admin: con salud, luego con consentimientos
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    delete from public.crm_cuentas where id = v_cuenta;
    v := 'borró';
  exception when others then get stacked diagnostics v = pg_exception_hint;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  delete from public.crm_salud where cuenta_id = v_cuenta;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    delete from public.crm_cuentas where id = v_cuenta;
    v := v || ' / borró';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; v := v || ' / ' || v_hint;
  end;
  reset role;
  select count(*) into v_n from public.crm_consentimientos where cuenta_id = v_cuenta;
  r := r || E'\n' || case when v = 'crm_cuenta_con_salud / crm_cuenta_con_consentimientos' and v_n > 0 then 'OK      ' else 'FALLA   ' end
       || '13.10 admin borra persona con salud y luego con consentimientos → crm_cuenta_con_salud / crm_cuenta_con_consentimientos · '
       || v || ' / ' || v_n;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 14) Último administrador: el propio admin, el último y la baja ============
-- Deja a la cuenta admin de prueba como único administrador real (se
-- deshace con todo lo demás) y comprueba que ni sin sesión se le quita.
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.guarda_ultimo_admin()') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 14    último administrador · falta 01b-ultimo-administrador.sql', true);
    return;
  end if;
  if v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 14    último administrador · faltan las cuentas miembro o admin', true);
    return;
  end if;
  if exists (select 1 from public.profiles where id = v_admin and es_servicio) then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 14    último administrador · la cuenta admin de prueba es de servicio y no cuenta', true);
    return;
  end if;

  -- 14.1 El admin se quita su propio admin por la API
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    delete from public.user_roles where user_id = v_admin and role = 'admin';
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  reset role;
  r := r || E'\n' || case when v = 'admin_propio' then 'OK      ' else 'FALLA   ' end || '14.1  admin se quita su propio admin → admin_propio · ' || v;

  -- 14.2 Sin sesión (service role, instalador) se quita admin a quien no es el último
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'admin');
  begin
    delete from public.user_roles where user_id = v_miembro and role = 'admin';
    get diagnostics v_n = row_count;
    v := case when v_n = 1 then 'quitó' else v_n || ' filas' end;
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  r := r || E'\n' || case when v = 'quitó' then 'OK      ' else 'FALLA   ' end || '14.2  sin sesión quita admin a quien no es el último → quitó · ' || v;

  -- La cuenta admin de prueba queda como único administrador real
  begin
    delete from public.user_roles where role = 'admin' and user_id <> v_admin;
    v := 'ok';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  if v <> 'ok' then
    perform set_config('rls.res', current_setting('rls.res') || r || E'\nOMITIDO 14.3-8 no se pudo dejar a la cuenta admin de prueba como la última · ' || v, true);
    return;
  end if;

  -- 14.3 Sin sesión, quitar el admin al último
  begin
    delete from public.user_roles where user_id = v_admin and role = 'admin';
    v := 'quitó';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  r := r || E'\n' || case when v = 'ultimo_admin' then 'OK      ' else 'FALLA   ' end || '14.3  sin sesión quita admin al último → ultimo_admin · ' || v;

  -- 14.4 Sin sesión, cambiar su fila admin por otro rol
  begin
    update public.user_roles set role = 'member' where user_id = v_admin and role = 'admin';
    v := 'cambió';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  r := r || E'\n' || case when v = 'ultimo_admin' then 'OK      ' else 'FALLA   ' end || '14.4  sin sesión cambia la fila admin del último → ultimo_admin · ' || v;

  -- 14.5 Sin sesión, marcar al último como cuenta de servicio
  begin
    update public.profiles set es_servicio = true where id = v_admin;
    v := 'marcó';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  r := r || E'\n' || case when v = 'ultimo_admin' then 'OK      ' else 'FALLA   ' end || '14.5  sin sesión marca es_servicio al último → ultimo_admin · ' || v;

  -- 14.6 Sin sesión, vaciar user_roles
  begin
    truncate public.user_roles;
    v := 'vació';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  r := r || E'\n' || case when v = 'ultimo_admin' then 'OK      ' else 'FALLA   ' end || '14.6  sin sesión vacía user_roles → ultimo_admin · ' || v;

  -- 14.7 Con sesión, borrar el propio perfil (auth.uid() lee el claim
  -- aunque el rol sea postgres, que sí tiene delete sobre profiles)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin
    delete from public.profiles where id = v_admin;
    v := 'borró';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  perform set_config('request.jwt.claims', '', true);
  r := r || E'\n' || case when v = 'borrar_propio' then 'OK      ' else 'FALLA   ' end || '14.7  con sesión borra su propio perfil → borrar_propio · ' || v;

  -- 14.8 Sin sesión, la baja del último en Auth (cae en cascada a user_roles)
  begin
    delete from auth.users where id = v_admin;
    v := 'borró';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  select count(*) into v_n from public.user_roles where user_id = v_admin and role = 'admin';
  r := r || E'\n' || case when v = 'ultimo_admin' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '14.8  sin sesión borra al último en Auth → ultimo_admin / 1 · ' || v || ' / ' || v_n;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 15) CRM: exportar exige exportar_crm y queda en la auditoría ============
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_m int;
  v_j jsonb;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.crm_exportar(text,text,text,text,uuid,text,boolean)') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 15    exportar crm · falta 21c-crm-exportar.sql', true);
    return;
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 15    exportar crm · falta la cuenta miembro', true);
    return;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into public.modulos_instalacion (slug, activo) values ('crm', true)
  on conflict (slug) do update set activo = true;
  insert into public.roles (name, permissions) values ('prueba-rls-crm-lector', array['app_crm']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-crm-lector');

  -- 15.1 Lee el CRM pero no tiene exportar_crm (si un rol real de la
  -- cuenta ya lo da, el caso no es un negativo)
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.has_perm('exportar_crm') then
    r := r || E'\nOMITIDO 15.1  miembro sin exportar_crm · la cuenta miembro ya lo tiene por un rol de la instalación';
  else
    set local role authenticated;
    begin
      perform * from public.crm_exportar();
      v := 'exportó';
    exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
    end;
    reset role;
    r := r || E'\n' || case when v = 'crm_exportar' then 'OK      ' else 'FALLA   ' end || '15.1  miembro con app_crm y sin exportar_crm exporta → crm_exportar · ' || v;
  end if;

  -- 15.2 Con exportar_crm exporta la lista entera en un solo jsonb (sin
  -- la columna total) y la base deja la fila de auditoría con el total
  perform set_config('request.jwt.claims', '', true);
  insert into public.roles (name, permissions) values ('prueba-rls-crm-exportar', array['app_crm', 'exportar_crm']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-crm-exportar');
  insert into public.crm_cuentas (tipo, nombre)
  select 'persona', 'Prueba RLS exportar ' || g from generate_series(1, 3) g;
  select count(*) into v_m from public.audit_log
   where user_id = v_miembro and action = 'crm.exportar' and detail = 'Exportó 3 cuentas';
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    v_j := public.crm_exportar(p_q => 'Prueba RLS exportar');
    v := 'exportó';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) - v_m into v_m from public.audit_log
   where user_id = v_miembro and action = 'crm.exportar' and detail = 'Exportó 3 cuentas';
  v_n := coalesce(jsonb_array_length(v_j -> 'filas'), -1);
  if v = 'exportó' and (v_j ->> 'total' is distinct from '3' or (v_j -> 'filas' -> 0) ? 'total') then
    v := 'filas con total o total distinto';
  end if;
  r := r || E'\n' || case when v = 'exportó' and v_n = 3 and v_m = 1 then 'OK      ' else 'FALLA   ' end || '15.2  miembro con exportar_crm exporta 3 cuentas y deja una fila crm.exportar → exportó / 3 / 1 · ' || v || ' / ' || v_n || ' / ' || v_m;

  -- 15.3 Sin security definer y nada de salud en el código ni en las columnas
  select count(*) into v_n
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.crm_exportar(text,text,text,text,uuid,text,boolean)')
     and (p.prosecdef or p.prosrc ~* 'salud' or pg_catalog.pg_get_function_result(p.oid) ~* 'salud'
          or p.proretset or p.prorettype <> 'jsonb'::regtype);
  r := r || E'\n' || case when v_n = 0 then 'OK      ' else 'FALLA   ' end || '15.3  crm_exportar sin security definer ni salud y devuelve un solo jsonb → 0 · ' || v_n;

  -- 15.4 Anónimo sin EXECUTE
  v := case when has_function_privilege('anon', 'public.crm_exportar(text,text,text,text,uuid,text,boolean)', 'execute') then 'ejecuta' else 'no' end;
  r := r || E'\n' || case when v = 'no' then 'OK      ' else 'FALLA   ' end || '15.4  anon ejecuta crm_exportar → no · ' || v;

  -- 15.5 Con más de 10 000 cuentas se niega sin exportar ni dejar fila de
  -- auditoría, en vez de entregar un archivo cortado
  insert into public.crm_cuentas (tipo, nombre)
  select 'persona', 'Prueba RLS tope ' || g from generate_series(1, 10001) g;
  select count(*) into v_m from public.audit_log where user_id = v_miembro and action = 'crm.exportar';
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    v_j := public.crm_exportar(p_q => 'Prueba RLS tope');
    v := 'exportó';
  exception when others then get stacked diagnostics v = pg_exception_hint; v := coalesce(nullif(v, ''), sqlstate);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) - v_m into v_m from public.audit_log where user_id = v_miembro and action = 'crm.exportar';
  r := r || E'\n' || case when v = 'crm_exportar_tope' and v_m = 0 then 'OK      ' else 'FALLA   ' end || '15.5  exportar 10 001 cuentas → crm_exportar_tope / 0 · ' || v || ' / ' || v_m;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 16) Contrato de tabla y moneda: sellos que el cliente no falsea ============
-- Dominios de 00b-contrato-tabla.sql y, con 21d-crm-contrato.sql, el
-- contrato en cuentas y actividades del CRM: el miembro manda autoría,
-- fechas y creado_via falsos y la base los sella; el historial no anota
-- updated_by ni creado_via.
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_m int;
  v_cuenta uuid;
  v_act uuid;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_otro uuid := gen_random_uuid();
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.contrato_sellar()') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 16    contrato de tabla · falta 00b-contrato-tabla.sql', true);
    return;
  end if;

  -- 16.1 Dominios: moneda en minúscula, importe NaN y vía desconocida
  perform set_config('request.jwt.claims', '', true);
  v := '';
  begin
    perform 'cop'::public.codigo_moneda;
    v := v || 'entró';
  exception when others then v := v || sqlstate;
  end;
  begin
    perform 'NaN'::public.importe;
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    perform 'otra'::public.via_creacion;
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    perform 'COP'::public.codigo_moneda, 1234.5::public.importe, 'importacion'::public.via_creacion;
    v := v || ' / válidos';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '23514 / 23514 / 23514 / válidos' then 'OK      ' else 'FALLA   ' end || '16.1  dominios rechazan cop, NaN y una vía desconocida → 23514 ×3 / válidos · ' || v;

  if to_regclass('public.crm_cuentas') is null
     or not exists (select 1 from pg_catalog.pg_trigger g
                     where g.tgrelid = 'public.crm_cuentas'::regclass and g.tgname = 'zz_contrato_sellar') then
    perform set_config('rls.res', current_setting('rls.res') || r || E'\nOMITIDO 16.2-6 contrato en el crm · falta 21d-crm-contrato.sql', true);
    return;
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || r || E'\nOMITIDO 16.2-6 contrato en el crm · falta la cuenta miembro', true);
    return;
  end if;

  insert into public.modulos_instalacion (slug, activo) values ('crm', true)
  on conflict (slug) do update set activo = true;
  insert into public.roles (name, permissions) values ('prueba-rls-contrato', array['app_crm', 'edit_crm']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-contrato');

  -- 16.2 Alta con autoría, fechas y vía mandadas por el cliente
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into public.crm_cuentas (tipo, nombre, created_by, updated_by, created_at, updated_at, creado_via)
    values ('persona', 'Prueba RLS contrato', v_otro, v_otro, '2000-01-01', '2000-01-01', 'importacion')
    returning id into v_cuenta;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.crm_cuentas
   where id = v_cuenta and created_by = v_miembro and updated_by = v_miembro
     and created_at = now() and updated_at = now() and creado_via = 'importacion';
  r := r || E'\n' || case when v = 'entró' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '16.2  miembro crea una cuenta con autoría y fechas falsas → entró / 1 sellada · ' || v || ' / ' || v_n;

  if v_cuenta is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('rls.res', current_setting('rls.res') || r || E'\nOMITIDO 16.3-6 contrato en el crm · no se creó la cuenta de prueba', true);
    return;
  end if;

  -- 16.3 Cambio que intenta reescribir autoría, fecha de alta y vía
  set local role authenticated;
  begin
    update public.crm_cuentas
       set nombre = 'Prueba RLS contrato 2', created_by = v_otro, created_at = '2000-01-01',
           creado_via = 'api', updated_by = v_otro
     where id = v_cuenta;
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.crm_cuentas
   where id = v_cuenta and created_by = v_miembro and updated_by = v_miembro
     and created_at = now() and creado_via = 'importacion';
  r := r || E'\n' || case when v = '1 filas' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '16.3  miembro cambia la cuenta y reescribe autoría y vía → 1 filas / 1 sin cambio · ' || v || ' / ' || v_n;

  -- 16.4 Sin sesión (service role, instalador): updated_by queda null y
  -- created_by se conserva
  perform set_config('request.jwt.claims', '', true);
  update public.crm_cuentas set nombre = 'Prueba RLS contrato 3' where id = v_cuenta;
  select count(*) into v_n from public.crm_cuentas where id = v_cuenta and updated_by is null and created_by = v_miembro;
  r := r || E'\n' || case when v_n = 1 then 'OK      ' else 'FALLA   ' end || '16.4  sin sesión cambia la cuenta → updated_by null y created_by intacto · ' || v_n;

  -- 16.5 El historial no anota updated_by ni creado_via: los dos cambios de
  -- nombre quedan con campos = {nombre}
  select count(*) into v_n from public.crm_cambios
   where entidad = 'cuenta' and entidad_id = v_cuenta
     and (campos && array['updated_by', 'creado_via', 'updated_at']
          or coalesce(despues, '{}') ?| array['updated_by', 'creado_via']
          or coalesce(antes, '{}') ?| array['updated_by', 'creado_via']);
  select count(*) into v_m from public.crm_cambios
   where entidad = 'cuenta' and entidad_id = v_cuenta and operacion = 'update' and campos = array['nombre'];
  r := r || E'\n' || case when v_n = 0 and v_m = 2 then 'OK      ' else 'FALLA   ' end || '16.5  historial sin updated_by ni creado_via; dos cambios de nombre → 0 / 2 · ' || v_n || ' / ' || v_m;

  -- 16.6 Actividad: autor_id y updated_by sellados, vía manual por defecto
  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into public.crm_actividades (tipo, cuenta_id, asunto, autor_id, updated_by)
    values ('nota', v_cuenta, 'Prueba RLS contrato', v_otro, v_otro)
    returning id into v_act;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.crm_actividades
   where id = v_act and autor_id = v_miembro and updated_by = v_miembro and creado_via = 'manual';
  r := r || E'\n' || case when v = 'entró' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '16.6  miembro crea una actividad con autor falso → entró / 1 sellada · ' || v || ' / ' || v_n;

  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 17) Numeración: series del servidor y contador cerrado a la API ============
-- 09b-numeracion.sql: sin huecos, una transacción deshecha no deja hueco y
-- el tope y la vigencia fallan cerrado; con huecos, el número entregado no
-- vuelve; una serie sin huecos no se numera suelta por la API. Un miembro
-- sin gestionar_series no ve ni crea series ni ejecuta series_siguiente;
-- un administrador crea una serie pero no escribe su contador (PP-DEC-25).
-- Con reinicio, un primer número del periodo nuevo deshecho no repite
-- números del anterior; sin fecha, cuenta el día de la instalación y no el
-- de la sesión.
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_hoy date;
  v_zona text;
  v_tz text;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.series_siguiente(text,date)') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 17    numeración · falta 09b-numeracion.sql', true);
    return;
  end if;

  -- Series de prueba, sin sesión (como el servidor)
  perform set_config('request.jwt.claims', '', true);
  insert into public.series (clave, prefijo, relleno, tope, modo) values ('prueba_rls_sin', 'F-', 4, 2, 'sin_huecos');
  insert into public.series (clave, prefijo, relleno, modo) values ('prueba_rls_con', 'C-', 3, 'con_huecos');

  -- 17.1 Sin huecos: el número de una transacción deshecha se vuelve a dar
  v := public.series_siguiente('prueba_rls_sin');
  begin
    perform public.series_siguiente('prueba_rls_sin');
    raise exception using errcode = 'P0004';
  exception when sqlstate 'P0004' then
    null;
  end;
  v := v || ' / ' || public.series_siguiente('prueba_rls_sin');
  r := r || E'\n' || case when v = 'F-0001 / F-0002' then 'OK      ' else 'FALLA   ' end || '17.1  sin huecos: uno, otro deshecho, otro → F-0001 / F-0002 · ' || v;

  -- 17.2 Tope agotado y fuera de vigencia: no entrega número
  begin
    perform public.series_siguiente('prueba_rls_sin');
    v := 'entregó';
  exception when others then v := sqlstate;
  end;
  update public.series set tope = null, vigente_desde = current_date + 1 where clave = 'prueba_rls_sin';
  begin
    perform public.series_siguiente('prueba_rls_sin');
    v := v || ' / entregó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '54000 / 22023' then 'OK      ' else 'FALLA   ' end || '17.2  sin huecos con tope agotado y fuera de vigencia → 54000 / 22023 · ' || v;

  -- 17.3 Con huecos: el número de una transacción deshecha no vuelve
  v := public.series_siguiente('prueba_rls_con');
  begin
    perform public.series_siguiente('prueba_rls_con');
    raise exception using errcode = 'P0004';
  exception when sqlstate 'P0004' then
    null;
  end;
  v := v || ' / ' || public.series_siguiente('prueba_rls_con');
  r := r || E'\n' || case when v = 'C-001 / C-003' then 'OK      ' else 'FALLA   ' end || '17.3  con huecos: uno, otro deshecho, otro → C-001 / C-003 · ' || v;

  -- 17.4 Una serie sin huecos pedida directa por la API se niega, también
  -- con un prefijo del proxy delante de la ruta
  perform set_config('request.path', '/rpc/series_siguiente', true);
  begin
    perform public.series_siguiente('prueba_rls_sin');
    v := 'entregó';
  exception when others then v := sqlstate;
  end;
  perform set_config('request.path', '/rest/v1/rpc/series_siguiente', true);
  begin
    perform public.series_siguiente('prueba_rls_sin');
    v := v || ' / entregó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  perform set_config('request.path', '', true);
  r := r || E'\n' || case when v = '42501 / 42501' then 'OK      ' else 'FALLA   ' end || '17.4  sin huecos por /rpc/ y /rest/v1/rpc/series_siguiente → 42501 / 42501 · ' || v;

  if v_miembro is null then
    r := r || E'\nOMITIDO 17.5  numeración del miembro · falta la cuenta miembro';
  else
    -- 17.5 Miembro sin gestionar_series: no ve, no crea, no numera
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.series;
    begin
      insert into public.series (clave, modo) values ('prueba_rls_miembro', 'con_huecos');
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    begin
      perform public.series_siguiente('prueba_rls_con');
      v := v || ' / entregó';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v_n = 0 and v = '42501 / 42501' then 'OK      ' else 'FALLA   ' end || '17.5  miembro ve, crea y numera series → 0 / 42501 / 42501 · ' || v_n || ' / ' || v;
  end if;

  if v_admin is null then
    r := r || E'\nOMITIDO 17.6  numeración del administrador · falta la cuenta admin';
  else
    -- 17.6 Administrador: crea una serie, no escribe el contador ni numera
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      insert into public.series (clave, prefijo, modo) values ('prueba_rls_admin', 'A-', 'sin_huecos');
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    begin
      update public.series set actual = 99 where clave = 'prueba_rls_admin';
      v := v || ' / cambió';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    begin
      perform public.series_siguiente('prueba_rls_admin');
      v := v || ' / entregó';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = 'entró / 42501 / 42501' then 'OK      ' else 'FALLA   ' end || '17.6  admin crea serie, escribe actual y numera → entró / 42501 / 42501 · ' || v;
  end if;

  -- 17.7 Con reinicio anual: el primer número de 2027 deshecho no reinicia
  -- 2026; una fecha de 2026 sigue su cuenta y 2027 empieza en 001
  perform set_config('request.jwt.claims', '', true);
  insert into public.series (clave, prefijo, relleno, reinicio, modo) values ('prueba_rls_anual', 'C-', 3, 'anual', 'con_huecos');
  v := public.series_siguiente('prueba_rls_anual', date '2026-12-30');
  v := v || ' / ' || public.series_siguiente('prueba_rls_anual', date '2026-12-31');
  begin
    perform public.series_siguiente('prueba_rls_anual', date '2027-01-02');
    raise exception using errcode = 'P0004';
  exception when sqlstate 'P0004' then
    null;
  end;
  v := v || ' / ' || public.series_siguiente('prueba_rls_anual', date '2026-12-31');
  v := v || ' / ' || public.series_siguiente('prueba_rls_anual', date '2027-01-02');
  r := r || E'\n' || case when v = 'C-2026-001 / C-2026-002 / C-2026-003 / C-2027-001' then 'OK      ' else 'FALLA   ' end || '17.7  anual: 2026, 2026, 2027 deshecho, 2026, 2027 → C-2026-001 / 002 / 003 / C-2027-001 · ' || v;

  -- 17.8 Sin fecha cuenta el día de la instalación: con la sesión en una
  -- zona en la que ya (o aún) es otro día, una serie vigente solo hoy
  -- entrega número
  v_hoy := (now() at time zone public.zona_instalacion())::date;
  v_zona := case when (now() at time zone 'Pacific/Kiritimati')::date <> v_hoy then 'Pacific/Kiritimati' else 'Etc/GMT+12' end;
  insert into public.series (clave, prefijo, relleno, vigente_desde, vigente_hasta, modo) values ('prueba_rls_hoy', 'H-', 3, v_hoy, v_hoy, 'sin_huecos');
  v_tz := current_setting('timezone');
  perform set_config('timezone', v_zona, true);
  begin
    v := public.series_siguiente('prueba_rls_hoy');
  exception when others then v := sqlstate;
  end;
  perform set_config('timezone', v_tz, true);
  r := r || E'\n' || case when v = 'H-001' then 'OK      ' else 'FALLA   ' end || '17.8  sin fecha, sesión en ' || v_zona || ', serie vigente solo hoy → H-001 · ' || v;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 18) Máquina de estados: transición, permiso y conflicto ============
-- 09c-estados.sql sobre una entidad de ejemplo con una tabla temporal (se
-- deshace con todo): nace en su estado inicial; una transición del
-- catálogo con su permiso cambia el estado y queda en la auditoría; una
-- fuera del catálogo, sin permiso o con el estado esperado ya cambiado
-- (otro llegó antes) se niega; un update directo del estado también; solo
-- se borra en borrador, y el administrador no tiene excepción (PP-DEC-26).
do $$
declare
  r text := '';
  v text;
  v_n int;
  v_m int;
  v_id uuid;
  v_otro uuid;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regprocedure('public.aplicar_transicion(text,uuid,text,text)') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 18    máquina de estados · falta 09c-estados.sql', true);
    return;
  end if;
  if v_miembro is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 18    máquina de estados · falta la cuenta miembro', true);
    return;
  end if;

  -- Entidad de ejemplo, como postgres
  perform set_config('request.jwt.claims', '', true);
  create temp table prueba_rls_estados (id uuid primary key default gen_random_uuid(), estado text not null default 'borrador');
  grant select, insert, update, delete on prueba_rls_estados to authenticated;
  perform public.estados_registrar('prueba_rls', 'prueba_rls_estados'::regclass);
  insert into public.estados (entidad, clave, nombre, categoria, inicial, orden) values
    ('prueba_rls', 'borrador', 'Borrador', 'borrador', true, 1),
    ('prueba_rls', 'aprobado', 'Aprobado', 'aprobado', false, 2),
    ('prueba_rls', 'anulado', 'Anulado', 'anulado', false, 3);
  insert into public.estados_transiciones (entidad, desde, hacia, permiso) values
    ('prueba_rls', 'borrador', 'aprobado', 'prueba_rls_aprobar'),
    ('prueba_rls', 'borrador', 'anulado', 'prueba_rls_anular');
  insert into public.roles (name, permissions) values ('prueba-rls-estados', array['prueba_rls_aprobar']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-estados');

  perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  -- 18.1 Alta fuera del estado inicial se niega; en borrador entra
  begin
    insert into prueba_rls_estados (estado) values ('aprobado');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    insert into prueba_rls_estados (estado) values ('borrador') returning id into v_id;
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  r := r || E'\n' || case when v = '23514 / entró' then 'OK      ' else 'FALLA   ' end || '18.1  alta en aprobado y en borrador → 23514 / entró · ' || v;

  -- 18.2 Transición válida con su permiso: cambia y deja una fila en la auditoría
  begin
    perform public.aplicar_transicion('prueba_rls', v_id, 'borrador', 'aprobado');
    v := 'aplicó';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from prueba_rls_estados where id = v_id and estado = 'aprobado';
  select count(*) into v_m from public.audit_log
   where action = 'estados.transicion' and entity = 'prueba_rls' and entity_id = v_id::text and user_id = v_miembro;
  r := r || E'\n' || case when v = 'aplicó' and v_n = 1 and v_m = 1 then 'OK      ' else 'FALLA   ' end || '18.2  miembro aplica borrador → aprobado → aplicó / 1 aprobado / 1 en auditoría · ' || v || ' / ' || v_n || ' / ' || v_m;

  set local role authenticated;
  -- 18.3 Transición que no está en el catálogo
  begin
    perform public.aplicar_transicion('prueba_rls', v_id, 'aprobado', 'borrador');
    v := 'aplicó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '22023' then 'OK      ' else 'FALLA   ' end || '18.3  aprobado → borrador, fuera del catálogo → 22023 · ' || v;

  -- 18.4 Permiso faltante: borrador → anulado exige prueba_rls_anular
  insert into prueba_rls_estados (estado) values ('borrador') returning id into v_otro;
  begin
    perform public.aplicar_transicion('prueba_rls', v_otro, 'borrador', 'anulado');
    v := 'aplicó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '18.4  borrador → anulado sin su permiso → 42501 · ' || v;

  -- 18.5 Conflicto: se espera borrador, pero otro ya lo pasó a aprobado
  begin
    perform public.aplicar_transicion('prueba_rls', v_id, 'borrador', 'aprobado');
    v := 'aplicó';
  exception when others then v := sqlstate;
  end;
  r := r || E'\n' || case when v = '40001' then 'OK      ' else 'FALLA   ' end || '18.5  borrador → aprobado sobre uno ya aprobado → 40001 · ' || v;

  -- 18.6 Update directo del estado
  begin
    update prueba_rls_estados set estado = 'anulado' where id = v_otro;
    v := 'cambió';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501' then 'OK      ' else 'FALLA   ' end || '18.6  miembro cambia el estado con un update directo → 42501 · ' || v;

  if v_admin is null then
    r := r || E'\nOMITIDO 18.7  administrador sin excepción · falta la cuenta admin';
  else
    -- 18.7 Administrador: ni fuera del catálogo ni con un update directo
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      perform public.aplicar_transicion('prueba_rls', v_id, 'aprobado', 'anulado');
      v := 'aplicó';
    exception when others then v := sqlstate;
    end;
    begin
      update prueba_rls_estados set estado = 'borrador' where id = v_id;
      v := v || ' / cambió';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '22023 / 42501' then 'OK      ' else 'FALLA   ' end || '18.7  admin: aprobado → anulado y update directo → 22023 / 42501 · ' || v;
  end if;

  if v_admin is null then
    r := r || E'\nOMITIDO 18.8  borrado fuera de borrador · falta la cuenta admin';
  else
    -- 18.8 Borrar: un aprobado no, ni el miembro ni el administrador; un
    -- borrador sí
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    begin
      delete from prueba_rls_estados where id = v_id;
      v := 'borró';
    exception when others then v := sqlstate;
    end;
    begin
      delete from prueba_rls_estados where id = v_otro;
      get diagnostics v_n = row_count;
      v := v || ' / borró ' || v_n;
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    begin
      delete from prueba_rls_estados where id = v_id;
      v := v || ' / borró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '42501 / borró 1 / 42501' then 'OK      ' else 'FALLA   ' end || '18.8  miembro borra aprobado y borrador, admin borra aprobado → 42501 / borró 1 / 42501 · ' || v;
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ 19) Productos: catálogo, código, unidades, impuestos, historial e importación ============
-- 22-catalogo.sql con el módulo activo en la transacción (se deshace),
-- roles de prueba app_productos y edit_productos para el miembro, unidades,
-- una clase y una tabla de líneas propias de la prueba (en public: una
-- temporal no admite llaves hacia una tabla permanente). Los códigos y
-- nombres de prueba llevan PRUEBA-RLS para no chocar con el catálogo de la
-- instalación.
do $$
declare
  r text := '';
  v text;
  w text;
  v_n int;
  v_m int;
  v_k int;
  v_j jsonb;
  v_filas jsonb;
  v_miembro uuid := nullif(current_setting('rls.miembro'), '')::uuid;
  v_admin uuid := nullif(current_setting('rls.admin'), '')::uuid;
  v_jm text := json_build_object('sub', v_miembro, 'role', 'authenticated', 'aal', 'aal1')::text;
  v_ja text := json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text;
  v_otro uuid := gen_random_uuid();
  v_moneda text;
  v_otra_moneda text;
  v_prefijo text;
  v_relleno int;
  v_l1 bigint;
  v_l2 bigint;
  v_cod text;
  v_cod2 text;
  v_ocupado text;
  v_serie text;
  v_tope text;
  v_t0 timestamptz;
  v_ms int;
  v_p1 uuid;
  v_p5 uuid;
  v_p6 uuid;
  v_p7 uuid;
  v_p8a uuid;
  v_p8b uuid;
  v_p9 uuid;
  v_p10 uuid;
  v_linea uuid;
  v_cat_a uuid;
  v_cat_b uuid;
  v_cat_x uuid;
  v_cat_x1 uuid;
  v_cat_x2 uuid;
  v_cat_arch uuid;
  v_arch uuid;
  v_libre uuid;
  v_pb uuid;
  v_pc uuid;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;
  if to_regclass('public.productos') is null or to_regprocedure('public.productos_importar(jsonb,boolean)') is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 19    productos · falta 22-catalogo.sql', true);
    return;
  end if;
  if v_miembro is null or v_admin is null then
    perform set_config('rls.res', current_setting('rls.res') || E'\nOMITIDO 19    productos · faltan las cuentas miembro o admin', true);
    return;
  end if;

  -- Datos de prueba, como postgres
  perform set_config('request.jwt.claims', '', true);
  insert into public.modulos_instalacion (slug, activo) values ('productos', true)
  on conflict (slug) do update set activo = true;
  insert into public.roles (name, permissions) values ('prueba-rls-prod-ver', array['app_productos']);
  insert into public.roles (name, permissions) values ('prueba-rls-prod-edit', array['app_productos', 'edit_productos']);
  insert into public.roles (name, permissions) values ('prueba-rls-prod-inv', array['app_inventario']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-ver');
  insert into public.productos_unidades (clave, nombre, decimales) values
    ('prueba_rls_caja', 'Prueba RLS caja', 0), ('prueba_rls_otra', 'Prueba RLS otra', 0), ('prueba_rls_fina', 'Prueba RLS fina', 3);
  insert into public.productos_impuestos (clave, nombre, tipo, tratamiento, porcentaje) values ('prueba_rls_iva', 'Prueba RLS IVA', 'iva', 'gravado', 7);
  select i.moneda_base into v_moneda from public.instalacion i where i.id = 1;
  v_otra_moneda := case when v_moneda = 'USD' then 'EUR' else 'USD' end;
  create table public.prueba_rls_lineas (id uuid primary key default gen_random_uuid());
  alter table public.prueba_rls_lineas disable row level security;
  perform public.productos_aplicar_linea('public.prueba_rls_lineas', 'inventario', true);
  grant select, insert, update on public.prueba_rls_lineas to authenticated;

  -- 19.1 Con app_productos lee y no crea (si un rol real de la cuenta ya da
  -- edit_productos, el caso no es un negativo)
  perform set_config('request.jwt.claims', v_jm, true);
  if public.has_perm('edit_productos') then
    r := r || E'\nOMITIDO 19.1  miembro sin edit_productos · la cuenta miembro ya lo tiene por un rol de la instalación';
  else
    set local role authenticated;
    begin
      select count(*) into v_n from public.productos;
      v := 'lee';
    exception when others then v := sqlstate;
    end;
    begin
      insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-1', 'Prueba RLS lectura');
      v := v || ' / entró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = 'lee / 42501' then 'OK      ' else 'FALLA   ' end || '19.1  miembro con app_productos lee y crea → lee / 42501 · ' || v;
  end if;

  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');
  perform set_config('request.jwt.claims', v_jm, true);

  -- 19.2 Código « Prueba-RLS-ab 12 » y autoría falsa: normalizado y sellado
  set local role authenticated;
  begin
    insert into public.productos (codigo, nombre, created_by, updated_by, creado_via)
    values (' Prueba-RLS-ab 12 ', 'Prueba RLS producto', v_otro, v_otro, 'manual') returning id into v_p1;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.productos
   where id = v_p1 and codigo = 'PRUEBA-RLS-AB12' and created_by = v_miembro and updated_by = v_miembro and creado_via = 'manual';
  r := r || E'\n' || case when v = 'entró' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '19.2  miembro con edit_productos crea con código sin normalizar y autoría falsa → entró / 1 normalizado y sellado · ' || v || ' / ' || v_n;

  -- 19.3 Otro alta con el mismo código escrito distinto
  set local role authenticated;
  begin
    insert into public.productos (codigo, nombre) values ('prueba-rls-AB12', 'Prueba RLS repetido');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '23505' then 'OK      ' else 'FALLA   ' end || '19.3  alta con el mismo código normalizado → 23505 · ' || v;

  -- 19.4 Alta sin código: el de la serie; con el siguiente número ya usado
  -- como código manual, el siguiente libre
  perform set_config('request.jwt.claims', '', true);
  select s.prefijo, s.relleno into v_prefijo, v_relleno from public.series s where s.clave = 'producto';
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    insert into public.productos (nombre) values ('Prueba RLS automático') returning codigo into v_cod;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select last_value into v_l1 from public.serie_producto;
  v := v || case when v_cod = upper(regexp_replace(v_prefijo || lpad(v_l1::text, greatest(v_relleno, char_length(v_l1::text)), '0'), '[[:space:]]', '', 'g'))
                 then ' serie' else ' otro' end;
  v_ocupado := upper(regexp_replace(v_prefijo || lpad((v_l1 + 1)::text, greatest(v_relleno, char_length((v_l1 + 1)::text)), '0'), '[[:space:]]', '', 'g'));
  insert into public.productos (codigo, nombre) values (v_ocupado, 'Prueba RLS ocupa el siguiente') on conflict do nothing;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    insert into public.productos (nombre) values ('Prueba RLS automático 2') returning codigo into v_cod2;
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select last_value into v_l2 from public.serie_producto;
  v := v || case when v_l2 > v_l1 + 1 and v_cod2 is distinct from v_ocupado
                   and v_cod2 = upper(regexp_replace(v_prefijo || lpad(v_l2::text, greatest(v_relleno, char_length(v_l2::text)), '0'), '[[:space:]]', '', 'g'))
                 then ' saltó' else ' no saltó' end;
  r := r || E'\n' || case when v = 'entró serie / entró saltó' then 'OK      ' else 'FALLA   ' end || '19.4  alta sin código y alta con el siguiente número ocupado → entró serie / entró saltó · ' || v;

  -- 19.5 Sin impuesto y con precio sin moneda: la predeterminada y la base;
  -- luego impuesto nulo en un cambio
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    insert into public.productos (codigo, nombre, precio_lista) values ('PRUEBA-RLS-5', 'Prueba RLS precio', 1000) returning id into v_p5;
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    update public.productos set impuesto = null where id = v_p5;
    v := v || ' / cambió';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  select count(*) into v_n from public.productos p
   where p.id = v_p5 and p.precio_lista_moneda = v_moneda
     and p.impuesto = (select i.clave from public.productos_impuestos i where i.predeterminado and i.archivado_en is null);
  r := r || E'\n' || case when v = 'entró / 23502' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '19.5  alta sin impuesto ni moneda y cambio con impuesto nulo → entró / 23502 / 1 con predeterminada y moneda base · ' || v || ' / ' || v_n;

  -- 19.6 Precio negativo, otra moneda, moneda sin precio; un producto con
  -- precio en una moneda que dejó de ser la base se sigue renombrando
  set local role authenticated;
  begin
    insert into public.productos (codigo, nombre, precio_lista) values ('PRUEBA-RLS-6A', 'Prueba RLS negativo', -1);
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.productos (codigo, nombre, precio_lista, precio_lista_moneda) values ('PRUEBA-RLS-6B', 'Prueba RLS otra moneda', 10, v_otra_moneda);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    insert into public.productos (codigo, nombre, precio_lista_moneda) values ('PRUEBA-RLS-6C', 'Prueba RLS moneda sin precio', v_moneda);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.productos (codigo, nombre, precio_lista) values ('PRUEBA-RLS-6D', 'Prueba RLS base cambiada', 10) returning id into v_p6;
  update public.instalacion set moneda_base = v_otra_moneda where id = 1;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    update public.productos set nombre = 'Prueba RLS base cambiada 2' where id = v_p6;
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  -- Cambiar solo el precio lo deja en la moneda base nueva
  begin
    update public.productos set precio_lista = 20 where id = v_p6;
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || sqlstate || ' ' || w;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.productos p where p.id = v_p6 and p.precio_lista = 20 and p.precio_lista_moneda = v_otra_moneda;
  v := v || ' / ' || v_n;
  update public.instalacion set moneda_base = v_moneda where id = 1;
  r := r || E'\n' || case when v = '23514 / 23514 / 23514 / 1 filas / 1 filas / 1' then 'OK      ' else 'FALLA   ' end || '19.6  precio negativo, otra moneda, moneda sin precio, renombrar y cambiar el precio con la base cambiada → 23514 ×3 / 1 filas / 1 filas / 1 en la base nueva · ' || v;

  -- 19.7 Conversiones: factor 0, la unidad base, factor inexacto y 0.001
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-7', 'Prueba RLS conversiones') returning id into v_p7;
  begin
    insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p7, 'prueba_rls_caja', 0);
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p7, 'und', 2);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p7, 'prueba_rls_otra', 0.083333);
    v := v || ' / entró';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || sqlstate || ' ' || w;
  end;
  begin
    insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p7, 'prueba_rls_fina', 0.001);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '23514 / 23514 / 23514 productos_factor_inexacto / entró' then 'OK      ' else 'FALLA   ' end || '19.7  conversión con factor 0, a la base, 0.083333 y 0.001 → 23514 / 23514 / 23514 productos_factor_inexacto / entró · ' || v;

  -- 19.8 Cambiar la unidad base: con conversiones, con precio, con una línea
  -- y sin nada de eso
  set local role authenticated;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-8A', 'Prueba RLS en uso') returning id into v_p8a;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-8B', 'Prueba RLS libre') returning id into v_p8b;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.prueba_rls_lineas (producto_id, cantidad) values (v_p8a, 1);
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  v := '';
  foreach w in array array[v_p7::text, v_p5::text, v_p8a::text] loop
    begin
      update public.productos set unidad_base = 'prueba_rls_caja' where id = w::uuid;
      v := v || 'cambió / ';
    exception when others then get stacked diagnostics v_cod = pg_exception_hint; v := v || sqlstate || ' ' || v_cod || ' / ';
    end;
  end loop;
  begin
    update public.productos set unidad_base = 'prueba_rls_caja' where id = v_p8b;
    get diagnostics v_n = row_count;
    v := v || v_n || ' filas';
  exception when others then v := v || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '23514 productos_unidad_con_conversiones / 23514 productos_unidad_con_precio / 23514 productos_unidad_en_uso / 1 filas' then 'OK      ' else 'FALLA   ' end || '19.8  cambiar la unidad base con conversiones, con precio, con una línea y libre → 23514 ×3 / 1 filas · ' || v;

  -- 19.9 productos_factor; una línea con factor y nombre falsos guarda los
  -- del catálogo, y corregir luego el factor del catálogo no la cambia
  set local role authenticated;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-9', 'Prueba RLS factor') returning id into v_p9;
  insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p9, 'prueba_rls_caja', 12);
  begin
    v := trim_scale(public.productos_factor(v_p9, 'und'))::text || ' / ' || trim_scale(public.productos_factor(v_p9, 'prueba_rls_caja'))::text;
  exception when others then v := sqlstate;
  end;
  begin
    perform public.productos_factor(v_p9, 'prueba_rls_otra');
    v := v || ' / dio factor';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.prueba_rls_lineas (producto_id, producto_codigo, producto_nombre, unidad, factor, cantidad)
  values (v_p9, 'FALSO', 'Nombre falso', 'prueba_rls_caja', 99, 2) returning id into v_linea;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  update public.productos_conversiones set factor = 10 where producto_id = v_p9 and unidad = 'prueba_rls_caja';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n
    from public.prueba_rls_lineas l
    join public.productos p on p.id = l.producto_id
    join public.productos_impuestos i on i.clave = p.impuesto
   where l.id = v_linea and l.factor = 12 and l.cantidad_base = 24 and l.producto_nombre = 'Prueba RLS factor'
     and l.producto_codigo = 'PRUEBA-RLS-9' and l.impuesto = p.impuesto and l.porcentaje_impuesto = i.porcentaje;
  r := r || E'\n' || case when v = '1 / 12 / 22023' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '19.9  factor de la base, de caja y sin conversión; línea con copias del catálogo que no cambian → 1 / 12 / 22023 / 1 · ' || v || ' / ' || v_n;

  -- 19.10 Borrar: el miembro no; el administrador sí, con historial del
  -- producto y de su conversión y una fila en la auditoría
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-10', 'Prueba RLS borrar') returning id into v_p10;
  insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p10, 'prueba_rls_caja', 6);
  begin
    delete from public.productos where id = v_p10;
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', v_ja, true);
  set local role authenticated;
  begin
    delete from public.productos where id = v_p10;
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) filter (where c.entidad = 'producto' and c.antes ? 'codigo' and c.autor_id = v_admin),
         count(*) filter (where c.entidad = 'conversion' and c.antes ->> 'unidad' = 'prueba_rls_caja')
    into v_n, v_m
    from public.productos_cambios c where c.entidad_id = v_p10::text and c.operacion = 'delete';
  select count(*) into v_k from public.audit_log a where a.action = 'productos.delete' and a.entity_id = v_p10::text;
  v := v || ' / ' || v_n || ' / ' || v_m || ' / ' || v_k;
  r := r || E'\n' || case when v = '0 filas / 1 filas / 1 / 1 / 1' then 'OK      ' else 'FALLA   ' end || '19.10 miembro y admin borran un producto; historial del producto y su conversión y auditoría → 0 filas / 1 filas / 1 / 1 / 1 · ' || v;

  -- 19.11 Unidades: la clave por la API y sin sesión, una en uso, und y las
  -- columnas que la API no escribe
  perform set_config('request.jwt.claims', v_ja, true);
  set local role authenticated;
  begin
    update public.productos_unidades set clave = 'prueba_rls_nueva' where clave = 'prueba_rls_otra';
    v := 'cambió';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.productos_unidades set clave = 'prueba_rls_nueva' where clave = 'prueba_rls_otra';
    v := v || ' / cambió';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  perform set_config('request.jwt.claims', v_ja, true);
  set local role authenticated;
  begin
    delete from public.productos_unidades where clave = 'prueba_rls_caja';
    v := v || ' / borró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    delete from public.productos_unidades where clave = 'und';
    v := v || ' / borró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    update public.productos_unidades set sistema = false where clave = 'und';
    v := v || ' / cambió';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    insert into public.productos_unidades (clave, nombre, sistema) values ('prueba_rls_sis', 'Prueba RLS sistema', true);
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    update public.productos_unidades set codigo_dian = 'ZZ' where clave = 'prueba_rls_fina';
    v := v || ' / cambió';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501 / 23514 / 23503 / 23514 / 42501 / 42501 / 42501' then 'OK      ' else 'FALLA   ' end || '19.11 clave por la API y sin sesión, unidad en uso, und, sistema y codigo_dian → 42501 / 23514 / 23503 / 23514 / 42501 ×3 · ' || v;

  -- 19.12 Clases de impuesto: el miembro no crea; una segunda predeterminada
  -- a mano choca; desmarcar la única falla al confirmar;
  -- productos_impuesto_predeterminar deja una sola; el tratamiento no cambia
  set local role authenticated;
  begin
    insert into public.productos_impuestos (clave, nombre, tipo, tratamiento, porcentaje) values ('prueba_rls_miembro', 'Prueba RLS miembro', 'iva', 'gravado', 1);
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', v_ja, true);
  set local role authenticated;
  begin
    update public.productos_impuestos set predeterminado = true where clave = 'prueba_rls_iva';
    v := v || ' / cambió';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    update public.productos_impuestos set predeterminado = false where predeterminado and archivado_en is null;
    set constraints public.productos_impuestos_predeterminado immediate;
    v := v || ' / confirmó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  set constraints public.productos_impuestos_predeterminado deferred;
  begin
    perform public.productos_impuesto_predeterminar('prueba_rls_iva');
    set constraints public.productos_impuestos_predeterminado immediate;
    select count(*) into v_n from public.productos_impuestos i where i.predeterminado and i.archivado_en is null and i.clave = 'prueba_rls_iva';
    select count(*) into v_m from public.productos_impuestos i where i.predeterminado and i.archivado_en is null;
    v := v || ' / ' || v_n || ' de ' || v_m;
  exception when others then v := v || ' / ' || sqlstate;
  end;
  set constraints public.productos_impuestos_predeterminado deferred;
  begin
    update public.productos_impuestos set tratamiento = 'exento', porcentaje = 0 where clave = 'prueba_rls_iva';
    v := v || ' / cambió';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || sqlstate || ' ' || w;
  end;
  reset role;
  r := r || E'\n' || case when v = '42501 / 23505 / 23514 / 1 de 1 / 23514 productos_clase_inmutable' then 'OK      ' else 'FALLA   ' end || '19.12 miembro crea clase, segunda predeterminada, sin predeterminada, predeterminar y cambio de tratamiento → 42501 / 23505 / 23514 / 1 de 1 / 23514 productos_clase_inmutable · ' || v;

  -- 19.13 Categorías: ciclo, archivar con hija activa y un subárbol de tres
  -- niveles bajo una de nivel 2
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  insert into public.productos_categorias (nombre) values ('Prueba RLS A') returning id into v_cat_a;
  insert into public.productos_categorias (nombre, padre_id) values ('Prueba RLS B', v_cat_a) returning id into v_cat_b;
  insert into public.productos_categorias (nombre) values ('Prueba RLS X') returning id into v_cat_x;
  insert into public.productos_categorias (nombre, padre_id) values ('Prueba RLS X1', v_cat_x) returning id into v_cat_x1;
  insert into public.productos_categorias (nombre, padre_id) values ('Prueba RLS X2', v_cat_x1) returning id into v_cat_x2;
  v := '';
  begin
    update public.productos_categorias set padre_id = v_cat_b where id = v_cat_a;
    v := v || 'cambió';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || sqlstate || ' ' || w;
  end;
  begin
    update public.productos_categorias set archivado_en = now() where id = v_cat_a;
    v := v || ' / cambió';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || sqlstate || ' ' || w;
  end;
  begin
    update public.productos_categorias set padre_id = v_cat_b where id = v_cat_x;
    v := v || ' / cambió';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || sqlstate || ' ' || w;
  end;
  reset role;
  r := r || E'\n' || case when v = '23514 productos_categoria_ciclo / 23514 productos_categoria_con_hijas / 23514 productos_categoria_profundidad' then 'OK      ' else 'FALLA   ' end || '19.13 categoría en ciclo, archivar con hija activa y mover tres niveles bajo el nivel 2 → 23514 ciclo / con_hijas / profundidad · ' || v;

  -- 19.14 Historial: precio sin updated_by ni creado_via, nombre de una
  -- unidad con su clave, y el miembro no escribe el historial
  set local role authenticated;
  update public.productos set precio_lista = 1200 where id = v_p5;
  update public.productos_unidades set nombre = 'Prueba RLS caja grande' where clave = 'prueba_rls_caja';
  begin
    insert into public.productos_cambios (entidad, entidad_id, operacion) values ('producto', v_p5::text, 'delete');
    v := 'entró';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.productos_cambios c
   where c.entidad = 'producto' and c.entidad_id = v_p5::text and c.operacion = 'update' and c.campos = array['precio_lista']
     and not (coalesce(c.despues, '{}') ?| array['updated_by', 'creado_via', 'updated_at'])
     and not (coalesce(c.antes, '{}') ?| array['updated_by', 'creado_via', 'updated_at']);
  select count(*) into v_m from public.productos_cambios c
   where c.entidad = 'unidad' and c.entidad_id = 'prueba_rls_caja' and c.operacion = 'update' and c.campos = array['nombre'];
  r := r || E'\n' || case when v_n = 1 and v_m = 1 and v = '42501' then 'OK      ' else 'FALLA   ' end || '19.14 historial del precio y del nombre de una unidad; miembro escribe el historial → 1 / 1 / 42501 · ' || v_n || ' / ' || v_m || ' / ' || v;

  -- 19.15 Con solo app_inventario e inventario activo: lee el catálogo, no
  -- el historial. 19.23: y crea una línea, con las copias del catálogo
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-inv');
  delete from public.user_roles where user_id = v_miembro and role in ('prueba-rls-prod-ver', 'prueba-rls-prod-edit');
  begin
    insert into public.modulos_instalacion (slug, activo) values ('inventario', true)
    on conflict (slug) do update set activo = true;
    v := 'activó';
  exception when others then v := sqlstate;
  end;
  perform set_config('request.jwt.claims', v_jm, true);
  if v <> 'activó' then
    r := r || E'\nOMITIDO 19.15 lector desde inventario · no se pudo activar inventario en la transacción: ' || v
           || E'\nOMITIDO 19.23 línea desde inventario · no se pudo activar inventario en la transacción: ' || v;
  elsif public.puede_ver_app('productos') then
    r := r || E'\nOMITIDO 19.15 lector desde inventario · la cuenta miembro ya ve Productos por un rol de la instalación'
           || E'\nOMITIDO 19.23 línea desde inventario · la cuenta miembro ya ve Productos por un rol de la instalación';
  else
    set local role authenticated;
    begin
      select count(*) into v_n from public.productos where id = v_p9;
      select count(*) into v_m from public.productos_cambios;
      v := case when v_n = 1 then 'lee' else 'no lee' end || ' / ' || v_m || ' filas';
    exception when others then v := sqlstate;
    end;
    begin
      insert into public.prueba_rls_lineas (producto_id, cantidad) values (v_p9, 3) returning id into v_linea;
      w := 'entró';
    exception when others then w := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = 'lee / 0 filas' then 'OK      ' else 'FALLA   ' end || '19.15 miembro con solo app_inventario lee productos y productos_cambios → lee / 0 filas · ' || v;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.prueba_rls_lineas l
     where l.id = v_linea and w = 'entró' and l.unidad = 'und' and l.factor = 1 and l.cantidad_base = 3
       and l.producto_codigo = 'PRUEBA-RLS-9' and l.impuesto = (select p.impuesto from public.productos p where p.id = v_p9);
    r := r || E'\n' || case when w = 'entró' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '19.23 miembro con solo app_inventario crea una línea con unidad nula → entró / 1 en la unidad base con copias · ' || w || ' / ' || v_n;
  end if;
  perform set_config('request.jwt.claims', '', true);
  delete from public.user_roles where user_id = v_miembro and role = 'prueba-rls-prod-inv';
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');

  -- 19.16 Módulo inactivo: ni lee ni escribe
  update public.modulos_instalacion set activo = false where slug = 'productos';
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    select count(*) into v_n from public.productos;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  begin
    insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-16', 'Prueba RLS inactivo');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.modulos_instalacion set activo = true where slug = 'productos';
  r := r || E'\n' || case when v = '0 filas / 42501' then 'OK      ' else 'FALLA   ' end || '19.16 módulo inactivo: lee y escribe → 0 filas / 42501 · ' || v;

  -- 19.17 Importación simulada: una nueva sin código, una existente con otro
  -- nombre y una con una unidad que no existe; nada queda y la serie no avanza
  v_filas := jsonb_build_array(
    jsonb_build_object('fila', 1, 'nombre', 'Prueba RLS importada',
                       'conversiones', jsonb_build_array(jsonb_build_object('unidad', 'prueba_rls_caja', 'factor', '6'))),
    jsonb_build_object('fila', 2, 'codigo', 'prueba-rls-5', 'nombre', 'Prueba RLS precio renombrado'),
    jsonb_build_object('fila', 3, 'codigo', 'PRUEBA-RLS-IMP3', 'nombre', 'Prueba RLS sin unidad', 'unidad_base', 'prueba_rls_no_existe'));
  select last_value || '/' || is_called into v_serie from public.serie_producto;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    v_j := public.productos_importar(v_filas, true);
    v := (v_j ->> 'crear') || ' / ' || (v_j ->> 'actualizar') || ' / ' || (v_j ->> 'error');
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.productos p
   where p.nombre in ('Prueba RLS importada', 'Prueba RLS precio renombrado', 'Prueba RLS sin unidad');
  select v || ' / ' || v_n || ' escritas / ' || case when last_value || '/' || is_called = v_serie then 'serie igual' else 'serie avanzó' end
    into v from public.serie_producto;
  r := r || E'\n' || case when v = '1 / 1 / 1 / 0 escritas / serie igual' then 'OK      ' else 'FALLA   ' end || '19.17 importación simulada: nueva, existente y con error → 1 / 1 / 1 / 0 escritas / serie igual · ' || v;

  -- 19.18 La misma importación sin simular; reimportar las válidas idénticas
  -- (con el código que recibió la nueva y sus conversiones) no cambia nada
  select count(*) into v_m from public.audit_log a where a.user_id = v_miembro and a.action = 'productos.importar';
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    v_j := public.productos_importar(v_filas, false);
    v := 'crear ' || (v_j ->> 'crear') || ' / actualizar ' || (v_j ->> 'actualizar') || ' / error ' || (v_j ->> 'error');
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_cod := v_j -> 'filas' -> 0 ->> 'codigo';
  select count(*) into v_n from public.productos p
   where p.codigo = v_cod and p.nombre = 'Prueba RLS importada' and p.creado_via = 'importacion'
     and exists (select 1 from public.productos_conversiones k where k.producto_id = p.id and k.unidad = 'prueba_rls_caja' and k.factor = 6);
  select count(*) - v_m into v_m from public.audit_log a where a.user_id = v_miembro and a.action = 'productos.importar';
  v := v || ' / importacion ' || v_n || ' / auditoría ' || v_m;
  select count(*) into v_k from public.productos_cambios c
   where c.entidad_id in (v_p5::text, (select p.id::text from public.productos p where p.codigo = v_cod));
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    v_j := public.productos_importar(jsonb_build_array(
      jsonb_build_object('fila', 1, 'codigo', v_cod, 'nombre', 'Prueba RLS importada',
                         'conversiones', jsonb_build_array(jsonb_build_object('unidad', 'prueba_rls_caja', 'factor', 6))),
      jsonb_build_object('fila', 2, 'codigo', 'prueba-rls-5', 'nombre', 'Prueba RLS precio renombrado')), false);
    v := v || ' / sin_cambio ' || (v_j ->> 'sin_cambio');
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) - v_k into v_k from public.productos_cambios c
   where c.entidad_id in (v_p5::text, (select p.id::text from public.productos p where p.codigo = v_cod));
  v := v || ' / historial ' || v_k;
  r := r || E'\n' || case when v = 'crear 1 / actualizar 1 / error 1 / importacion 1 / auditoría 1 / sin_cambio 2 / historial 0' then 'OK      ' else 'FALLA   ' end || '19.18 importación real y reimportación idéntica → crear 1 / actualizar 1 / error 1 / importacion 1 / auditoría 1 / sin_cambio 2 / historial 0 · ' || v;

  -- 19.19 Repetidos en el lote: el mismo código, dos que normalizan igual y
  -- dos sin código con el mismo nombre; todas con error y nada escrito
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    v_j := public.productos_importar(jsonb_build_array(
      jsonb_build_object('fila', 1, 'codigo', 'PRUEBA-RLS-R1', 'nombre', 'Prueba RLS r1'),
      jsonb_build_object('fila', 2, 'codigo', 'prueba-rls-r1', 'nombre', 'Prueba RLS r1 bis'),
      jsonb_build_object('fila', 3, 'codigo', 'PRUEBA-RLS R2', 'nombre', 'Prueba RLS r2'),
      jsonb_build_object('fila', 4, 'codigo', 'PRUEBA-RLSR2', 'nombre', 'Prueba RLS r2 bis'),
      jsonb_build_object('fila', 5, 'nombre', 'Prueba RLS repetido'),
      jsonb_build_object('fila', 6, 'nombre', ' prueba rls  repetido ')), false);
    v := 'error ' || (v_j ->> 'error') || ' / crear ' || (v_j ->> 'crear');
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.productos p
   where p.codigo in ('PRUEBA-RLS-R1', 'PRUEBA-RLSR2') or lower(p.nombre) like 'prueba rls r_' or lower(p.nombre) like '%repetido%';
  v := v || ' / ' || v_n || ' escritas';
  r := r || E'\n' || case when v = 'error 6 / crear 0 / 0 escritas' then 'OK      ' else 'FALLA   ' end || '19.19 lote con códigos repetidos, normalizados iguales y nombres repetidos → error 6 / crear 0 / 0 escritas · ' || v;

  -- 19.20 Importar sin edit_productos; un lote de 501 filas
  delete from public.user_roles where user_id = v_miembro and role = 'prueba-rls-prod-edit';
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-ver');
  perform set_config('request.jwt.claims', v_jm, true);
  if public.has_perm('edit_productos') then
    v := 'omitido';
  else
    set local role authenticated;
    begin
      perform public.productos_importar('[]'::jsonb, true);
      v := 'importó';
    exception when others then v := sqlstate;
    end;
    reset role;
  end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    perform public.productos_importar((select jsonb_agg(jsonb_build_object('fila', g, 'nombre', 'Prueba RLS tope ' || g)) from generate_series(1, 501) g), true);
    v := v || ' / importó';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  if v like 'omitido%' then
    r := r || E'\nOMITIDO 19.20 importar sin edit_productos · la cuenta miembro ya lo tiene por un rol de la instalación';
  else
    r := r || E'\n' || case when v = '42501 / 22023' then 'OK      ' else 'FALLA   ' end || '19.20 importar sin edit_productos y 501 filas → 42501 / 22023 · ' || v;
  end if;

  -- 19.21 Lote de 500 filas nuevas con conversión, simulado como el miembro:
  -- tiene que caber holgado en el statement_timeout del rol authenticated
  perform set_config('request.jwt.claims', '', true);
  select coalesce((select substr(c, char_length('statement_timeout=') + 1)
                     from pg_catalog.pg_roles x, unnest(x.rolconfig) c
                    where x.rolname = 'authenticated' and c like 'statement_timeout=%'), 'sin tope')
    into v_tope;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  v_t0 := clock_timestamp();
  begin
    v_j := public.productos_importar((select jsonb_agg(jsonb_build_object(
             'fila', g, 'codigo', 'PRUEBA-RLS-L' || g, 'nombre', 'Prueba RLS lote ' || g, 'precio_lista', '1000.5',
             'conversiones', jsonb_build_array(jsonb_build_object('unidad', 'prueba_rls_caja', 'factor', '12'))))
             from generate_series(1, 500) g), true);
    v := 'terminó ' || (v_j ->> 'crear');
  exception when others then v := sqlstate;
  end;
  v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
  reset role;
  r := r || E'\n' || case when v = 'terminó 500' and v_ms < 6000 then 'OK      ' else 'FALLA   ' end || '19.21 lote de 500 filas simulado en menos de 6 s → terminó 500 · ' || v || ' en ' || v_ms || ' ms (statement_timeout de authenticated: ' || v_tope || ')';

  -- 19.22 Anónimo: sin lectura ni EXECUTE en las funciones del módulo
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    select count(*) into v_n from public.productos;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  v := v || ' / ' || case when has_function_privilege('anon', 'public.productos_buscar(text,uuid,boolean,text,text,boolean,integer,integer)', 'execute')
                            or has_function_privilege('anon', 'public.productos_importar(jsonb,boolean)', 'execute')
                            or has_function_privilege('anon', 'public.productos_factor(uuid,text)', 'execute')
                            or has_function_privilege('anon', 'public.productos_impuesto_predeterminar(text)', 'execute')
                          then 'ejecuta' else 'no ejecuta' end;
  r := r || E'\n' || case when v = '42501 / no ejecuta' then 'OK      ' else 'FALLA   ' end || '19.22 anon lee productos y ejecuta buscar, importar, factor y predeterminar → 42501 / no ejecuta · ' || v;

  -- 19.24 Sin app_productos ni un módulo dependiente, con el módulo activo y
  -- filas en las cinco tablas: no lee nada del catálogo
  perform set_config('request.jwt.claims', '', true);
  delete from public.user_roles where user_id = v_miembro and role like 'prueba-rls-prod-%';
  select (exists (select 1 from public.productos))::int + (exists (select 1 from public.productos_categorias))::int
       + (exists (select 1 from public.productos_unidades))::int + (exists (select 1 from public.productos_conversiones))::int
       + (exists (select 1 from public.productos_impuestos))::int into v_k;
  perform set_config('request.jwt.claims', v_jm, true);
  if public.productos_puede_leer() then
    r := r || E'\nOMITIDO 19.24 miembro sin lectura · la cuenta miembro ya lee el catálogo por un rol de la instalación';
  else
    set local role authenticated;
    begin
      select (select count(*) from public.productos) || ' / ' || (select count(*) from public.productos_categorias) || ' / '
          || (select count(*) from public.productos_unidades) || ' / ' || (select count(*) from public.productos_conversiones) || ' / '
          || (select count(*) from public.productos_impuestos) into v;
    exception when others then v := sqlstate;
    end;
    reset role;
    r := r || E'\n' || case when v = '0 / 0 / 0 / 0 / 0' and v_k = 5 then 'OK      ' else 'FALLA   ' end || '19.24 miembro sin lectura lee productos, categorías, unidades, conversiones y clases → 0 ×5 · ' || v || ' (tablas con filas: ' || v_k || ')';
  end if;

  -- 19.25 Con solo app_productos: no cambia ni borra productos, categorías,
  -- unidades ni conversiones, y no pone una conversión
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-ver');
  perform set_config('request.jwt.claims', v_jm, true);
  if public.has_perm('edit_productos') then
    r := r || E'\nOMITIDO 19.25 miembro sin edit_productos · la cuenta miembro ya lo tiene por un rol de la instalación';
  else
    set local role authenticated;
    v := '';
    foreach w in array array[
      format('update public.productos set nombre = nombre where id = %L', v_p5),
      format('delete from public.productos where id = %L', v_p8b),
      format('update public.productos_categorias set nombre = nombre where id = %L', v_cat_a),
      format('delete from public.productos_categorias where id = %L', v_cat_b),
      'update public.productos_unidades set nombre = nombre where clave = ''prueba_rls_fina''',
      'delete from public.productos_unidades where clave = ''prueba_rls_otra''',
      format('update public.productos_conversiones set factor = factor where producto_id = %L', v_p7),
      format('delete from public.productos_conversiones where producto_id = %L', v_p9)] loop
      begin
        execute w;
        get diagnostics v_n = row_count;
        v := v || v_n || ' / ';
      exception when others then v := v || sqlstate || ' / ';
      end;
    end loop;
    begin
      insert into public.productos_conversiones (producto_id, unidad, factor) values (v_p8b, 'prueba_rls_fina', 2);
      v := v || 'entró';
    exception when others then v := v || case when sqlstate in ('42501', '23503') then 'rechazó' else sqlstate end;
    end;
    reset role;
    r := r || E'\n' || case when v = '0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / rechazó' then 'OK      ' else 'FALLA   ' end || '19.25 miembro con solo app_productos cambia y borra productos, categorías, unidades y conversiones, y pone una conversión → 0 ×8 / rechazó · ' || v;
  end if;

  -- 19.26 Con edit_productos: no cambia ni borra una clase de impuesto
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    update public.productos_impuestos set nombre = nombre where clave = 'prueba_rls_iva';
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  begin
    delete from public.productos_impuestos where clave = 'iva_exento';
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  r := r || E'\n' || case when v = '0 filas / 0 filas' then 'OK      ' else 'FALLA   ' end || '19.26 miembro con edit_productos cambia y borra una clase de impuesto → 0 filas / 0 filas · ' || v;

  -- 19.27 Con solo edit_productos, sin lectura: no escribe a ciegas (una
  -- categoría bajo una de nivel 3 o bajo una archivada, un producto) ni
  -- importa
  perform set_config('request.jwt.claims', '', true);
  delete from public.user_roles where user_id = v_miembro and role like 'prueba-rls-prod-%';
  insert into public.roles (name, permissions) values ('prueba-rls-prod-solo-edit', array['edit_productos']);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-solo-edit');
  insert into public.productos_categorias (nombre, archivado_en) values ('Prueba RLS archivada', now()) returning id into v_cat_arch;
  perform set_config('request.jwt.claims', v_jm, true);
  if public.productos_puede_leer() then
    r := r || E'\nOMITIDO 19.27 miembro con solo edit_productos · la cuenta miembro ya lee el catálogo por un rol de la instalación';
  else
    set local role authenticated;
    begin
      insert into public.productos_categorias (nombre, padre_id) values ('Prueba RLS nivel 4', v_cat_x2);
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    begin
      insert into public.productos_categorias (nombre, padre_id) values ('Prueba RLS bajo archivada', v_cat_arch);
      v := v || ' / entró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    begin
      insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-27', 'Prueba RLS a ciegas');
      v := v || ' / entró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    begin
      perform public.productos_importar('[]'::jsonb, true);
      v := v || ' / importó';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.productos_categorias c where c.nombre in ('Prueba RLS nivel 4', 'Prueba RLS bajo archivada');
    v := v || ' / ' || v_n || ' escritas';
    r := r || E'\n' || case when v = '42501 / 42501 / 42501 / 42501 / 0 escritas' then 'OK      ' else 'FALLA   ' end || '19.27 miembro con solo edit_productos crea categorías bajo el nivel 3 y bajo una archivada, un producto e importa → 42501 ×4 / 0 escritas · ' || v;
  end if;

  -- 19.28 Un alta rechazada no gasta un número de la serie: sin
  -- edit_productos y con el módulo inactivo
  perform set_config('request.jwt.claims', '', true);
  delete from public.user_roles where user_id = v_miembro and role like 'prueba-rls-prod-%';
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-ver');
  select last_value || '/' || is_called into v_serie from public.serie_producto;
  perform set_config('request.jwt.claims', v_jm, true);
  if public.has_perm('edit_productos') then
    r := r || E'\nOMITIDO 19.28 alta rechazada y serie · la cuenta miembro ya tiene edit_productos por un rol de la instalación';
  else
    set local role authenticated;
    begin
      insert into public.productos (nombre) values ('Prueba RLS sin permiso');
      v := 'entró';
    exception when others then v := sqlstate;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');
    update public.modulos_instalacion set activo = false where slug = 'productos';
    perform set_config('request.jwt.claims', v_jm, true);
    set local role authenticated;
    begin
      insert into public.productos (nombre) values ('Prueba RLS inactivo sin código');
      v := v || ' / entró';
    exception when others then v := v || ' / ' || sqlstate;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    update public.modulos_instalacion set activo = true where slug = 'productos';
    select v || ' / ' || case when last_value || '/' || is_called = v_serie then 'serie igual' else 'serie avanzó' end
      into v from public.serie_producto;
    r := r || E'\n' || case when v = '42501 / 42501 / serie igual' then 'OK      ' else 'FALLA   ' end || '19.28 alta sin código sin edit_productos y con el módulo inactivo → 42501 / 42501 / serie igual · ' || v;
  end if;
  perform set_config('request.jwt.claims', '', true);
  delete from public.user_roles where user_id = v_miembro and role like 'prueba-rls-prod-%';
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-prod-edit');

  -- 19.29 El código no cambia en un producto archivado ni en uno con líneas
  -- (no queda libre para otro); en uno libre sí, y uno igual tras normalizar
  -- no es un cambio
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  insert into public.productos (codigo, nombre, archivado_en) values ('PRUEBA-RLS-ARCH', 'Prueba RLS archivado', now()) returning id into v_arch;
  insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-LIBRE', 'Prueba RLS libre de líneas') returning id into v_libre;
  v := '';
  foreach w in array array[v_arch::text, v_p8a::text] loop
    begin
      update public.productos set codigo = 'PRUEBA-RLS-OTRO' where id = w::uuid;
      v := v || 'cambió / ';
    exception when others then get stacked diagnostics v_cod = pg_exception_hint; v := v || sqlstate || ' ' || v_cod || ' / ';
    end;
  end loop;
  begin
    update public.productos set codigo = ' prueba-rls-arch ', nombre = 'Prueba RLS archivado 2' where id = v_arch;
    get diagnostics v_n = row_count;
    v := v || v_n || ' filas';
  exception when others then v := v || sqlstate;
  end;
  begin
    update public.productos set codigo = 'prueba-rls-libre 2' where id = v_libre;
    get diagnostics v_n = row_count;
    v := v || ' / ' || v_n || ' filas';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  begin
    insert into public.productos (codigo, nombre) values ('PRUEBA-RLS-ARCH', 'Prueba RLS reuso');
    v := v || ' / entró';
  exception when others then v := v || ' / ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.productos p where p.id = v_libre and p.codigo = 'PRUEBA-RLS-LIBRE2';
  v := v || ' / ' || v_n;
  r := r || E'\n' || case when v = '23514 productos_codigo_archivado / 23514 productos_codigo_en_uso / 1 filas / 1 filas / 23505 / 1' then 'OK      ' else 'FALLA   ' end || '19.29 cambiar el código de un archivado, de uno con líneas, igual tras normalizar y de uno libre; reusar el archivado → 23514 archivado / 23514 en_uso / 1 filas / 1 filas / 23505 / 1 · ' || v;

  -- 19.30 Una línea que cambia de producto toma la unidad base, la clase y
  -- el porcentaje del producto nuevo
  insert into public.productos (codigo, nombre, unidad_base, impuesto)
  values ('PRUEBA-RLS-30', 'Prueba RLS otro producto', 'prueba_rls_fina', 'prueba_rls_iva') returning id into v_pb;
  insert into public.prueba_rls_lineas (producto_id, cantidad) values (v_p5, 1) returning id into v_linea;
  begin
    update public.prueba_rls_lineas set producto_id = v_pb where id = v_linea;
    v := 'cambió';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := sqlstate || ' ' || w;
  end;
  select count(*) into v_n from public.prueba_rls_lineas l
   where l.id = v_linea and l.producto_codigo = 'PRUEBA-RLS-30' and l.unidad = 'prueba_rls_fina' and l.factor = 1
     and l.impuesto = 'prueba_rls_iva' and l.porcentaje_impuesto = 7;
  r := r || E'\n' || case when v = 'cambió' and v_n = 1 then 'OK      ' else 'FALLA   ' end || '19.30 línea que cambia a un producto con otra unidad base y otra clase → cambió / 1 con las del producto nuevo · ' || v || ' / ' || v_n;

  -- 19.31 Una tabla de líneas registrada y luego borrada no bloquea el cambio
  -- de unidad base de un producto libre
  create table public.prueba_rls_lineas_borrada (id uuid primary key default gen_random_uuid());
  perform public.productos_aplicar_linea('public.prueba_rls_lineas_borrada', 'inventario', false);
  drop table public.prueba_rls_lineas_borrada;
  perform set_config('request.jwt.claims', v_jm, true);
  set local role authenticated;
  begin
    update public.productos set unidad_base = 'prueba_rls_fina' where id = v_libre;
    get diagnostics v_n = row_count;
    v := v_n || ' filas';
  exception when others then v := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  r := r || E'\n' || case when v = '1 filas' then 'OK      ' else 'FALLA   ' end || '19.31 cambiar la unidad base con una tabla de líneas registrada y borrada → 1 filas · ' || v;

  -- 19.32 Un producto cuya unidad base y clase se archivaron sigue entrando
  -- en líneas nuevas con ellas; otra unidad archivada no
  insert into public.productos_unidades (clave, nombre) values ('prueba_rls_arch', 'Prueba RLS archivable');
  insert into public.productos_impuestos (clave, nombre, tipo, tratamiento, porcentaje) values ('prueba_rls_arch', 'Prueba RLS clase archivable', 'iva', 'gravado', 3);
  insert into public.productos (codigo, nombre, unidad_base, impuesto)
  values ('PRUEBA-RLS-32', 'Prueba RLS base archivada', 'prueba_rls_arch', 'prueba_rls_arch') returning id into v_pc;
  update public.productos_unidades set archivado_en = now() where clave = 'prueba_rls_arch';
  update public.productos_impuestos set archivado_en = now() where clave = 'prueba_rls_arch';
  begin
    insert into public.prueba_rls_lineas (producto_id, cantidad) values (v_pc, 2) returning id into v_linea;
    v := 'entró';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := sqlstate || ' ' || w;
  end;
  select count(*) into v_n from public.prueba_rls_lineas l
   where l.id = v_linea and l.producto_id = v_pc and l.unidad = 'prueba_rls_arch' and l.factor = 1
     and l.impuesto = 'prueba_rls_arch' and l.porcentaje_impuesto = 3;
  begin
    insert into public.prueba_rls_lineas (producto_id, unidad, cantidad) values (v_p9, 'prueba_rls_arch', 1);
    v := v || ' / ' || v_n || ' / entró';
  exception when others then get stacked diagnostics w = pg_exception_hint; v := v || ' / ' || v_n || ' / ' || sqlstate || ' ' || w;
  end;
  r := r || E'\n' || case when v = 'entró / 1 / 23514 productos_unidad_archivada' then 'OK      ' else 'FALLA   ' end || '19.32 línea de un producto con su unidad base y su clase archivadas; otra unidad archivada → entró / 1 / 23514 productos_unidad_archivada · ' || v;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('rls.res', current_setting('rls.res') || r, true);
end $$;

-- ============ Resultado (error a propósito: deshace todo) ============
do $$
declare
  r text := current_setting('rls.res');
  v_ok int := (char_length(r) - char_length(replace(r, E'\nOK ', ''))) / char_length(E'\nOK ');
  v_falla int := (char_length(r) - char_length(replace(r, E'\nFALLA', ''))) / char_length(E'\nFALLA');
  v_omitido int := (char_length(r) - char_length(replace(r, E'\nOMITIDO', ''))) / char_length(E'\nOMITIDO');
begin
  raise exception E'rls-simulacion (se deshace todo): % OK · % FALLA · % OMITIDO\n%', v_ok, v_falla, v_omitido, r;
end $$;

rollback;

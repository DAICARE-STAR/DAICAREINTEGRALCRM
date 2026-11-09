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
-- Requiere: supabase/esquema 00 a 04 aplicados (05 a 09 para las secciones 8 a 11, con 06b para el caso 9.7; 21-crm.sql para la 12 y la 13, con 21b para el caso 13.9) y las cuentas de prueba de
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
-- Las secciones 8 a 11 salen OMITIDO si falta su archivo de 05 a 09; la 12
-- y la 13, si falta 21-crm.sql.
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

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
-- Requiere: supabase/esquema 00 a 04 aplicados y las cuentas de prueba de
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
-- Las secciones 8 en adelante llegan con 05-09 (perfiles, avisos, widgets,
-- IA y storage).
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
  select count(*) into v_n from public.profiles where id = v_miembro and (role = 'admin' or es_servicio);
  r := r || E'\n' || case when v_n = 0 then 'OK      ' else 'FALLA   ' end || '1.3   miembro cambia su profiles.role y es_servicio → sin cambio · ' || v || ' / ' || v_n || ' cambiados';

  -- Gestor de roles sin admin: un rol temporal con manage_roles para el miembro
  insert into public.roles (name, permissions, position) values ('prueba-rls-gestor', array['manage_roles'], 50);
  insert into public.roles (name, permissions, position) values ('prueba-rls-otro', '{}', 20);
  insert into public.user_roles (user_id, role) values (v_miembro, 'prueba-rls-gestor');
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
do $$
declare
  r text := '';
  v text;
  v_n bigint;
  v_n2 bigint;
begin
  if current_setting('rls.txid', true) is distinct from txid_current()::text then
    raise exception 'rls-simulacion: correr el archivo entero de una vez (BEGIN … ROLLBACK), no una sección suelta';
  end if;

  select count(*) into v_n from public.profiles where not es_servicio;
  update public.modulos_instalacion set limites = limites || jsonb_build_object('miembros', v_n) where slug = 'nucleo';

  -- Las altas de Auth crean el perfil (handle_new_user) y el trigger lo frena
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  r := r || E'\n' || case when v = 'limite_miembros' then 'OK      ' else 'FALLA   ' end || '7.1   alta con el cupo lleno → limite_miembros · ' || v;

  begin
    insert into auth.users (id, aud, role, raw_app_meta_data)
    values (gen_random_uuid(), 'authenticated', 'authenticated', '{"es_servicio": true}');
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  select count(*) into v_n2 from public.profiles where not es_servicio;
  r := r || E'\n' || case when v = 'entró' and v_n2 = v_n then 'OK      ' else 'FALLA   ' end
         || '7.2   alta de una cuenta de servicio con el cupo lleno → entró y no cuenta · ' || v || ' / ' || (v_n2 - v_n) || ' miembros de más';

  update public.modulos_instalacion set limites = limites || jsonb_build_object('miembros', v_n + 1) where slug = 'nucleo';
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '7.3   alta con un cupo libre → entró · ' || v;

  update public.modulos_instalacion set limites = limites || '{"miembros": null}' where slug = 'nucleo';
  begin
    insert into auth.users (id, aud, role) values (gen_random_uuid(), 'authenticated', 'authenticated');
    v := 'entró';
  exception when others then v := case when sqlerrm like 'limite_miembros%' then 'limite_miembros' else sqlstate end;
  end;
  r := r || E'\n' || case when v = 'entró' then 'OK      ' else 'FALLA   ' end || '7.4   alta sin límite (null) → entró · ' || v;

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

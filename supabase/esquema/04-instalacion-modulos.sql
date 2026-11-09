-- ============================================================
-- 04-instalacion-modulos.sql — Núcleo: datos de la instalación, módulos
-- activos, límites y consumo
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen: código nuevo del producto (no hay módulos contratados en
-- team-portal). puede_ver_app v2 sustituye a la de la migración 63, que
-- leía portal_apps (no viaja). Patrones de team-portal 12b1b72 (solo
-- lectura): fila única de security_settings (64) y política restrictiva de
-- exigir_mfa (43).
--
-- Los módulos los activa quien instala con tools/instalar/modulos.mjs y la
-- cadena del instalador (PP-DEC-04): modulos_instalacion no tiene ninguna
-- política ni grant de escritura para authenticated, ni siquiera para un
-- administrador del cliente, que la ve en solo lectura.
--
-- Requisitos: 00 a 03 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                     | Qué                                                        |
--   |----------------------------|------------------------------------------------------------|
--   | tema_valido(jsonb)         | tema con claves de la lista de primitivas de color y       |
--   |                            | valores #rrggbb (frena la inyección de CSS)                |
--   | zona_horaria_valida(text)  | zona de pg_timezone_names (at time zone no falla después)  |
--   | instalacion                | fila única id = 1: nombre, país, moneda, tema, logos y     |
--   |                            | ajustes; la leen todos, la cambia solo un administrador    |
--   | modulos_instalacion        | un módulo por fila con activo y limites; solo lectura      |
--   |                            | para authenticated; la escribe el instalador               |
--   | has_modulo(slug)           | true para nucleo o si la fila está activa                  |
--   | puede_ver_app(slug) v2     | núcleo, o has_modulo y (admin, app_<slug> o sin app_<slug>) |
--   | limite_modulo(slug, clave) | límite entero de un módulo; null = sin límite              |
--   | aplicar_politica_modulo    | política restrictiva modulo_<slug> en una tabla de módulo; |
--   |                            | solo el dueño (archivos de módulo 10 en adelante)          |
--   | modulos_consumo()          | miembros, almacenamiento, IA y uso (administrador o service role) |
--   | profiles_limite_miembros   | respaldo del límite de miembros al crear un perfil, al     |
--   |                            | confirmar el alta (diferido)                               |
--   | auditar_modulo             | fila 'base' en audit_log por cambio de un módulo, con slug |
--   | semilla                    | fila de instalacion y nucleo activo con miembros = 10      |
--   |                            | (PP-LIM)                                                   |
--
-- almacenamiento_disponible() y su política en storage.objects llegan con
-- 09-storage-base.sql (PP-ALM).
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '04-instalacion-modulos detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regprocedure('public.has_perm(text)') is null
     or to_regprocedure('public.touch_updated_at()') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'es_servicio') then
    raise exception '04-instalacion-modulos detenido: falta 00-base.sql';
  end if;
  if to_regprocedure('public.permisos_solo_admin()') is null then
    raise exception '04-instalacion-modulos detenido: falta 01-seguridad.sql';
  end if;
  if to_regclass('public.audit_log') is null or to_regprocedure('public.auditar_cambio()') is null then
    raise exception '04-instalacion-modulos detenido: falta 02-auditoria.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '04-instalacion-modulos detenido: falta 03-mfa.sql';
  end if;
end $$;

-- ============ 1) Validación del tema ============
-- Las claves son las primitivas de color de src/estilos/paleta.css que una
-- instalación puede redefinir: la misma lista PRIMITIVAS de public/tema.js
-- (src/lib/__tests__/esquema.test.ts compara las dos).
create or replace function public.tema_valido(p_tema jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_tema is not null
     and jsonb_typeof(p_tema) = 'object'
     and not exists (
       select 1
         from jsonb_each(p_tema) e
        where e.key <> all (array[
                '--pal-base-0', '--pal-base-50', '--pal-base-100', '--pal-base-200', '--pal-base-300', '--pal-base-400',
                '--pal-base-500', '--pal-base-700', '--pal-base-800', '--pal-base-850', '--pal-base-900',
                '--pal-acento-200', '--pal-acento-300', '--pal-acento-500', '--pal-acento-600', '--pal-acento-700',
                '--pal-borde-control', '--pal-placeholder', '--pal-placeholder-sobre-oscuro',
                '--pal-exito', '--pal-aviso', '--pal-error', '--pal-info',
                '--pal-exito-sobre-oscuro', '--pal-aviso-sobre-oscuro', '--pal-error-sobre-oscuro', '--pal-info-sobre-oscuro'
              ]::text[])
           or jsonb_typeof(e.value) <> 'string'
           or (e.value #>> '{}') !~ '^#[0-9a-f]{6}$'
     );
$$;

-- La usa el CHECK de instalacion.tema: la ejecuta quien escribe la fila
revoke execute on function public.tema_valido(jsonb) from public, anon;
grant execute on function public.tema_valido(jsonb) to authenticated, service_role;

-- Zona horaria con nombre que Postgres reconoce: modulos_consumo y los
-- archivos siguientes la usan en «at time zone», que falla con una zona
-- desconocida. Lee el catálogo, así que es stable y no immutable.
create or replace function public.zona_horaria_valida(p_zona text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_zona is not null
     and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_zona);
$$;

-- La usa el CHECK de instalacion.zona_horaria: la ejecuta quien escribe la fila
revoke execute on function public.zona_horaria_valida(text) from public, anon;
grant execute on function public.zona_horaria_valida(text) to authenticated, service_role;

-- ============ 2) Instalación (fila única) ============
-- Patrón de security_settings (64): fila id = 1 creada aquí; sin insert ni
-- delete para nadie de la API; update solo un administrador.
create table if not exists public.instalacion (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'Portal del equipo'
    constraint instalacion_nombre_check check (char_length(btrim(nombre)) between 1 and 120),
  nombre_corto text not null default ''
    constraint instalacion_nombre_corto_check check (char_length(nombre_corto) <= 40),
  rubro text not null default '',
  pais text not null default 'CO'
    constraint instalacion_pais_check check (pais ~ '^[A-Z]{2}$'),
  locale text not null default 'es-CO'
    constraint instalacion_locale_check check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  zona_horaria text not null default 'America/Bogota'
    constraint instalacion_zona_check check (public.zona_horaria_valida(zona_horaria)),
  moneda_base text not null default 'COP'
    constraint instalacion_moneda_check check (moneda_base ~ '^[A-Z]{3}$'),
  divisas text[] not null default '{}'
    constraint instalacion_divisas_check check (array_to_string(divisas, ',') ~ '^([A-Z]{3}(,[A-Z]{3})*)?$'),
  correo_responsable text not null default ''
    constraint instalacion_correo_check check (correo_responsable = '' or correo_responsable ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+\.[^[:space:]@<>"]+$'),
  contactos jsonb not null default '[]'
    constraint instalacion_contactos_check check (jsonb_typeof(contactos) = 'array'),
  tema jsonb not null default '{}'
    constraint instalacion_tema_check check (public.tema_valido(tema)),
  logos jsonb not null default '{}'
    constraint instalacion_logos_check check (jsonb_typeof(logos) = 'object'),
  -- Ajustes por módulo: { "<slug>": { … } }
  ajustes jsonb not null default '{}'
    constraint instalacion_ajustes_check check (jsonb_typeof(ajustes) = 'object'),
  updated_at timestamptz not null default now()
);

comment on table public.instalacion is
  'Datos de la instalación (fila única id=1). La lee todo miembro; la cambia solo un administrador.';

insert into public.instalacion (id) values (1) on conflict (id) do nothing;

drop trigger if exists instalacion_touch on public.instalacion;
create trigger instalacion_touch
  before update on public.instalacion
  for each row execute function public.touch_updated_at();

alter table public.instalacion enable row level security;

revoke all on table public.instalacion from anon, authenticated;
grant select, update on table public.instalacion to authenticated;
grant select, update on table public.instalacion to service_role;

drop policy if exists instalacion_select on public.instalacion;
create policy instalacion_select on public.instalacion
  for select to authenticated
  using (true);

drop policy if exists instalacion_update on public.instalacion;
create policy instalacion_update on public.instalacion
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- De la instalación, auditar_cambio guarda solo los nombres de campo
drop trigger if exists auditar_cambio on public.instalacion;
create trigger auditar_cambio after update on public.instalacion
  for each row execute function public.auditar_cambio();

-- ============ 3) Módulos de la instalación ============
-- slug: el del registro src/lib/modulos.ts (verificar lo compara).
-- limites: claves que declara el módulo en el registro; null = sin límite.
create table if not exists public.modulos_instalacion (
  slug text primary key
    constraint modulos_instalacion_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  activo boolean not null default false,
  limites jsonb not null default '{}'
    constraint modulos_instalacion_limites_check check (jsonb_typeof(limites) = 'object'),
  activado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint modulos_instalacion_nucleo_activo check (slug <> 'nucleo' or activo)
);

comment on table public.modulos_instalacion is
  'Módulos de la instalación con sus límites. Solo la escribe el instalador (tools/instalar/modulos.mjs).';

-- activado_en: la última vez que pasó a activo; actualizado_en: cada cambio
create or replace function public.modulos_instalacion_sellar()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.actualizado_en := now();
  if new.activo and (tg_op = 'INSERT' or not old.activo) then
    new.activado_en := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.modulos_instalacion_sellar() from public, anon, authenticated;

drop trigger if exists modulos_instalacion_sellar on public.modulos_instalacion;
create trigger modulos_instalacion_sellar
  before insert or update on public.modulos_instalacion
  for each row execute function public.modulos_instalacion_sellar();

insert into public.modulos_instalacion (slug, activo, limites)
values ('nucleo', true, '{"miembros": 10}')
on conflict (slug) do nothing;

alter table public.modulos_instalacion enable row level security;

-- Sin escritura para la API: ni insert, ni update, ni delete, ni políticas
revoke all on table public.modulos_instalacion from anon, authenticated;
grant select on table public.modulos_instalacion to authenticated;
grant all on table public.modulos_instalacion to service_role;

drop policy if exists modulos_instalacion_select on public.modulos_instalacion;
create policy modulos_instalacion_select on public.modulos_instalacion
  for select to authenticated
  using (true);

-- auditar_cambio no sabe del slug (su entity_id busca id, name o user_id):
-- este trigger deja el slug, activo y límites (no son secretos)
create or replace function public.auditar_modulo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fila record;
  v_detalle text;
begin
  if tg_op = 'DELETE' then v_fila := old; else v_fila := new; end if;
  if tg_op = 'UPDATE' and new.activo is not distinct from old.activo
     and new.limites is not distinct from old.limites then
    return new;
  end if;
  v_detalle := lower(tg_op) || ' ' || v_fila.slug
    || case when tg_op = 'DELETE' then ''
            else ' activo=' || v_fila.activo::text || ' limites=' || v_fila.limites::text end;
  insert into public.audit_log (user_id, action, detail, entity, entity_id, origen)
  values (auth.uid(), 'modulos_instalacion.' || lower(tg_op), left(v_detalle, 600),
          'modulos_instalacion', v_fila.slug, 'base');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.auditar_modulo() from public, anon, authenticated;

drop trigger if exists auditar_modulo on public.modulos_instalacion;
create trigger auditar_modulo after insert or update or delete on public.modulos_instalacion
  for each row execute function public.auditar_modulo();

-- ============ 4) Funciones de módulo ============
-- En las políticas se envuelven como (select public.has_modulo('x')): así
-- Postgres la evalúa una vez por sentencia y no por fila.
create or replace function public.has_modulo(p_slug text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_slug = 'nucleo'
      or exists (select 1 from public.modulos_instalacion m where m.slug = p_slug and m.activo);
$$;

revoke execute on function public.has_modulo(text) from public, anon;
grant execute on function public.has_modulo(text) to authenticated, service_role;

-- v2: sin portal_apps. Un módulo inactivo no lo ve nadie, ni un administrador.
-- La misma regla que puedeVerModulo (src/lib/modulos.ts): el núcleo lo ve
-- todo miembro y un módulo que no declara app_<slug> (la lista, comprobada
-- contra el registro en esquema.test.ts) también, si está activo.
create or replace function public.puede_ver_app(p_slug text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_slug = 'nucleo'
      or (public.has_modulo(p_slug)
          and (public.is_admin() or public.has_perm('app_' || p_slug) or p_slug = any (array['ia'])));
$$;

revoke execute on function public.puede_ver_app(text) from public, anon;
grant execute on function public.puede_ver_app(text) to authenticated;

-- Límite entero de un módulo (activo o no). null = sin límite, también si
-- la clave falta o no es un número (las listas, como fuentes, no van aquí).
-- Un número mayor que bigint se toma como el máximo de bigint: el cast
-- fallaría y tumbaría cada alta (validarLimites ya lo frena al escribir).
create or replace function public.limite_modulo(p_slug text, p_clave text)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select case when jsonb_typeof(m.limites -> p_clave) = 'number'
              then greatest(least(floor((m.limites ->> p_clave)::numeric), 9223372036854775807), 0)::bigint end
    from public.modulos_instalacion m
   where m.slug = p_slug;
$$;

revoke execute on function public.limite_modulo(text, text) from public, anon;
grant execute on function public.limite_modulo(text, text) to authenticated, service_role;

-- Cierra una tabla de módulo: una política restrictiva modulo_<slug> por
-- slug (todas deben cumplirse). Con el módulo inactivo, un miembro lee
-- vacío y no escribe; los datos se conservan. La llama cada archivo de
-- módulo (10 en adelante) en cada tabla suya. Sin security definer: crear
-- políticas exige ser dueño de la tabla, así que solo funciona para quien
-- instala.
create or replace function public.aplicar_politica_modulo(p_tabla regclass, p_slugs text[])
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_slug text;
begin
  if p_slugs is null or cardinality(p_slugs) = 0 then
    raise exception 'aplicar_politica_modulo: falta el slug del módulo' using errcode = '22023';
  end if;
  foreach v_slug in array p_slugs loop
    if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_slug = 'nucleo' then
      raise exception 'aplicar_politica_modulo: slug no válido: %', coalesce(v_slug, 'null') using errcode = '22023';
    end if;
    execute format('drop policy if exists %I on %s', 'modulo_' || v_slug, p_tabla);
    execute format(
      'create policy %I on %s as restrictive for all to authenticated using ((select public.has_modulo(%L))) with check ((select public.has_modulo(%L)))',
      'modulo_' || v_slug, p_tabla, v_slug, v_slug);
  end loop;
end;
$$;

-- Solo el dueño: ningún rol de la API la llama
revoke execute on function public.aplicar_politica_modulo(regclass, text[]) from public, anon, authenticated, service_role;

-- Consumo para Administración → Módulos (solo administrador). Las partes de
-- archivos que aún no existen (IA, uso) salen null.
create or replace function public.modulos_consumo()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tz text;
  v_hoy timestamptz;
  v jsonb;
  v_n numeric;
  v_m numeric;
begin
  -- La service role la usa revision-seguridad para el aviso de consumo > 80 %
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'modulos_consumo: solo un administrador' using errcode = '42501';
  end if;

  select i.zona_horaria into v_tz from public.instalacion i where i.id = 1;
  v_hoy := date_trunc('day', now() at time zone coalesce(v_tz, 'America/Bogota')) at time zone coalesce(v_tz, 'America/Bogota');

  v := jsonb_build_object(
    'miembros', (select count(*) from public.profiles p where not p.es_servicio),
    'almacenamiento_mb', null, 'ia_hoy', null, 'ia_ultima_hora', null, 'uso_filas', null);

  if to_regclass('storage.objects') is not null then
    select round(coalesce(sum(case when jsonb_typeof(o.metadata -> 'size') = 'number'
                                   then (o.metadata ->> 'size')::numeric else 0 end), 0) / 1048576.0, 1)
      into v_n from storage.objects o;
    v := v || jsonb_build_object('almacenamiento_mb', v_n);
  end if;

  if to_regclass('public.ai_usage') is not null then
    execute 'select count(*) filter (where created_at >= $1), count(*) filter (where created_at >= now() - interval ''1 hour'')
               from public.ai_usage where created_at >= least($1, now() - interval ''1 hour'')'
      into v_n, v_m using v_hoy;
    v := v || jsonb_build_object('ia_hoy', v_n, 'ia_ultima_hora', v_m);
  end if;

  if to_regclass('public.portal_uso') is not null then
    execute 'select count(*) from public.portal_uso' into v_n;
    v := v || jsonb_build_object('uso_filas', v_n);
  end if;

  return v;
end;
$$;

revoke execute on function public.modulos_consumo() from public, anon;
grant execute on function public.modulos_consumo() to authenticated, service_role;

-- ============ 5) Límite de miembros (respaldo) ============
-- La función invitar-miembro valida antes y responde 409 'limite_miembros';
-- este trigger es el respaldo para fallar cerrado. No cuentan las cuentas
-- de servicio: ni las que ya tienen es_servicio ni la que se está creando
-- con app_metadata.es_servicio = true (solo la fija la service role), que
-- queda con es_servicio aunque no haya límite.
-- Es diferido (corre al confirmar la transacción del alta): la API Admin de
-- Auth inserta el usuario solo con provider y providers y escribe el
-- app_metadata del cuerpo después, con un UPDATE en la misma transacción;
-- un trigger inmediato no vería es_servicio. Al confirmar, el perfil nuevo
-- ya está contado: el cupo se pasa si hay más miembros que el límite.
create or replace function public.profiles_limite_miembros()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limite bigint;
  v_n bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = new.id and not p.es_servicio) then
    return null;
  end if;
  if exists (select 1 from auth.users u
              where u.id = new.id and coalesce(u.raw_app_meta_data ->> 'es_servicio', '') = 'true') then
    update public.profiles set es_servicio = true where id = new.id;
    return null;
  end if;
  v_limite := public.limite_modulo('nucleo', 'miembros');
  if v_limite is null then
    return null;
  end if;
  -- Dos altas a la vez no pasan las dos con el último cupo
  perform pg_advisory_xact_lock(hashtext('profiles_limite_miembros'));
  select count(*) into v_n from public.profiles p where not p.es_servicio;
  if v_n > v_limite then
    raise exception 'limite_miembros: la instalación admite % miembros', v_limite
      using errcode = 'P0001', hint = 'Sube nucleo.miembros con tools/instalar/modulos.mjs --limites';
  end if;
  return null;
end;
$$;

revoke execute on function public.profiles_limite_miembros() from public, anon, authenticated;

drop trigger if exists profiles_limite_miembros on public.profiles;
create constraint trigger profiles_limite_miembros
  after insert on public.profiles
  deferrable initially deferred
  for each row execute function public.profiles_limite_miembros();

-- exigir_mfa en instalacion y modulos_instalacion (03-mfa)
select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(t, ', ') into v
    from unnest(array['public.instalacion', 'public.modulos_instalacion']) t
   where to_regclass(t) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass(t))
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = split_part(t, '.', 2)
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '04-instalacion-modulos: tablas sin crear, sin RLS o sin exigir_mfa: %', v;
  end if;

  if exists (select 1 from pg_catalog.pg_policies p
              where p.schemaname = 'public' and p.tablename = 'modulos_instalacion'
                and p.permissive = 'PERMISSIVE' and p.cmd <> 'SELECT')
     or has_table_privilege('authenticated', 'public.modulos_instalacion', 'insert')
     or has_table_privilege('authenticated', 'public.modulos_instalacion', 'update')
     or has_table_privilege('authenticated', 'public.modulos_instalacion', 'delete')
     or has_table_privilege('anon', 'public.modulos_instalacion', 'select') then
    raise exception '04-instalacion-modulos: modulos_instalacion admite escritura de la API';
  end if;

  if has_table_privilege('authenticated', 'public.instalacion', 'insert')
     or has_table_privilege('authenticated', 'public.instalacion', 'delete')
     or has_table_privilege('anon', 'public.instalacion', 'select') then
    raise exception '04-instalacion-modulos: grants de más en instalacion';
  end if;

  if not exists (select 1 from public.instalacion where id = 1)
     or not exists (select 1 from public.modulos_instalacion where slug = 'nucleo' and activo)
     or not public.has_modulo('nucleo') then
    raise exception '04-instalacion-modulos: falta la fila de instalacion o nucleo activo';
  end if;

  if public.zona_horaria_valida('Bogota') or not public.zona_horaria_valida('America/Bogota') then
    raise exception '04-instalacion-modulos: zona_horaria_valida no filtra zonas';
  end if;

  if public.tema_valido('{"--pal-base-0": "#FFFFFF"}') or public.tema_valido('{"--otra": "#ffffff"}')
     or public.tema_valido('{"--pal-base-0": "red; x: y"}') or not public.tema_valido('{"--pal-base-0": "#ffffff"}') then
    raise exception '04-instalacion-modulos: tema_valido no filtra claves o valores';
  end if;

  if has_function_privilege('authenticated', 'public.aplicar_politica_modulo(regclass,text[])', 'execute')
     or has_function_privilege('service_role', 'public.aplicar_politica_modulo(regclass,text[])', 'execute')
     or has_function_privilege('anon', 'public.has_modulo(text)', 'execute')
     or has_function_privilege('anon', 'public.modulos_consumo()', 'execute') then
    raise exception '04-instalacion-modulos: EXECUTE de más en las funciones de módulo';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'profiles_limite_miembros' and tgrelid = 'public.profiles'::regclass
                    and tgdeferrable and tginitdeferred)
     or not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'auditar_modulo' and tgrelid = 'public.modulos_instalacion'::regclass) then
    raise exception '04-instalacion-modulos: faltan los triggers profiles_limite_miembros o auditar_modulo';
  end if;
end $$;

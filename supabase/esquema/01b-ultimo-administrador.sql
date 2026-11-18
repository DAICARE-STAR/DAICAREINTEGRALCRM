-- ============================================================
-- 01b-ultimo-administrador.sql — Núcleo: la instalación no queda sin
-- administrador (BL-10)
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo. Lleva letra para
-- no renumerar: en una instalación hecha se aplica después de 09; en una
-- nueva, entre 01 y 02 (solo necesita 00-base.sql).
--
-- Antes de este archivo nada lo impedía en la base: un administrador podía
-- quitarse su propio rol admin por la API (la pantalla Miembros solo lo
-- bloquea en el navegador), y la service role, el SQL Editor o la baja de
-- un usuario en Auth (cae en cascada a profiles y user_roles) podían dejar
-- la instalación sin ningún administrador.
--
-- Administrador real: fila de user_roles con role = 'admin' cuyo perfil no
-- tiene es_servicio (una cuenta de servicio no administra por el cliente).
-- La cuenta admin de tools/instalar/cuentas-prueba.mjs no lleva es_servicio
-- y cuenta como administrador real: mientras exista, se puede retirar al
-- último administrador humano del cliente. Por eso se borra antes de
-- entregar la instalación (HANDOFF).
--
-- Lo que no cubre: solo mira filas borradas o cambiadas en user_roles y
-- profiles. Bloquear al último administrador en Auth (banned_until) o darlo
-- de baja con el borrado suave de la API Admin (deleted_at, sin borrar la
-- fila) no pasa por aquí y lo deja sin poder entrar.
--
-- Reglas, para todos (también la service role, el instalador y el SQL
-- Editor):
--   · con sesión, nadie se quita su propio rol admin ni borra su perfil
--   · no se quita, mueve, borra ni vacía (TRUNCATE) el admin del último
--     administrador real, ni se marca es_servicio su perfil
-- Siguen permitidos: dar admin, quitárselo a quien no es el último y
-- borrar cuentas (también la admin de cuentas-prueba.mjs) mientras quede
-- otro administrador real. Para retirar al último, primero se da admin a
-- otra cuenta.
--
-- Requisitos: 00-base.sql aplicado; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                    | Qué                                                        |
--   |---------------------------|------------------------------------------------------------|
--   | quedan_otros_admins(uuid) | ¿queda otro administrador real? (solo el dueño la ejecuta) |
--   | guarda_ultimo_admin       | trigger de user_roles: update, delete y truncate           |
--   | guarda_perfil_admin       | trigger de profiles: delete y update de es_servicio        |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '01b-ultimo-administrador detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('public.user_roles') is null or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin(uuid)') is null then
    raise exception '01b-ultimo-administrador detenido: falta 00-base.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'es_servicio') then
    raise exception '01b-ultimo-administrador detenido: profiles.es_servicio no existe (00-base.sql incompleto)';
  end if;
end $$;

-- ============ 1) ¿Queda otro administrador real? ============
-- p_excluir null = cualquiera. Dos bajas simultáneas no deben verse una a
-- la otra como la que queda: el candado de la transacción las pone en fila
-- y la segunda vuelve a mirar después de que la primera termina (lectura
-- confirmada, la de la API).
create or replace function public.quedan_otros_admins(p_excluir uuid)
returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles admin'));
  return exists (
    select 1
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
     where ur.role = 'admin'
       and not p.es_servicio
       and ur.user_id is distinct from p_excluir
  );
end;
$$;

-- Solo el dueño: la llaman los triggers de abajo, que corren como él
revoke execute on function public.quedan_otros_admins(uuid) from public, anon, authenticated;

-- ============ 2) user_roles: el propio admin y el último ============
create or replace function public.guarda_ultimo_admin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'TRUNCATE' then
    if public.quedan_otros_admins(null) then
      raise exception 'No se puede vaciar la tabla de roles: la instalación quedaría sin administrador'
        using errcode = '42501', hint = 'ultimo_admin';
    end if;
    return null;
  end if;

  -- Solo cuenta la fila que deja de dar admin a su usuario
  if old.role <> 'admin'
     or (tg_op = 'UPDATE' and new.role = 'admin' and new.user_id = old.user_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if auth.uid() is not null and old.user_id = auth.uid() then
    raise exception 'No puedes quitarte tu propio rol de administrador: pídeselo a otro administrador'
      using errcode = '42501', hint = 'admin_propio';
  end if;

  if not public.quedan_otros_admins(old.user_id) then
    raise exception 'Es el último administrador: asigna el rol admin a otra persona antes de quitárselo o de borrar su cuenta'
      using errcode = '42501', hint = 'ultimo_admin';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.guarda_ultimo_admin() from public, anon, authenticated;

-- También en las bajas en cascada (Auth → profiles → user_roles)
drop trigger if exists user_roles_ultimo_admin on public.user_roles;
create trigger user_roles_ultimo_admin
  before update or delete on public.user_roles
  for each row execute function public.guarda_ultimo_admin();

drop trigger if exists user_roles_ultimo_admin_vaciar on public.user_roles;
create trigger user_roles_ultimo_admin_vaciar
  before truncate on public.user_roles
  for each statement execute function public.guarda_ultimo_admin();

-- ============ 3) profiles: borrarse y marcar como servicio ============
-- La baja del último administrador la frena la cascada a user_roles. Aquí:
-- nadie con sesión borra su propio perfil, y es_servicio (que solo cambian
-- la service role o el SQL Editor, guard_profile_role) no se pone al último
-- administrador real, porque dejaría de contar. Corre después de
-- profiles_guard_role (orden alfabético), con el valor ya frenado.
create or replace function public.guarda_perfil_admin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.id = auth.uid() then
      raise exception 'No puedes borrar tu propia cuenta: pídeselo a un administrador'
        using errcode = '42501', hint = 'borrar_propio';
    end if;
    return old;
  end if;

  if new.es_servicio and not old.es_servicio
     and public.is_admin(old.id) and not public.quedan_otros_admins(old.id) then
    raise exception 'Es el último administrador: no se puede marcar como cuenta de servicio'
      using errcode = '42501', hint = 'ultimo_admin';
  end if;
  return new;
end;
$$;

revoke execute on function public.guarda_perfil_admin() from public, anon, authenticated;

drop trigger if exists profiles_ultimo_admin on public.profiles;
create trigger profiles_ultimo_admin
  before update of es_servicio or delete on public.profiles
  for each row execute function public.guarda_perfil_admin();

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(n.nombre, ', ') into v
    from unnest(array['user_roles_ultimo_admin', 'user_roles_ultimo_admin_vaciar']) as n(nombre)
   where not exists (select 1 from pg_catalog.pg_trigger x
                      where x.tgname = n.nombre and x.tgrelid = 'public.user_roles'::regclass);
  if v is not null then
    raise exception '01b-ultimo-administrador: faltan triggers en user_roles: %', v;
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgname = 'profiles_ultimo_admin' and tgrelid = 'public.profiles'::regclass) then
    raise exception '01b-ultimo-administrador: falta el trigger profiles_ultimo_admin';
  end if;

  if has_function_privilege('authenticated', 'public.quedan_otros_admins(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.guarda_ultimo_admin()', 'execute')
     or has_function_privilege('authenticated', 'public.guarda_perfil_admin()', 'execute') then
    raise exception '01b-ultimo-administrador: funciones de la guarda ejecutables por authenticated';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if v is not null then
    raise exception '01b-ultimo-administrador: funciones security definer ejecutables por anon: %', v;
  end if;
end $$;

-- ============================================================
-- 03-mfa.sql — Núcleo: verificación en dos pasos con dientes
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 12b1b72, solo lectura): migraciones 43, 63 §8 y 64 §8.
-- El bloque que la 43 pedía re-ejecutar a mano es aquí la función
-- aplicar_exigir_mfa(), que el instalador llama al final de cada corrida:
-- así toda tabla nueva (de un archivo del núcleo o de un módulo) recibe la
-- política sin que nadie lo recuerde.
--
-- La MFA es opcional (decisión cerrada): quien no activó un segundo factor
-- no se ve afectado; quien lo activó no toca datos con una sesión de solo
-- contraseña (aal1), ni atacando la API REST directamente.
--
-- Requisitos: 00-base.sql aplicado; tabla auth.mfa_factors de Supabase.
-- Ejecutarlo como postgres. El bloque 0 aborta sin cambiar nada si falta.
--
-- Efectos:
--   | Objeto                 | Qué                                                         |
--   |------------------------|-------------------------------------------------------------|
--   | mfa_ok()               | true sin factor verificado o con sesión aal2                |
--   | aplicar_exigir_mfa()   | crea la política restrictiva exigir_mfa en toda tabla de    |
--   |                        | public y en storage.objects que no la tenga; devuelve       |
--   |                        | cuántas creó. Solo la ejecuta el dueño (el instalador)      |
--   | exigir_mfa             | en las tablas de 00 a 02 y en storage.objects               |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '03-mfa detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('auth.mfa_factors') is null then
    raise exception '03-mfa detenido: falta auth.mfa_factors de Supabase';
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null then
    raise exception '03-mfa detenido: falta 00-base.sql';
  end if;
end $$;

-- ============ 1) ¿La sesión cumple el nivel MFA que le corresponde? ============
-- security definer: lee auth.mfa_factors, que los usuarios no ven.
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors
         where user_id = auth.uid()
           and status = 'verified'
      );
$$;

revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- ============ 2) Política restrictiva en toda tabla que no la tenga ============
-- Solo aplica a authenticated: anon y service_role no pasan por aquí. No
-- reescribe una política exigir_mfa que ya exista. Sin security definer:
-- crear políticas exige ser dueño de la tabla, así que solo funciona para
-- quien instala.
create or replace function public.aplicar_exigir_mfa()
returns integer language plpgsql set search_path = public, pg_temp as $$
declare
  t record;
  v_n integer := 0;
begin
  for t in
    select c.relname
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_catalog.pg_policies p
                        where p.schemaname = 'public' and p.tablename = c.relname
                          and p.policyname = 'exigir_mfa')
     order by c.relname
  loop
    execute format(
      'create policy exigir_mfa on public.%I as restrictive for all to authenticated using ((select public.mfa_ok()))',
      t.relname);
    v_n := v_n + 1;
  end loop;

  if to_regclass('storage.objects') is not null
     and not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'storage' and p.tablename = 'objects'
                        and p.policyname = 'exigir_mfa') then
    execute 'create policy exigir_mfa on storage.objects as restrictive for all to authenticated using ((select public.mfa_ok()))';
    v_n := v_n + 1;
  end if;

  return v_n;
end;
$$;

-- Solo el dueño: ningún rol de la API la llama
revoke execute on function public.aplicar_exigir_mfa() from public, anon, authenticated, service_role;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '03-mfa: tablas de public sin exigir_mfa restrictiva: %', v;
  end if;

  if to_regclass('storage.objects') is not null
     and not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'storage' and p.tablename = 'objects'
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE') then
    raise exception '03-mfa: storage.objects sin exigir_mfa restrictiva';
  end if;

  if has_function_privilege('authenticated', 'public.aplicar_exigir_mfa()', 'execute')
     or has_function_privilege('anon', 'public.mfa_ok()', 'execute') then
    raise exception '03-mfa: EXECUTE de más en aplicar_exigir_mfa() o mfa_ok()';
  end if;
end $$;

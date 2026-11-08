-- ============================================================
-- 06-avisos.sql — Núcleo: suscripciones Web Push y avisos personales
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 9d1524b, solo lectura): migraciones 12
-- (push_subscriptions), 24, 27, 36, 47 y 63 §4 (user_notifications y
-- push_notification en su versión final). Diferencias con team-portal:
--   · user_notifications no trae project_id ni subtask_id, que apuntan a
--     tablas del módulo proyectos; push_notification pierde esos dos
--     argumentos y el enlace por defecto es '/'.
--   · authenticated solo actualiza la columna read (marcar leído); en
--     team-portal podía reescribir título, cuerpo y enlace de los suyos.
--   · Los claim_* de team-portal (claim_due_event_reminders,
--     claim_unnotified_site_leads) leen tablas de calendario y sitio web:
--     llegan con el archivo de su módulo.
--
-- Requisitos: 00 a 04 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto               | Qué                                                         |
--   |----------------------|-------------------------------------------------------------|
--   | push_subscriptions   | una fila por navegador suscrito; cada quien gestiona las    |
--   |                      | suyas; el envío lo hace la service role                     |
--   | user_notifications   | avisos por destinatario con enlace interno; cada quien lee, |
--   |                      | marca leídos y borra los suyos (un administrador lee todos);|
--   |                      | nadie inserta por la API                                    |
--   | push_notification()  | alta de un aviso para los triggers de los módulos; no avisa |
--   |                      | al propio actor; solo el dueño la ejecuta                   |
--   | supabase_realtime    | user_notifications publicada (la campana reacciona), si     |
--   |                      | existe la publicación                                       |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '06-avisos detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regclass('public.profiles') is null then
    raise exception '06-avisos detenido: falta 00-base.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '06-avisos detenido: falta 03-mfa.sql';
  end if;
  if to_regclass('public.instalacion') is null then
    raise exception '06-avisos detenido: falta 04-instalacion-modulos.sql';
  end if;
end $$;

-- ============ 1) Suscripciones Web Push (12) ============
-- endpoint es la URL única que asigna el servicio de push del navegador;
-- p256dh y auth son las claves de cifrado de esa suscripción.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null
    constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://[^[:space:]]{1,1000}$'),
  p256dh text not null constraint push_subscriptions_p256dh_check check (char_length(p256dh) <= 200),
  auth text not null constraint push_subscriptions_auth_check check (char_length(auth) <= 200),
  created_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============ 2) Avisos personales (24, 27, 36, 47 y 63) ============
-- link: ruta interna del portal ("/" y una letra; nunca "//host" ni una
-- URL absoluta): NotifSections lo abre con <Link>.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'sistema'
    constraint user_notifications_kind_check
    check (kind in ('subtarea', 'asignacion', 'proyecto', 'sistema', 'lead', 'evento')),
  title text not null constraint user_notifications_title_check check (char_length(title) between 1 and 160),
  body text not null default '' constraint user_notifications_body_check check (char_length(body) <= 600),
  link text not null default '/'
    constraint user_notifications_link_interno check (link = '/' or link ~ '^/[A-Za-z]'),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx
  on public.user_notifications (user_id, read, created_at desc);

alter table public.user_notifications enable row level security;

-- Sin insert para la API: los avisos los crean push_notification (triggers
-- de los módulos) y las funciones con la service role
revoke all on table public.user_notifications from anon, authenticated;
grant select, delete on table public.user_notifications to authenticated;
grant update (read) on table public.user_notifications to authenticated;
grant all on table public.user_notifications to service_role;

drop policy if exists user_notifications_select on public.user_notifications;
create policy user_notifications_select on public.user_notifications
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists user_notifications_update on public.user_notifications;
create policy user_notifications_update on public.user_notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_notifications_delete on public.user_notifications;
create policy user_notifications_delete on public.user_notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============ 3) Alta de avisos para los triggers (36) ============
-- Salta la RLS (security definer). No avisa al propio actor.
create or replace function public.push_notification(
  p_user uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_link text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null then return; end if;
  if p_actor is not null and p_user = p_actor then return; end if;
  insert into public.user_notifications (user_id, actor_id, kind, title, body, link)
  values (p_user, p_actor, p_kind, left(p_title, 160), left(coalesce(p_body, ''), 600), coalesce(p_link, '/'));
end;
$$;

-- Solo el dueño y los triggers: un miembro no avisa a otro
revoke execute on function public.push_notification(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ============ 4) Realtime (24) ============
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_catalog.pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end $$;

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(t, ', ') into v
    from unnest(array['public.push_subscriptions', 'public.user_notifications']) t
   where to_regclass(t) is null
      or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass(t))
      or not exists (select 1 from pg_catalog.pg_policies p
                      where p.schemaname = 'public' and p.tablename = split_part(t, '.', 2)
                        and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE');
  if v is not null then
    raise exception '06-avisos: tablas sin crear, sin RLS o sin exigir_mfa: %', v;
  end if;

  if has_table_privilege('authenticated', 'public.user_notifications', 'insert')
     or exists (select 1 from pg_catalog.pg_policies p
                 where p.schemaname = 'public' and p.tablename = 'user_notifications' and p.cmd in ('INSERT', 'ALL')
                   and p.permissive = 'PERMISSIVE')
     or has_column_privilege('authenticated', 'public.user_notifications', 'title', 'update')
     or has_table_privilege('anon', 'public.user_notifications', 'select')
     or has_table_privilege('anon', 'public.push_subscriptions', 'select') then
    raise exception '06-avisos: grants o políticas de más en user_notifications o push_subscriptions';
  end if;

  if has_function_privilege('authenticated', 'public.push_notification(uuid,uuid,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.push_notification(uuid,uuid,text,text,text,text)', 'execute') then
    raise exception '06-avisos: push_notification ejecutable por la API';
  end if;
end $$;

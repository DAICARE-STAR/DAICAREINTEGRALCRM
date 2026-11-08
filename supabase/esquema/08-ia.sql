-- ============================================================
-- 08-ia.sql — Núcleo: registro de consumo de IA
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 9d1524b, solo lectura): ai_usage de la migración 28,
-- sin project_reports (módulo proyectos), sin la cola de trabajos de la 68
-- ni la memoria RAG de la 61 (la IA del producto es Gemini desde las
-- funciones, PP-DEC-03).
--
-- Una fila por llamada a la IA: la escriben las funciones con la service
-- role (registrarUsoIA de netlify/lib/gemini.mts); la lee solo un
-- administrador (consumo y costos). modulos_consumo() (04) la cuenta para
-- los límites ia.ia_hora_miembro e ia.ia_dia_equipo.
--
-- Requisitos: 00 a 04 aplicados; ejecutarlo como postgres. El bloque 0
-- aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                 | Qué                                                     |
--   |------------------------|---------------------------------------------------------|
--   | ai_usage               | función, modelo, tokens y miembro de cada llamada       |
--   | ai_usage_created_idx,  | consumo del día y de la última hora, en total y por     |
--   | ai_usage_user_idx      | miembro                                                 |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '08-ia detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null or to_regclass('public.profiles') is null then
    raise exception '08-ia detenido: falta 00-base.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '08-ia detenido: falta 03-mfa.sql';
  end if;
  if to_regprocedure('public.modulos_consumo()') is null then
    raise exception '08-ia detenido: falta 04-instalacion-modulos.sql';
  end if;
end $$;

-- ============ 1) Consumo de IA (28) ============
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  -- slug de la función que llamó: 'correo-resumen', 'reporte', …
  feature text not null constraint ai_usage_feature_check check (char_length(feature) between 1 and 60),
  model text constraint ai_usage_model_check check (char_length(model) <= 80),
  tokens_in int not null default 0 constraint ai_usage_tokens_in_check check (tokens_in >= 0),
  tokens_out int not null default 0 constraint ai_usage_tokens_out_check check (tokens_out >= 0),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Escriben solo las funciones (service role); ningún miembro inserta
revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;
grant all on table public.ai_usage to service_role;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using ((select public.is_admin()));

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
begin
  if to_regclass('public.ai_usage') is null
     or not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.ai_usage'::regclass)
     or not exists (select 1 from pg_catalog.pg_policies p
                     where p.schemaname = 'public' and p.tablename = 'ai_usage'
                       and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE') then
    raise exception '08-ia: ai_usage sin crear, sin RLS o sin exigir_mfa';
  end if;

  if has_table_privilege('authenticated', 'public.ai_usage', 'insert')
     or has_table_privilege('authenticated', 'public.ai_usage', 'update')
     or has_table_privilege('authenticated', 'public.ai_usage', 'delete')
     or has_table_privilege('anon', 'public.ai_usage', 'select') then
    raise exception '08-ia: grants de más en ai_usage';
  end if;

  if exists (select 1 from pg_catalog.pg_policies p
              where p.schemaname = 'public' and p.tablename = 'ai_usage'
                and p.permissive = 'PERMISSIVE' and p.cmd <> 'SELECT') then
    raise exception '08-ia: ai_usage con políticas de escritura';
  end if;
end $$;

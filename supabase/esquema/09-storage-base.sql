-- ============================================================
-- 09-storage-base.sql — Núcleo: buckets de marca y avatares y tope de
-- almacenamiento de la instalación
-- Esquema consolidado del producto (PP-DEC-02). Lo aplica
-- tools/instalar/aplicar.mjs en una transacción. IDEMPOTENTE. Un archivo
-- aplicado no se edita: un cambio va en un archivo nuevo.
--
-- Origen (team-portal 9d1524b, solo lectura): políticas por carpeta propia
-- del avatar (migración 19), lectura acotada (89) y lección de la 84: un
-- bucket público sirve sus archivos por /object/public/ sin pasar por la
-- RLS, así que ninguna política SELECT lleva «bucket_id = '…'» a secas ni
-- va a anon (eso deja listar el bucket entero). Diferencias con
-- team-portal: los avatares tienen su bucket (allí iban en blog/avatars/) y
-- la carpeta es directamente el id del miembro; los logos de la
-- instalación van al bucket marca.
--
-- Tope de almacenamiento (PP-ALM): una política restrictiva de INSERT en
-- storage.objects suma el tamaño de todos los objetos y lo compara con
-- nucleo.almacenamiento_mb. Sin límite (null), no frena. Frena la subida
-- siguiente a la que pasó el tope: al insertar la fila, Storage todavía no
-- conoce el tamaño del archivo nuevo. La service role no pasa por la RLS.
-- Si la suma tarda más de 50 ms (medirlo con el plan de la consulta en una
-- instalación grande), pasa a una caché.
--
-- Requisitos: 00 a 04 aplicados; el esquema storage de Supabase
-- (storage.buckets, storage.objects, storage.foldername). Ejecutarlo como
-- postgres. El bloque 0 aborta sin cambiar nada si falta algo.
--
-- Efectos:
--   | Objeto                       | Qué                                                 |
--   |------------------------------|-----------------------------------------------------|
--   | bucket marca                 | público, imágenes ≤ 5 MB; sin SELECT; sube solo un  |
--   |                              | administrador (nombres únicos, sin reemplazo)       |
--   | bucket avatares              | público, imágenes ≤ 5 MB sin SVG; cada miembro ve,  |
--   |                              | sube, reemplaza y borra solo en avatares/<su id>/   |
--   | almacenamiento_disponible()  | true sin límite o si lo usado está bajo el tope     |
--   | tope_almacenamiento          | política restrictiva de INSERT en storage.objects   |
-- ============================================================

-- ============ 0) Requisitos: se detiene antes de cambiar nada ============
do $$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    raise exception '09-storage-base detenido: se ejecuta como postgres, no como %', current_user;
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
     or to_regprocedure('storage.foldername(text)') is null then
    raise exception '09-storage-base detenido: falta el esquema storage de Supabase (buckets, objects, foldername)';
  end if;
  if to_regprocedure('public.is_admin(uuid)') is null then
    raise exception '09-storage-base detenido: falta 00-base.sql';
  end if;
  if to_regprocedure('public.aplicar_exigir_mfa()') is null then
    raise exception '09-storage-base detenido: falta 03-mfa.sql';
  end if;
  if to_regprocedure('public.limite_modulo(text,text)') is null then
    raise exception '09-storage-base detenido: falta 04-instalacion-modulos.sql';
  end if;
end $$;

-- ============ 1) Buckets ============
-- Si ya existen no se pisan: la verificación del final exige que sean públicos.
-- marca admite también fuentes .woff2 y .woff (sección Tema, src/lib/fuentes.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('marca', 'marca', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'font/woff2', 'font/woff']),
  ('avatares', 'avatares', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- ============ 2) Marca: sube solo un administrador ============
-- Sin SELECT: los logos se sirven por la URL pública. Sin UPDATE ni DELETE:
-- sin SELECT no tendrían efecto por la API; cada logo nuevo lleva nombre único.
drop policy if exists "admin sube a marca" on storage.objects;
create policy "admin sube a marca"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'marca' and (select public.is_admin()));

-- ============ 3) Avatares: solo la carpeta propia (19 y 89) ============
drop policy if exists "usuario ve sus avatares" on storage.objects;
create policy "usuario ve sus avatares"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "usuario sube su avatar" on storage.objects;
create policy "usuario sube su avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "usuario reemplaza su avatar" on storage.objects;
create policy "usuario reemplaza su avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "usuario borra su avatar" on storage.objects;
create policy "usuario borra su avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============ 4) Tope de almacenamiento (PP-ALM) ============
-- security definer: suma todos los objetos, también los que el miembro no ve
create or replace function public.almacenamiento_disponible()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when public.limite_modulo('nucleo', 'almacenamiento_mb') is null then true
           else coalesce((select sum(case when jsonb_typeof(o.metadata -> 'size') = 'number'
                                          then (o.metadata ->> 'size')::numeric else 0 end)
                            from storage.objects o), 0)
                < public.limite_modulo('nucleo', 'almacenamiento_mb')::numeric * 1048576
         end;
$$;

revoke execute on function public.almacenamiento_disponible() from public, anon;
grant execute on function public.almacenamiento_disponible() to authenticated;

drop policy if exists tope_almacenamiento on storage.objects;
create policy tope_almacenamiento
  on storage.objects as restrictive for insert to authenticated
  with check ((select public.almacenamiento_disponible()));

select public.aplicar_exigir_mfa();

notify pgrst, 'reload schema';

-- ============ Verificación: aborta el archivo si algo no quedó ============
do $$
declare v text;
begin
  select string_agg(b, ', ') into v
    from unnest(array['marca', 'avatares']) b
   where not exists (select 1 from storage.buckets k where k.id = b and k.public);
  if v is not null then
    raise exception '09-storage-base: buckets sin crear o no públicos: %', v;
  end if;

  -- Ninguna SELECT de storage.objects para anon ni sin acotar a una carpeta o un permiso
  select string_agg(p.policyname, ', ' order by p.policyname) into v
    from pg_catalog.pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.cmd in ('SELECT', 'ALL') and p.permissive = 'PERMISSIVE'
     and ('anon' = any (p.roles) or 'public' = any (p.roles)
          or p.qual ~ '^\(?bucket_id = ''[^'']+''::text\)?$');
  if v is not null then
    raise exception '09-storage-base: políticas SELECT que dejan listar un bucket: %', v;
  end if;

  if not exists (select 1 from pg_catalog.pg_policies p
                  where p.schemaname = 'storage' and p.tablename = 'objects'
                    and p.policyname = 'tope_almacenamiento' and p.permissive = 'RESTRICTIVE' and p.cmd = 'INSERT')
     or not exists (select 1 from pg_catalog.pg_policies p
                  where p.schemaname = 'storage' and p.tablename = 'objects'
                    and p.policyname = 'exigir_mfa' and p.permissive = 'RESTRICTIVE') then
    raise exception '09-storage-base: storage.objects sin tope_almacenamiento o sin exigir_mfa restrictivas';
  end if;

  if has_function_privilege('anon', 'public.almacenamiento_disponible()', 'execute') then
    raise exception '09-storage-base: almacenamiento_disponible ejecutable por anon';
  end if;
end $$;

import type {
  BlogPost,
  Connector,
  Marca,
  MarcaTasa,
  PortalApp,
  PortalWidget,
  Profile,
  Role,
  RoleDef,
  SiteBrand,
  SiteLead,
  SiteNotice,
  SiteProject,
} from '../types'
import { supabase } from './supabase'

// roles = null o [] significa visible para cualquier usuario autenticado.
// El filtrado real de seguridad ocurre en las políticas RLS de Supabase;
// esto solo evita mostrar accesos que el backend igualmente denegaría.
// Cada entrada del gate puede ser un NOMBRE DE ROL o una CLAVE DE PERMISO
// (app_<slug> / herr_<slug>): así la visibilidad se otorga desde la matriz
// de Roles como cualquier otro permiso, y los roles-visor van quedando
// obsoletos sin romper nada durante la transición.
export function visibleForRole<T extends { roles: Role[] | null }>(
  items: T[],
  userRoles: string[] | null,
  userPerms: string[] | null = null
): T[] {
  const roles = userRoles ?? []
  const perms = userPerms ?? []
  const isAdmin = roles.includes('admin')
  return items.filter(
    (item) =>
      !item.roles ||
      item.roles.length === 0 ||
      isAdmin ||
      item.roles.some((r) => roles.includes(r) || perms.includes(r))
  )
}

// Clave de permiso de visibilidad de una herramienta (los conectores no
// tienen slug propio: se deriva del nombre; renombrar la herramienta
// implica reasignar su permiso en Roles)
export function toolPermKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return 'herr_' + slug
}

export async function fetchApps(): Promise<PortalApp[]> {
  const { data, error } = await supabase
    .from('portal_apps')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as PortalApp[]
}

export async function fetchConnectors(): Promise<Connector[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Connector[]
}

// ============================================================
// Funciones de administración (requieren rol admin; RLS las
// bloquea para cualquier otro usuario aunque llame a la API)
// ============================================================

export type PortalAppInput = Omit<PortalApp, 'id'>
export type ConnectorInput = Omit<Connector, 'id'>

// Con RLS, un update/delete sin permisos no da error: afecta 0 filas.
// Pedimos las filas afectadas con .select() para detectarlo.
function assertAffected(rows: unknown[] | null) {
  if (!rows || rows.length === 0) {
    throw new Error('La operación no afectó ninguna fila (¿permisos insuficientes?)')
  }
}

interface ProfileRolesRow {
  id: string
  full_name: string | null
  role: string
  user_roles?: { role: string }[] | null
}

export async function fetchProfiles(): Promise<Profile[]> {
  // Cada miembro con TODOS sus roles (multi-rol, migración 26). Reintenta sin
  // el join si la base aún no la tiene.
  const withRoles = await supabase
    .from('profiles')
    .select('id, full_name, role, user_roles ( role )')
    .order('full_name')
  if (!withRoles.error) {
    return ((withRoles.data ?? []) as ProfileRolesRow[]).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      avatar_url: null,
      role: p.role,
      roles: (p.user_roles ?? []).map((u) => u.role),
      permissions: [],
    }))
  }
  const plain = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')
  if (plain.error) throw plain.error
  return ((plain.data ?? []) as ProfileRolesRow[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    avatar_url: null,
    role: p.role,
    roles: p.role ? [p.role] : [],
    permissions: [],
  }))
}

// Asignar / quitar un rol a un miembro (multi-rol). RLS: solo admin.
export async function addUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('user_roles').insert({ user_id: userId, role })
  if (error) throw error
}

export async function removeUserRole(userId: string, role: Role): Promise<void> {
  const { data, error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role)
    .select('role')
  if (error) throw error
  assertAffected(data)
}

export async function fetchAllApps(): Promise<PortalApp[]> {
  const { data, error } = await supabase
    .from('portal_apps')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as PortalApp[]
}

export async function createApp(input: PortalAppInput): Promise<void> {
  const { error } = await supabase.from('portal_apps').insert(input)
  if (error) throw error
}

export async function updateApp(id: string, input: Partial<PortalAppInput>): Promise<void> {
  const { data, error } = await supabase
    .from('portal_apps')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function deleteApp(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('portal_apps')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function fetchAllConnectors(): Promise<Connector[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Connector[]
}

export async function createConnector(input: ConnectorInput): Promise<void> {
  const { error } = await supabase.from('connectors').insert(input)
  if (error) throw error
}

export async function updateConnector(
  id: string,
  input: Partial<ConnectorInput>
): Promise<void> {
  const { data, error } = await supabase
    .from('connectors')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function deleteConnector(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('connectors')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Blog público (empresa.test) — requiere permiso manage_blog
// ============================================================

export type BlogPostInput = Omit<
  BlogPost,
  'id' | 'published_at' | 'created_at' | 'updated_at'
>

export async function fetchAllPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BlogPost[]
}

export async function createPost(input: BlogPostInput): Promise<void> {
  const { error } = await supabase.from('blog_posts').insert(input)
  if (error) throw error
}

export async function updatePost(
  id: string,
  input: Partial<BlogPostInput>
): Promise<void> {
  const { data, error } = await supabase
    .from('blog_posts')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function deletePost(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

const BLOG_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024 // límite del bucket (tras compresión)
const INPUT_MAX_BYTES = 30 * 1024 * 1024
const RESIZE_MAX_PX = 1920
const RESIZE_QUALITY = 0.85
// Solo fotos: GIF (animación) y SVG (vectorial) se suben tal cual
const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Redimensiona a máx. 1920 px y convierte a WebP en el navegador.
// Si la conversión no reduce el peso (logos pequeños, PNG simples),
// conserva el archivo original.
async function compressImage(file: File): Promise<{ blob: Blob; type: string; toWebp: boolean }> {
  if (!COMPRESSIBLE_TYPES.includes(file.type)) {
    return { blob: file, type: file.type, toWebp: false }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, RESIZE_MAX_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file, type: file.type, toWebp: false }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', RESIZE_QUALITY)
    )
    if (!blob || blob.size >= file.size) {
      return { blob: file, type: file.type, toWebp: false }
    }
    return { blob, type: 'image/webp', toWebp: true }
  } catch {
    return { blob: file, type: file.type, toWebp: false }
  }
}

// Sube una imagen al bucket indicado (carpeta indicada) y devuelve su URL
// pública. Las políticas RLS de storage deciden quién sube. Cada uso figura
// en la lista de storage-usos.test.ts.
async function uploadSiteImage(file: File, folder: string, bucket: string): Promise<string> {
  if (!BLOG_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato no soportado: usa JPG, PNG, WebP, GIF o SVG')
  }
  if (file.size > INPUT_MAX_BYTES) {
    throw new Error('La imagen supera el límite de 30 MB')
  }
  const { blob, type, toWebp } = await compressImage(file)
  if (blob.size > BLOG_IMAGE_MAX_BYTES) {
    throw new Error('La imagen supera 5 MB incluso comprimida; usa una más liviana')
  }
  let clean = file.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80)
  if (toWebp) clean = clean.replace(/\.(jpe?g|png|webp)$/, '') + '.webp'
  const path = `${folder}/${Date.now()}-${clean}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    cacheControl: '31536000',
    contentType: type,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// Bucket blog: del módulo sitio-web (28-sitio-web.sql), no del núcleo
export function uploadBlogImage(file: File): Promise<string> {
  return uploadSiteImage(file, new Date().toISOString().slice(0, 10), 'blog')
}

export function uploadBrandLogo(file: File): Promise<string> {
  return uploadSiteImage(file, 'marcas', 'blog')
}

export function uploadProjectImage(file: File): Promise<string> {
  return uploadSiteImage(file, 'proyectos', 'blog')
}

// Avatar del usuario: va al bucket avatares, carpeta <userId>/… (la política
// de storage de 09-storage-base.sql exige que sea la del propio usuario).
export function uploadAvatar(file: File, userId: string): Promise<string> {
  return uploadSiteImage(file, userId, 'avatares')
}

// Actualiza el perfil propio (nombre visible, avatar y/o datos de firma
// del cotizador — migración 31). RLS + trigger garantizan que solo se
// toca la fila propia y nunca el rol.
export async function updateMyProfile(
  id: string,
  input: {
    full_name?: string | null
    avatar_url?: string | null
    cargo?: string
    telefono?: string
    oficina?: string
  }
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Proyectos de referencia — requiere permiso manage_projects
// ============================================================

export type SiteProjectInput = Omit<
  SiteProject,
  'id' | 'published_at' | 'created_at' | 'updated_at'
>

export async function fetchAllProjects(): Promise<SiteProject[]> {
  const { data, error } = await supabase
    .from('site_projects')
    .select('*')
    .order('sort_order')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SiteProject[]
}

export async function createProject(input: SiteProjectInput): Promise<void> {
  const { error } = await supabase.from('site_projects').insert(input)
  if (error) throw error
}

export async function updateProject(
  id: string,
  input: Partial<SiteProjectInput>
): Promise<void> {
  const { data, error } = await supabase
    .from('site_projects')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function deleteProject(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('site_projects')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Analítica del sitio — requiere permiso view_analytics
// (funciones SQL de la migración 41; agregan en hora de Colombia)
// ============================================================

export interface VisitasDia {
  dia: string
  visitas: number
  sesiones: number
}

export interface VisitasConteo {
  path?: string
  referrer?: string
  device?: string
  visitas: number
}

async function rpcVisitas<T>(fn: string, dias: number): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, { dias })
  if (error) throw error
  return (data ?? []) as T[]
}

export const fetchVisitasDiarias = (dias: number) => rpcVisitas<VisitasDia>('site_visits_daily', dias)
export const fetchVisitasPaginas = (dias: number) => rpcVisitas<VisitasConteo>('site_visits_pages', dias)
export const fetchVisitasReferentes = (dias: number) => rpcVisitas<VisitasConteo>('site_visits_referrers', dias)
export const fetchVisitasDispositivos = (dias: number) => rpcVisitas<VisitasConteo>('site_visits_devices', dias)

// Eventos de conversión del sitio (migración 60): clics de CTA y
// resultado del formulario, con las mismas reglas que las visitas
export interface EventoConteo {
  event: string
  total: number
  sesiones: number
}

export const fetchEventosConversion = (dias: number) =>
  rpcVisitas<EventoConteo>('site_events_summary', dias)

// ============================================================
// Bandeja de leads del sitio — requiere permiso manage_leads
// ============================================================

export async function fetchSiteLeads(): Promise<SiteLead[]> {
  const { data, error } = await supabase
    .from('site_leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SiteLead[]
}

// Cambios de gestión (estado y nota). handled_by queda en quien guardó.
export async function updateSiteLead(
  id: string,
  input: { status: SiteLead['status']; note: string | null }
): Promise<void> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id ?? null
  const { data, error } = await supabase
    .from('site_leads')
    .update({ ...input, handled_by: userId })
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Aviso técnico del sitio — requiere permiso manage_notice
// ============================================================

export type SiteNoticeInput = Omit<SiteNotice, 'id' | 'updated_at'>

// Fila única (id = 1). null = la migración 37 no está ejecutada.
export async function fetchSiteNotice(): Promise<SiteNotice | null> {
  const { data, error } = await supabase
    .from('site_notice')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data as SiteNotice | null
}

export async function saveSiteNotice(input: SiteNoticeInput): Promise<void> {
  const { error } = await supabase.from('site_notice').upsert({ id: 1, ...input })
  if (error) throw error
}

// ============================================================
// Portafolio de marcas del sitio — requiere permiso manage_brands
// ============================================================

export type SiteBrandInput = Omit<SiteBrand, 'id'>

export async function fetchAllBrands(): Promise<SiteBrand[]> {
  const { data, error } = await supabase
    .from('site_brands')
    .select('*')
    .order('sort_order')
    .order('name')
  if (error) throw error
  return (data ?? []) as SiteBrand[]
}

// Marcas activas para la sección "Marcas representadas" de Herramientas
// (visible para todo el equipo). RLS de site_brands permite lectura pública.
export async function fetchActiveBrands(): Promise<SiteBrand[]> {
  const { data, error } = await supabase
    .from('site_brands')
    .select('*')
    .eq('active', true)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return (data ?? []) as SiteBrand[]
}

export async function createBrand(input: SiteBrandInput): Promise<void> {
  const { error } = await supabase.from('site_brands').insert(input)
  if (error) throw error
}

export async function updateBrand(
  id: string,
  input: Partial<SiteBrandInput>
): Promise<void> {
  const { data, error } = await supabase
    .from('site_brands')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

export async function deleteBrand(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('site_brands')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// Corregir el nombre de un miembro desde Administración. RLS ya lo
// permite a un admin (y a manage_members sobre perfiles no-admin):
// política «gestores actualizan perfiles».
export async function updateMemberName(id: string, fullName: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Widgets del inicio (tabla portal_widgets, migración 30)
// ============================================================

// Configuración completa (pestaña Widgets del panel admin)
export async function fetchAllWidgets(): Promise<PortalWidget[]> {
  const { data, error } = await supabase
    .from('portal_widgets')
    .select('id, name, description, active, roles, sort_order')
    .order('sort_order')
    .order('id')
  if (error) throw error
  return (data ?? []) as PortalWidget[]
}

export async function updateWidget(
  id: string,
  input: Partial<Omit<PortalWidget, 'id'>>
): Promise<void> {
  const { data, error } = await supabase
    .from('portal_widgets')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Roles dinámicos
// ============================================================

export async function fetchRoles(): Promise<RoleDef[]> {
  // Ordenados por jerarquía (mayor position arriba). Reintenta sin las
  // columnas nuevas si la migración 26 aún no está aplicada.
  const withPos = await supabase
    .from('roles')
    .select('name, description, is_system, permissions, position, color')
    .order('position', { ascending: false })
    .order('name')
  if (!withPos.error) return (withPos.data ?? []) as RoleDef[]

  const plain = await supabase
    .from('roles')
    .select('name, description, is_system, permissions')
    .order('is_system', { ascending: false })
    .order('name')
  if (plain.error) throw plain.error
  return ((plain.data ?? []) as Omit<RoleDef, 'position' | 'color'>[]).map((r) => ({
    ...r,
    position: 0,
    color: null,
  }))
}

export async function createRole(
  name: string,
  description: string | null,
  permissions: string[],
  color?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('roles')
    .insert({ name, description, permissions, ...(color !== undefined ? { color } : {}) })
  if (error) throw error
}

export async function updateRole(
  name: string,
  input: {
    name?: string
    description?: string | null
    permissions?: string[]
    color?: string | null
    position?: number
  }
): Promise<void> {
  const { data, error } = await supabase
    .from('roles')
    .update(input)
    .eq('name', name)
    .select('name')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Catálogo de marcas (migración 74: public.marcas y marca_tasas)
// Lee cualquier miembro; escribe solo un administrador (RLS). No se expone
// el borrado: una marca se desactiva con activa=false, porque Proyectos,
// project_oc y las facturas la referencian por nombre y borrarla dejaría
// sin historial de tasas (marca_tasas cae en cascada).
// ============================================================

export type MarcaInput = Omit<Marca, 'id' | 'created_at' | 'updated_at'>

// La tabla aún no existe (migración 74 sin ejecutar): la pestaña muestra el
// aviso en vez de un error genérico
export function esFaltaMigracionMarcas(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, message } = err as { code?: string; message?: string }
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    /does not exist|schema cache/i.test(message ?? '')
  )
}

export async function fetchMarcas(): Promise<Marca[]> {
  const { data, error } = await supabase.from('marcas').select('*').order('nombre')
  if (error) throw error
  return (data ?? []) as Marca[]
}

export async function fetchMarcaTasas(marcaId: string): Promise<MarcaTasa[]> {
  const { data, error } = await supabase
    .from('marca_tasas')
    .select('*')
    .eq('marca_id', marcaId)
    .order('vigente_desde', { ascending: false })
  if (error) throw error
  return (data ?? []) as MarcaTasa[]
}

export async function createMarca(datos: MarcaInput): Promise<Marca> {
  const { data, error } = await supabase.from('marcas').insert(datos).select('*').single()
  if (error) throw error
  return data as Marca
}

export async function updateMarca(id: string, cambios: Partial<MarcaInput>): Promise<void> {
  const { data, error } = await supabase.from('marcas').update(cambios).eq('id', id).select('id')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Lectura obligatoria de los manuales (migración 54). Al republicar
// un manual con cambios de fondo se sube esta versión AQUÍ y en
// la constante VERSION de public/apps/manuales/app.js, y el equipo debe
// confirmar de nuevo (sesion-apps.test.ts comprueba que coincidan).
// ============================================================
export const MANUALES_VERSION = '2026-09-09'
const MANUALES_CLAVES = ['portal', 'proyectos']

// ¿Le falta al usuario confirmar algún manual de la versión vigente?
// Si la tabla aún no existe (migración 54 pendiente) responde false:
// el aviso no debe estorbar antes de estrenar el sistema.
export async function manualesPendientes(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('manual_reads')
    .select('manual')
    .eq('user_id', userId)
    .eq('version', MANUALES_VERSION)
  if (error) return false
  const leidos = new Set((data ?? []).map((r) => r.manual as string))
  return MANUALES_CLAVES.some((m) => !leidos.has(m))
}

// Cuántos miembros tienen un rol asignado: el FK de user_roles es ON DELETE
// CASCADE, así que borrar un rol desasigna a todos al instante — la UI debe
// avisar con el número real antes de permitirlo.
export async function countRoleMembers(role: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', role)
  if (error) throw error
  return count ?? 0
}

export async function deleteRole(name: string): Promise<void> {
  const { data, error } = await supabase
    .from('roles')
    .delete()
    .eq('name', name)
    .select('name')
  if (error) throw error
  assertAffected(data)
}

// ============================================================
// Validación de datos en el cliente (la última palabra la tiene
// RLS + constraints en Supabase, esto da feedback inmediato)
// ============================================================

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validateUrl(url: string): string | null {
  const value = url.trim()
  if (!value) return 'La URL es obligatoria'
  // `//host` es una URL protocol-relative (navega fuera del sitio), no una
  // ruta interna: hay que rechazarla antes del atajo de ruta interna.
  if (value.startsWith('//')) return 'URL no válida'
  if (value.startsWith('/')) return null // ruta interna (ej. /apps/demo/index.html)
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') return 'Solo se permiten URLs https:// o rutas internas que empiecen con /'
    return null
  } catch {
    return 'URL no válida'
  }
}

export function validateSlug(slug: string): string | null {
  if (!slug.trim()) return 'El slug es obligatorio'
  if (!SLUG_PATTERN.test(slug.trim()))
    return 'Solo minúsculas, números y guiones (ej. mi-app)'
  return null
}

export function validateRoleName(name: string): string | null {
  if (!name.trim()) return 'El nombre del rol es obligatorio'
  if (!SLUG_PATTERN.test(name.trim()))
    return 'Solo minúsculas, números y guiones (ej. ventas, contabilidad)'
  return null
}

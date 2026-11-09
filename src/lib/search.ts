import { supabase } from './supabase'

// Fuentes de la búsqueda global (Ctrl+K). Cada función devuelve [] ante
// cualquier fallo (sin sesión, sin migración, sin permisos): la paleta
// solo muestra los grupos con datos. RLS tiene la última palabra.

export interface SearchProject {
  id: string
  code: string
  brand: string
  client: string
  country: string
  status: string
}

export interface SearchTender {
  id: string
  title: string
  entity: string
  country: string
  deadline: string | null
}

export interface SearchMember {
  id: string
  full_name: string | null
}

// Los patrones ilike viajan dentro de un filtro or() de PostgREST: las
// comas y paréntesis del término romperían el parseo del filtro, así que
// se sustituyen por espacio; % _ \ se escapan como literales del LIKE.
function likeTerm(raw: string): string {
  return raw
    .replace(/[,()]/g, ' ')
    .replace(/[\\%_]/g, (m) => '\\' + m)
    .trim()
}

export async function searchProjects(term: string): Promise<SearchProject[]> {
  const t = likeTerm(term)
  if (!t) return []
  const { data, error } = await supabase
    .from('projects')
    .select('id, code, brand, client, country, status')
    .eq('archived', false)
    .or(`code.ilike.%${t}%,client.ilike.%${t}%,brand.ilike.%${t}%`)
    .order('updated_at', { ascending: false })
    .limit(6)
  if (error || !data) return []
  return data as SearchProject[]
}

export async function searchTenders(term: string): Promise<SearchTender[]> {
  const t = likeTerm(term)
  if (!t) return []
  const { data, error } = await supabase
    .from('tenders')
    .select('id, title, entity, country, deadline')
    .or(`title.ilike.%${t}%,entity.ilike.%${t}%`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(5)
  if (error || !data) return []
  return data as SearchTender[]
}

// Sin las cuentas de servicio (claude-dev, bot y claude-qa), con la
// misma regla que fetchTeamMembers: sus ids los da cuentas_servicio_ids()
// de la migración 71 y, si la RPC falla, no se filtra. Se piden 3 filas de
// más para que el filtro no deje el grupo corto.
const MAX_MIEMBROS = 5
const CUENTAS_SERVICIO = 3

export async function searchMembers(term: string): Promise<SearchMember[]> {
  const t = likeTerm(term)
  if (!t) return []
  const [{ data, error }, servicio] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `%${t}%`)
      .order('full_name')
      .limit(MAX_MIEMBROS + CUENTAS_SERVICIO),
    Promise.resolve(supabase.rpc('cuentas_servicio_ids')).catch(() => null),
  ])
  if (error || !data) return []
  const ocultas = new Set<string>(!servicio || servicio.error ? [] : ((servicio.data as string[] | null) ?? []))
  return (data as SearchMember[]).filter((m) => !ocultas.has(m.id)).slice(0, MAX_MIEMBROS)
}

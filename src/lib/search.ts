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

export interface SearchCompany {
  id: string
  name: string
  city: string
  country: string
}

export interface SearchContact {
  id: string
  name: string
  email: string
  company: string
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

// Contactos y empresas de HubSpot vía connector-proxy. El proxy valida la
// sesión y exige ver Directorio, Cotizador, Proyectos o Licitaciones
// (LECTURA_CRM de connector-proxy.ts); sin ninguna responde 403 y deja un
// «[seguridad] denegado» en el registro de Netlify. Por eso searchCrm ni
// llama al proxy si el usuario no ve ninguna de esas apps.
export const APPS_LECTURA_CRM = ['directorio', 'cotizador', 'proyectos', 'licitaciones'] as const

/** true si alguna app visible (por slug, ya filtrada con visibleForRole) habilita leer el CRM. */
export function puedeLeerCrm(slugsVisibles: readonly string[]): boolean {
  return APPS_LECTURA_CRM.some((s) => slugsVisibles.includes(s))
}

async function callHubspot<T>(action: string, query: string): Promise<T | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const res = await fetch('/api/connector-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ connector: 'hubspot', action, query }),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface RawCompany {
  hubspot_id: string | null
  empresa: string
  ciudad: string
  pais: string
}

interface RawContact {
  id: string | null
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  company?: string | null
}

export async function searchCrm(
  term: string,
  slugsVisibles: readonly string[]
): Promise<{ companies: SearchCompany[]; contacts: SearchContact[] }> {
  const t = term.trim()
  if (!t || !puedeLeerCrm(slugsVisibles)) return { companies: [], contacts: [] }
  const [companiesBody, contactsBody] = await Promise.all([
    callHubspot<{ companies?: RawCompany[] }>('search-companies', t),
    callHubspot<{ contacts?: RawContact[] }>('list-contacts', t),
  ])
  const companies = (companiesBody?.companies ?? [])
    .filter((c) => c.hubspot_id)
    .slice(0, 5)
    .map((c) => ({
      id: c.hubspot_id as string,
      name: c.empresa || 'Empresa sin nombre',
      city: c.ciudad || '',
      country: c.pais || '',
    }))
  const contacts = (contactsBody?.contacts ?? [])
    .filter((c) => c.id)
    .slice(0, 5)
    .map((c) => ({
      id: c.id as string,
      name:
        [c.firstname, c.lastname].filter(Boolean).join(' ') ||
        c.email ||
        'Contacto sin nombre',
      email: c.email || '',
      company: c.company || '',
    }))
  return { companies, contacts }
}

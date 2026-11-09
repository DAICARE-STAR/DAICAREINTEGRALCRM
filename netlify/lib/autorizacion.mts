import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { puedeVerModulo } from '../../src/lib/modulos.ts'
import { leerModulos, slugsActivos } from './modulos-instalacion.mts'

// Puerta única de autorización de las Netlify Functions. Reemplaza las
// copias del bloque «getUser + user_roles + permisos» que vivía en cada
// función, para que las reglas no puedan divergir entre ellas:
//
// - Sesión: el JWT se valida contra Supabase Auth (con límite de tiempo y un
//   reintento) y de ahí salen roles y permisos (unión de todos los roles).
// - MFA: un miembro con segundo factor verificado solo pasa con sesión aal2,
//   la misma regla que mfa_ok() aplica en la base (migración 43). La MFA
//   sigue siendo opcional; esto protege a quien ya la activó.
// - Requisitos por acción: módulo activo, permiso, visibilidad de app o solo admin.
//
// La parte pura (sin red) se prueba en __tests__/autorizacion.test.ts; los
// efectos reciben el cliente inyectable para poder probarlos con uno falso.

// Permisos que solo un admin otorga (lista única): igual a
// permisos_solo_admin() de la migración 88 y a src/types.ts.
export const PERMISOS_SOLO_ADMIN: readonly string[] = [
  'manage_roles',
  'manage_members',
  'manage_apps',
  'manage_connectors',
  'view_credentials',
  'manage_credentials',
  'view_mail',
  'view_billing',
  'bot_asistente',
  'ia_worker',
  'delete_projects',
  'delete_tender_offers',
]

export type ContextoAuth = {
  admin: SupabaseClient
  userId: string
  email: string
  nombre: string | null
  roles: string[]
  permisos: string[]
  esAdmin: boolean
  aal: 'aal1' | 'aal2'
  tieneFactor: boolean
}

export type CodigoFallo =
  | 'no_autenticado'
  | 'sesion_invalida'
  | 'mfa_requerida'
  | 'sin_permiso'
  | 'tasa'
  | 'config'
  | 'auth_lento'
  | 'error_base'
  | 'modulo_inactivo'

export type FalloAuth = { status: number; error: string; codigo?: CodigoFallo }

// Requisitos de una acción. Dentro de cada lista basta uno; entre permiso y
// apps se exigen ambos. El admin pasa todo salvo un módulo inactivo: con
// modulo, la acción se deniega a todos si ese módulo no está activo (N-6).
export type Requisitos = {
  modulo?: string
  permiso?: string | readonly string[]
  apps?: readonly string[]
  soloAdmin?: boolean
}

export type ResultadoAuth =
  | { ctx: ContextoAuth; fallo?: undefined }
  | { ctx?: undefined; fallo: FalloAuth }

export type OpcionesAuth = {
  maxPorMinuto?: number
  // Cliente service role ya creado (los tests inyectan uno falso)
  cliente?: SupabaseClient
  // Nombre de la acción para el registro de denegaciones
  accion?: string
}

// ── Parte pura ──────────────────────────────────────────────────────────

export function tokenDeCabecera(valor: string | null | undefined): string | null {
  return valor?.replace(/^Bearer\s+/i, '').trim() || null
}

// Claims del JWT sin verificar la firma: solo se usan DESPUÉS de que
// getUser() validó ese mismo token contra Supabase Auth. Nunca lanza.
export function decodificarClaims(token: string): Record<string, unknown> | null {
  const partes = token.split('.')
  if (partes.length !== 3 || !partes[1]) return null
  try {
    const claims: unknown = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
    return claims && typeof claims === 'object' && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// Sin factor verificado la MFA no aplica; con factor, solo aal2 pasa.
export function evaluarMfa(e: { tieneFactor: boolean; aal: 'aal1' | 'aal2' }): FalloAuth | null {
  if (!e.tieneFactor || e.aal === 'aal2') return null
  return {
    status: 401,
    error: 'Esta cuenta tiene verificación en dos pasos: vuelve a iniciar sesión con tu código.',
    codigo: 'mfa_requerida',
  }
}

// Regla v2 (N-6): una «app» es un módulo del registro. La ve quien cumple
// puedeVerModulo de src/lib/modulos.ts: módulo disponible y activo, y el
// admin o quien tenga su permiso app_<slug>. Un módulo inactivo, planeado o
// desconocido no lo ve nadie, ni el admin. exigir() antepone el chequeo de
// admin a la lista de apps (no al de modulo); quien llame a esta función
// directamente decide lo mismo.
export function puedeVerApp(
  activos: readonly string[],
  slug: string,
  roles: string[] | null,
  permisos: string[] | null,
): boolean {
  return puedeVerModulo(slug, roles, permisos, activos)
}

type Faltante = 'soloAdmin' | 'permiso' | 'apps'

function faltante(
  ctx: Pick<ContextoAuth, 'roles' | 'permisos' | 'esAdmin'>,
  req: Requisitos,
  activos: readonly string[],
): Faltante | null {
  if (ctx.esAdmin) return null
  if (req.soloAdmin) return 'soloAdmin'
  const permisos = typeof req.permiso === 'string' ? [req.permiso] : (req.permiso ?? [])
  if (permisos.length > 0 && !permisos.some((p) => ctx.permisos.includes(p))) return 'permiso'
  if (req.apps?.length && !req.apps.some((s) => puedeVerApp(activos, s, ctx.roles, ctx.permisos))) {
    return 'apps'
  }
  return null
}

export function cumpleRequisitos(
  ctx: Pick<ContextoAuth, 'roles' | 'permisos' | 'esAdmin'>,
  req: Requisitos,
  activos: readonly string[] = [],
): boolean {
  return faltante(ctx, req, activos) === null
}

// Límite por instancia (el CDN de Netlify aporta la mitigación real).
// Devuelve true si la clave ya superó `max` dentro de la ventana.
const golpes = new Map<string, { count: number; reset: number }>()

export function limiteMemoria(
  clave: string,
  max: number,
  ventanaMs = 60_000,
  memoria: Map<string, { count: number; reset: number }> = golpes,
): boolean {
  const ahora = Date.now()
  const entrada = memoria.get(clave)
  if (!entrada || entrada.reset < ahora) {
    // Purga oportunista de ventanas vencidas para que el Map no crezca sin
    // límite en instancias calientes de larga vida.
    if (memoria.size > 500) {
      for (const [k, v] of memoria) if (v.reset < ahora) memoria.delete(k)
    }
    memoria.set(clave, { count: 1, reset: ahora + ventanaMs })
    return false
  }
  entrada.count += 1
  return entrada.count > max
}

// ── Adaptadores de respuesta ────────────────────────────────────────────

// Functions v2 (Request → Response)
export function respuesta(f: FalloAuth): Response {
  return Response.json({ error: f.error, codigo: f.codigo }, { status: f.status })
}

// Functions v1 (Handler de @netlify/functions, p. ej. connector-proxy)
export function respuestaV1(f: FalloAuth): {
  statusCode: number
  headers: Record<string, string>
  body: string
} {
  return {
    statusCode: f.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: f.error, codigo: f.codigo }),
  }
}

// ── Con efectos ─────────────────────────────────────────────────────────

// Registro estructurado de cada denegación, sin datos personales.
function denegado(fallo: FalloAuth, userId: string | null, accion?: string): FalloAuth {
  console.warn('[seguridad] denegado', { codigo: fallo.codigo, userId, accion: accion ?? null })
  return fallo
}

function clienteServicio(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return null
  return createClient(url, clave, { auth: { persistSession: false } })
}

// La validación de sesión llama al servicio Auth de Supabase, que en los
// incidentes de la plataforma (ago 2026) se cuelga por conexión: sin un
// límite, la función entera esperaba el corte de Netlify (~26 s) y toda
// acción moría en 504. Con límite corto y un reintento el cuelgue puntual
// se supera solo; si Auth sigue sin responder, se contesta un 503 claro.
const LIMITE_AUTH_MS = 6000

// getUser no lanza ante un fallo de red ni ante un 5xx de Auth: lo devuelve
// como error (AuthRetryableFetchError). Es Auth caído, no una sesión
// inválida; solo un 4xx de Auth rechaza el token.
function errorAuthTransitorio(error: { status?: number } | null): boolean {
  return !!error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)
}

async function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error('AUTH_TIMEOUT')), ms)
      }),
    ])
  } finally {
    clearTimeout(temporizador)
  }
}

type FilaPerfil = {
  full_name?: string | null
  user_roles?: { role: string; roles: { permissions?: string[] | null } | null }[] | null
}

// Valida la sesión y arma el contexto, o devuelve el fallo ya formado.
export async function autenticar(
  token: string | null | undefined,
  opciones: OpcionesAuth = {},
): Promise<ResultadoAuth> {
  const { maxPorMinuto = 60, accion } = opciones
  const admin = opciones.cliente ?? clienteServicio()
  if (!admin) {
    return { fallo: denegado({ status: 500, error: 'Función no configurada', codigo: 'config' }, null, accion) }
  }
  if (!token) {
    return { fallo: denegado({ status: 401, error: 'No autenticado', codigo: 'no_autenticado' }, null, accion) }
  }
  // Un token que ni siquiera es un JWT no merece la llamada a Auth
  const claims = decodificarClaims(token)
  if (!claims) {
    return { fallo: denegado({ status: 401, error: 'Sesión inválida', codigo: 'sesion_invalida' }, null, accion) }
  }

  type RespuestaGetUser = Awaited<ReturnType<SupabaseClient['auth']['getUser']>>
  let res: RespuestaGetUser | null = null
  // Cuelgue, red o 5xx de Auth: se reintenta una vez y luego se responde 503
  for (let intento = 0; intento < 2 && !res; intento++) {
    try {
      res = await conLimite(admin.auth.getUser(token), LIMITE_AUTH_MS)
      if (errorAuthTransitorio(res.error)) res = null
    } catch {
      /* límite de tiempo o excepción */
    }
  }
  if (!res) {
    const f: FalloAuth = {
      status: 503,
      error:
        'El servicio de sesión de Supabase está lento en este momento. Espera unos segundos e intenta de nuevo.',
      codigo: 'auth_lento',
    }
    return { fallo: denegado(f, null, accion) }
  }
  const user = res.data.user
  if (res.error || !user) {
    return { fallo: denegado({ status: 401, error: 'Sesión inválida', codigo: 'sesion_invalida' }, null, accion) }
  }

  if (limiteMemoria(user.id, maxPorMinuto)) {
    return { fallo: denegado({ status: 429, error: 'Demasiadas solicitudes', codigo: 'tasa' }, user.id, accion) }
  }

  const tieneFactor = (user.factors ?? []).some((f) => f.status === 'verified')
  const aal = claims.aal === 'aal2' ? 'aal2' : 'aal1'
  const mfa = evaluarMfa({ tieneFactor, aal })
  if (mfa) return { fallo: denegado(mfa, user.id, accion) }

  const { data: perfil, error: errorPerfil } = await admin
    .from('profiles')
    .select('full_name, user_roles ( role, roles ( permissions ) )')
    .eq('id', user.id)
    .single()
  // Distinguir "no hay perfil" (403) de un fallo de la consulta (500): un
  // error de DB no debe reportarse como si el miembro no existiera.
  if (errorPerfil && errorPerfil.code !== 'PGRST116') {
    console.error('Consulta de perfil falló:', errorPerfil.message)
    const f: FalloAuth = { status: 500, error: 'Error verificando la sesión', codigo: 'error_base' }
    return { fallo: denegado(f, user.id, accion) }
  }
  if (!perfil) {
    const f: FalloAuth = { status: 403, error: 'Usuario sin perfil en el portal', codigo: 'sin_permiso' }
    return { fallo: denegado(f, user.id, accion) }
  }

  // Multi-rol (migración 26): permisos = unión de todos los roles del miembro.
  const filas = (perfil as FilaPerfil).user_roles ?? []
  const roles = filas.map((u) => u.role)
  const permisos = [...new Set(filas.flatMap((u) => u.roles?.permissions ?? []))]

  return {
    ctx: {
      admin,
      userId: user.id,
      email: user.email ?? '',
      nombre: (perfil as FilaPerfil).full_name ?? null,
      roles,
      permisos,
      esAdmin: roles.includes('admin'),
      aal,
      tieneFactor,
    },
  }
}

const MENSAJE_FALTANTE: Record<Faltante, string> = {
  soloAdmin: 'Solo un administrador puede hacer esta acción.',
  permiso: 'Tu rol no puede hacer esta acción.',
  apps: 'Tu rol no tiene acceso a esta app.',
}

// null si el contexto cumple los requisitos; si no, el fallo ya formado.
// Si no se pueden leer los módulos se deniega con 500 (nunca se abre por
// error). Un módulo inactivo deniega 403 modulo_inactivo también al admin.
export async function exigir(
  ctx: ContextoAuth,
  req: Requisitos,
  accion?: string,
): Promise<FalloAuth | null> {
  let activos: string[] = []
  if (req.modulo || (req.apps?.length && !ctx.esAdmin && !req.soloAdmin)) {
    const filas = await leerModulos(ctx.admin)
    if (!filas) {
      const f: FalloAuth = { status: 500, error: 'Error verificando los permisos', codigo: 'error_base' }
      return denegado(f, ctx.userId, accion)
    }
    activos = slugsActivos(filas)
    if (req.modulo && !activos.includes(req.modulo)) {
      const f: FalloAuth = { status: 403, error: 'Este módulo no está activo en la instalación.', codigo: 'modulo_inactivo' }
      return denegado(f, ctx.userId, accion)
    }
  }
  const falta = faltante(ctx, req, activos)
  if (!falta) return null
  return denegado({ status: 403, error: MENSAJE_FALTANTE[falta], codigo: 'sin_permiso' }, ctx.userId, accion)
}

export type OpcionesLimite = { cerrado?: boolean }

// Límite compartido entre instancias (rpc rate_limit_hit, migración 64).
// Sin contexto usa un cliente service role propio (límites globales).
// Abierto (por defecto): si la RPC no existe o falla, NO limita y el límite
// en memoria sigue activo; es lo justo para reuniones, avisos y sincronías,
// que no cuestan dinero. Cerrado ({ cerrado: true }, el cupo de IA, que sí
// cuesta): sin la migración 64 responde 501 config y, si la RPC falla, lanza
// o no hay cliente, 503 error_base.
export async function limiteBase(
  ctx: Pick<ContextoAuth, 'admin' | 'userId'> | null,
  clave: string,
  ventanaSeg: number,
  max: number,
  opciones: OpcionesLimite = {},
): Promise<FalloAuth | null> {
  const cerrado = opciones.cerrado === true
  const noComprobado = (): FalloAuth | null =>
    cerrado
      ? denegado(
          { status: 503, error: 'No se pudo comprobar el cupo de IA. Intenta en un momento.', codigo: 'error_base' },
          ctx?.userId ?? null,
          clave,
        )
      : null
  const admin = ctx?.admin ?? clienteServicio()
  if (!admin) {
    console.warn('[seguridad] límite en base sin cliente', { clave })
    return noComprobado()
  }
  try {
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_clave: clave,
      p_ventana_seg: ventanaSeg,
      p_max: max,
    })
    if (error) {
      console.warn('[seguridad] límite en base no disponible', { clave, codigo: error.code })
      if (cerrado && (error.code === 'PGRST202' || error.code === '42883')) {
        return denegado({ status: 501, error: 'Falta la migración 64', codigo: 'config' }, ctx?.userId ?? null, clave)
      }
      return noComprobado()
    }
    if (data !== true) return null
  } catch {
    console.warn('[seguridad] límite en base no disponible', { clave })
    return noComprobado()
  }
  const f: FalloAuth = {
    status: 429,
    error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
    codigo: 'tasa',
  }
  return denegado(f, ctx?.userId ?? null, clave)
}

export type EntradaAuditoria = {
  userId: string | null
  email?: string
  action: string
  detail?: string
  entity?: string
  entityId?: string
}

// Auditoría del lado del servidor (audit_log.origen = 'servidor'). Nunca
// lanza: el registro no interrumpe la acción que lo llamó.
export async function auditar(admin: SupabaseClient, e: EntradaAuditoria): Promise<void> {
  try {
    const { error } = await admin.from('audit_log').insert({
      user_id: e.userId,
      user_email: e.email ?? '',
      action: e.action,
      detail: e.detail ?? '',
      entity: e.entity ?? '',
      entity_id: e.entityId ?? '',
      origen: 'servidor',
    })
    if (error) console.warn('[seguridad] auditoría no registrada', { action: e.action, codigo: error.code })
  } catch {
    console.warn('[seguridad] auditoría no registrada', { action: e.action })
  }
}

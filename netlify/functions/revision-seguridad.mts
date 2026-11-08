import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { esCuentaServicio, escHtml, nombrePortal, sendEmailTo, teamEmails, type EmailContent } from '../lib/email.mts'

// Revisión diaria de seguridad. Lee la foto de seguridad_resumen()
// (migración 64, solo service role) y, si hay algo anómalo, avisa a los
// administradores por correo y con una notificación en el portal que abre
// Administración. Sin hallazgos no envía nada. Una función programada no
// se puede invocar por HTTP (Netlify responde 403).
//
// Es anómalo:
//   · una función security definer de public que anon puede ejecutar;
//   · una tabla de public sin RLS o sin la política exigir_mfa, y el
//     storage sin ella;
//   · cualquier cambio de las últimas 24 h en roles, asignaciones, bóveda,
//     apps, herramientas o interruptores (triggers auditar_cambio), y cada
//     secreto guardado o quitado de la bóveda (credencial.guardar);
//   · un pico de leads del sitio (el freno de la 64 deja pasar hasta 40
//     por hora, así que un día con muchos apunta a spam);
//   · una cuenta de servicio (claude-dev, bot, claude-qa) con rol admin;
//   · una misma persona que revela 20 claves o más de la bóveda en 24 h
//     (AU-DEC-04). seguridad_resumen() cuenta por acción, no por persona:
//     el conteo sale de audit_log con la service role.
// Lo estructural se repite cada día hasta que se corrija. La MFA es
// opcional: el resumen no trae datos de MFA por persona (quién tiene
// segundo factor) y aquí no se evalúa; exigir_mfa es la política de la 43
// que protege a quien ya lo activó.
//
// El correo va a los administradores en el To: el envío por defecto pone el
// buzón compartido (SMTP_USER) en el To y el informe quedaría también ahí.
// Si hay hallazgos y ningún aviso llega, la corrida responde 500.

export type ResumenSeguridad = {
  generado_at?: string
  admins?: string[]
  definer_ejecutables_anon?: string[]
  tablas_sin_rls?: string[]
  tablas_sin_exigir_mfa?: string[]
  storage_exigir_mfa?: boolean
  cambios_24h?: Record<string, number>
  leads_24h?: number
}

export type Hallazgo = { titulo: string; items: string[] }

export const UMBRAL_LEADS_24H = 30
export const UMBRAL_REVELACIONES_24H = 20

// Claves reveladas en 24 h por persona (correo, o el id si no se resolvió)
export type Revelaciones = { usuario: string; n: number }[]

// Nombre legible de cada tabla auditada que cuenta cambios_24h
const TABLAS: Record<string, string> = {
  roles: 'Roles',
  user_roles: 'Asignaciones de rol',
  portal_credentials: 'Bóveda de credenciales',
  security_settings: 'Interruptores de seguridad',
  portal_apps: 'Apps',
  connectors: 'Herramientas',
}

const OPERACIONES: Record<string, string> = { insert: 'alta', update: 'cambio', delete: 'baja' }

// Un cambio es una fila de auditar_cambio: '<tabla>.<insert|update|delete>'.
// La 69 anota además en portal_credentials, con origen 'base', cada clave
// revelada ('credencial.revelar', el uso diario del Radar: no es anomalía y
// va solo como contexto del correo) y cada secreto guardado o quitado
// ('credencial.guardar'), que sí avisa: rotar un secreto que ya estaba en
// Vault, con la columna en claro vacía, no cambia ninguna columna de la
// fila y auditar_cambio no deja rastro; su única huella es esa acción.
const ES_CAMBIO = /^[a-z_]+\.(insert|update|delete)$/
const REVELAR = 'credencial.revelar'
const GUARDAR = 'credencial.guardar'

function esCambio(accion: string): boolean {
  return ES_CAMBIO.test(accion) || accion === GUARDAR
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// 'user_roles.insert' → 'Asignaciones de rol · alta (user_roles.insert)'
function nombreCambio(accion: string): string {
  if (accion === GUARDAR) return `${TABLAS.portal_credentials} · secreto guardado o quitado (${accion})`
  const [tabla = '', op = ''] = accion.split('.')
  const legible = TABLAS[tabla]
  return legible ? `${legible} · ${OPERACIONES[op] ?? op} (${accion})` : accion
}

// Parte pura: qué del resumen amerita aviso. Tolera claves ausentes.
export function hallazgosDe(r: ResumenSeguridad, revelaciones: Revelaciones = []): Hallazgo[] {
  const h: Hallazgo[] = []

  const servicio = textos(r.admins).filter((email) => esCuentaServicio(email))
  if (servicio.length) h.push({ titulo: 'Cuentas de servicio con rol admin', items: servicio })

  const anon = textos(r.definer_ejecutables_anon)
  if (anon.length) h.push({ titulo: 'Funciones security definer ejecutables por anon', items: anon })

  const sinRls = textos(r.tablas_sin_rls)
  if (sinRls.length) h.push({ titulo: 'Tablas sin RLS', items: sinRls })

  const sinMfa = textos(r.tablas_sin_exigir_mfa)
  if (r.storage_exigir_mfa === false) sinMfa.push('storage.objects')
  if (sinMfa.length) h.push({ titulo: 'Tablas sin la política exigir_mfa', items: sinMfa })

  const cambios = Object.entries(r.cambios_24h ?? {})
    .filter(([accion, n]) => esCambio(accion) && typeof n === 'number' && n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  if (cambios.length) {
    h.push({
      titulo: 'Cambios en las últimas 24 h',
      items: cambios.map(([accion, n]) => `${nombreCambio(accion)}: ${n}`),
    })
  }

  const leads = typeof r.leads_24h === 'number' ? r.leads_24h : 0
  if (leads >= UMBRAL_LEADS_24H) {
    h.push({ titulo: 'Leads del sitio en las últimas 24 h', items: [`${leads} (el umbral es ${UMBRAL_LEADS_24H})`] })
  }

  const masivas = revelaciones
    .filter((x) => x.n >= UMBRAL_REVELACIONES_24H)
    .sort((a, b) => b.n - a.n || a.usuario.localeCompare(b.usuario))
  if (masivas.length) {
    h.push({
      titulo: 'Claves reveladas en 24 h por una misma persona',
      items: masivas.map((x) => `${x.usuario}: ${x.n} (el umbral es ${UMBRAL_REVELACIONES_24H})`),
    })
  }

  return h
}

// Revelaciones de las últimas 24 h agrupadas por persona. La 69 anota cada
// una en audit_log ('credencial.revelar', origen 'base') sin el correo, así
// que el de quien pasa el umbral sale de Auth. PostgREST corta en 1000
// filas por respuesta: se pagina. Si la lectura falla, se registra y la
// revisión sigue con el resto.
const FILAS_POR_PAGINA = 1000
const MAX_PAGINAS_AUDITORIA = 50

export async function revelacionesPorUsuario(admin: SupabaseClient, ahora = new Date()): Promise<Revelaciones> {
  const desde = new Date(ahora.getTime() - 24 * 3600 * 1000).toISOString()
  const conteo = new Map<string, number>()
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS_AUDITORIA; pagina++) {
      const { data, error } = await admin
        .from('audit_log')
        .select('user_id')
        .eq('action', REVELAR)
        .eq('origen', 'base')
        .gt('created_at', desde)
        .order('id')
        .range(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA - 1)
      if (error) {
        console.error('revision-seguridad: no se pudieron contar las claves reveladas', { codigo: error.code })
        return []
      }
      const filas = (data ?? []) as { user_id: string | null }[]
      for (const f of filas) {
        const id = f.user_id ?? 'sin usuario'
        conteo.set(id, (conteo.get(id) ?? 0) + 1)
      }
      if (filas.length < FILAS_POR_PAGINA) break
    }
  } catch {
    console.error('revision-seguridad: no se pudieron contar las claves reveladas')
    return []
  }

  const porId = [...conteo].map(([id, n]) => ({ id, n }))
  if (!porId.some((x) => x.n >= UMBRAL_REVELACIONES_24H)) {
    return porId.map(({ id, n }) => ({ usuario: id, n }))
  }
  let correos = new Map<string, string>()
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    correos = new Map((data?.users ?? []).map((u) => [u.id, u.email ?? '']))
  } catch {
    // Sin Auth se nombra por id: el hallazgo sale igual
  }
  return porId.map(({ id, n }) => ({ usuario: correos.get(id) || id, n }))
}

function fechaDe(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  const valida = Number.isNaN(d.getTime()) ? new Date() : d
  return valida.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}

// Correo claro con el acento, como los demás avisos (los clientes de
// correo no respetan temas oscuros). Todo texto que viene de la base se
// escapa: nombres de tablas, firmas y acciones.
export function renderRevision(
  hallazgos: Hallazgo[],
  resumen: ResumenSeguridad,
  portalUrl: string,
): EmailContent {
  const n = hallazgos.length
  const fecha = fechaDe(resumen.generado_at)
  const subject = `Revisión de seguridad: ${n} ${n === 1 ? 'punto' : 'puntos'} para revisar`
  const admins = textos(resumen.admins)
  const reveladas = resumen.cambios_24h?.[REVELAR]
  const contexto =
    `Administradores: ${admins.length}${admins.length ? ` (${admins.join(', ')})` : ''} · Leads en 24 h: ${resumen.leads_24h ?? 0}` +
    (typeof reveladas === 'number' && reveladas > 0 ? ` · Claves reveladas en 24 h: ${reveladas}` : '')

  const bloques = hallazgos
    .map(
      (x) => `
      <div style="padding:12px 20px;border-top:1px solid #E4E1DB;">
        <div style="font-weight:600;color:#171512;font-size:14px;margin:0 0 6px;">${escHtml(x.titulo)}</div>
        ${x.items.map((i) => `<div style="color:#38342D;font-size:13px;line-height:1.5;font-family:Consolas,monospace;">${escHtml(i)}</div>`).join('')}
      </div>`,
    )
    .join('')

  const html = `
  <div style="background:#F2F0EC;padding:28px 12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E4E1DB;border-radius:12px;overflow:hidden;">
      <div style="background:#171512;padding:18px 20px;">
        <span style="color:#7CC3DC;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${escHtml(nombrePortal())}</span>
        <h1 style="color:#ffffff;font-size:18px;margin:6px 0 0;">Revisión de seguridad</h1>
      </div>
      <div style="padding:18px 20px 12px;">
        <p style="color:#171512;font-size:14px;margin:0;">
          La revisión del ${escHtml(fecha)} encontró <strong>${n} ${n === 1 ? 'punto' : 'puntos'}</strong> para revisar:
        </p>
      </div>
      ${bloques}
      <p style="color:#625C52;font-size:12.5px;padding:12px 20px 0;margin:0;border-top:1px solid #E4E1DB;">${escHtml(contexto)}</p>
      <div style="padding:20px;text-align:center;">
        <a href="${portalUrl}/admin"
           style="display:inline-block;background:#7CC3DC;color:#171512;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px;text-decoration:none;">
          Abrir Administración
        </a>
      </div>
      <p style="color:#AAA49A;font-size:11px;text-align:center;padding:0 20px 18px;margin:0;">
        Recibes este correo por ser administrador del portal del equipo.
      </p>
    </div>
  </div>`

  const text =
    `Revisión de seguridad del ${fecha}: ${n} ${n === 1 ? 'punto' : 'puntos'} para revisar.\n\n` +
    hallazgos.map((x) => `${x.titulo}\n${x.items.map((i) => `  • ${i}`).join('\n')}`).join('\n\n') +
    `\n\n${contexto}\n\nAdministración: ${portalUrl}/admin`

  return { subject, html, text }
}

// Administradores que reciben el aviso. teamEmails ya excluye las cuentas
// de servicio; la notificación en el portal sigue la misma lista.
async function destinatariosAdmin(admin: SupabaseClient): Promise<{ ids: string[]; correos: string[] }> {
  const { data: filas, error } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
  if (error) console.error('revision-seguridad: no se pudieron leer los administradores:', error.message)
  const idsAdmin = [...new Set((filas ?? []).map((f: { user_id: string }) => f.user_id))]
  if (idsAdmin.length === 0) return { ids: [], correos: [] }

  const correos = await teamEmails(admin, idsAdmin)
  const { data, error: errorUsuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (errorUsuarios) console.error('revision-seguridad: no se pudieron listar los usuarios:', errorUsuarios.message)
  const ids = (data?.users ?? [])
    .filter((u) => idsAdmin.includes(u.id) && !!u.email && correos.includes(u.email))
    .map((u) => u.id)
  return { ids, correos }
}

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('revision-seguridad: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    return Response.json({ error: 'Función no configurada' }, { status: 500 })
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc('seguridad_resumen')
  if (error) {
    // PGRST202 (PostgREST) o 42883 (Postgres): la función aún no existe.
    // Falla suave: la revisión empieza sola cuando se aplique la 64.
    if (error.code === 'PGRST202' || error.code === '42883') {
      console.warn('revision-seguridad: falta la migración 64 (seguridad_resumen); no se revisa')
      return Response.json({ omitida: 'falta la migración 64' })
    }
    console.error('revision-seguridad: seguridad_resumen falló:', error.message)
    return Response.json({ error: 'No se pudo leer el resumen de seguridad' }, { status: 500 })
  }

  const resumen = (data ?? {}) as ResumenSeguridad
  const hallazgos = hallazgosDe(resumen, await revelacionesPorUsuario(admin))
  if (hallazgos.length === 0) {
    console.log('revision-seguridad: sin novedades')
    return Response.json({ hallazgos: 0 })
  }

  const { ids, correos } = await destinatariosAdmin(admin)
  const portalUrl = process.env.URL ?? 'http://localhost:5190'
  const contenido = renderRevision(hallazgos, resumen, portalUrl)

  // Notificación en el portal primero: no depende del SMTP
  let enPortal = 0
  if (ids.length > 0) {
    const { error: notifErr } = await admin.from('user_notifications').insert(
      ids.map((uid) => ({
        user_id: uid,
        kind: 'sistema',
        title: contenido.subject.slice(0, 160),
        body: hallazgos.map((x) => `${x.titulo} (${x.items.length})`).join(' · ').slice(0, 600),
        link: '/admin',
      })),
    )
    if (notifErr) console.error('revision-seguridad: no se pudo avisar en el portal:', notifErr.message)
    else enPortal = ids.length
  }

  let email = 0
  try {
    email = (await sendEmailTo(correos, contenido, `Seguridad — ${nombrePortal()}`, { visibleTo: true })).sent
  } catch (e) {
    console.error('revision-seguridad: el correo falló:', e instanceof Error ? e.message : e)
  }

  // Una alarma que no llega a nadie es una falla, no una corrida normal
  if (enPortal === 0 && email === 0) {
    console.error('revision-seguridad:', hallazgos.length, 'hallazgo(s) sin ningún aviso entregado')
    return Response.json({ hallazgos: hallazgos.length, enPortal, email }, { status: 500 })
  }

  console.log('revision-seguridad:', hallazgos.length, 'hallazgo(s); portal', enPortal, '· correo', email)
  return Response.json({ hallazgos: hallazgos.length, enPortal, email })
}

// Diario a las 12:00 UTC (07:00 Colombia)
// Función programada de Netlify: solo se lee schedule (sin @netlify/functions)
export const config = {
  schedule: '0 12 * * *',
}

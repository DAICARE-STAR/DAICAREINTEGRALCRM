// Uso del portal por miembro (migración 73): lógica pura del latido del
// shell y del resumen de Administración → Uso. Sin Supabase ni DOM, para
// poder probarla (src/lib/__tests__/uso.test.ts).
//
// Qué cuenta como uso (decisión del usuario, 2026-10-09): cada minuto en
// que el portal está en primer plano (pestaña visible) y hubo actividad
// (teclado, ratón o scroll, también dentro de las apps embebidas) en los
// últimos 5 minutos. Una pestaña abierta y olvidada no suma. El detalle
// (día × app) se guarda 90 días y lo ve solo el administrador.

export const TICK_MS = 60_000
export const UMBRAL_ACTIVIDAD_MS = 5 * 60_000
// Tope por envío: coincide con el tope de uso_latido() en la base
export const MAX_MINUTOS_POR_ENVIO = 5

// Secciones del shell con su nombre en el menú (las apps embebidas van
// como 'app:<slug>' y toman el nombre de portal_apps)
export const NOMBRES_RUTA: Record<string, string> = {
  inicio: 'Inicio',
  herramientas: 'Herramientas',
  chat: 'Chat',
  correo: 'Correo',
  calendario: 'Calendario',
  equipo: 'Equipo',
  'sitio-web': 'Sitio web',
  admin: 'Administración',
}

// Clave de uso de una ruta del shell; null si la ruta no se mide (login,
// 404…). /apps/:slug y /app/:slug son la misma app.
export function claveDeRuta(pathname: string): string | null {
  const ruta = pathname.replace(/\/+$/, '') || '/'
  if (ruta === '/') return 'inicio'
  const app = /^\/apps?\/([a-z0-9_-]{1,32})(?:\/|$)/i.exec(ruta)
  if (app) return 'app:' + app[1].toLowerCase()
  const seccion = /^\/([a-z-]+)(?:\/|$)/.exec(ruta)?.[1]
  return seccion && seccion in NOMBRES_RUTA ? seccion : null
}

export function nombreApp(clave: string, apps: { slug: string; name: string }[]): string {
  if (clave.startsWith('app:')) {
    const slug = clave.slice(4)
    return apps.find((a) => a.slug === slug)?.name ?? slug
  }
  return NOMBRES_RUTA[clave] ?? clave
}

// ¿Este minuto cuenta? Visible y con actividad en los últimos 5 minutos.
// Un reloj que retrocede (ultimaActividad en el futuro) cuenta como reciente.
export function debeContar(p: { visible: boolean; ultimaActividad: number; ahora: number }): boolean {
  return p.visible && p.ahora - p.ultimaActividad < UMBRAL_ACTIVIDAD_MS
}

export interface Pendiente {
  app: string
  minutos: number
  aperturas: number
}

export function acumular(
  pend: Pendiente | null,
  app: string,
  que: { minuto?: boolean; apertura?: boolean }
): Pendiente {
  const base = pend && pend.app === app ? pend : { app, minutos: 0, aperturas: 0 }
  return {
    app,
    minutos: base.minutos + (que.minuto ? 1 : 0),
    aperturas: base.aperturas + (que.apertura ? 1 : 0),
  }
}

export function listoParaEnviar(pend: Pendiente | null): boolean {
  return !!pend && pend.minutos >= MAX_MINUTOS_POR_ENVIO
}

export function hayAlgo(pend: Pendiente | null): boolean {
  return !!pend && (pend.minutos > 0 || pend.aperturas > 0)
}

// Cuerpo de la llamada a uso_latido (nombres de parámetros de la RPC)
export function cuerpoLatido(pend: Pendiente): { p_app: string; p_minutos: number; p_aperturas: number } {
  return {
    p_app: pend.app,
    p_minutos: Math.min(pend.minutos, MAX_MINUTOS_POR_ENVIO),
    p_aperturas: Math.min(pend.aperturas, 20),
  }
}

// «0 min», «45 min», «2 h», «3 h 20 min»
export function fmtDuracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} min`
  if (r === 0) return `${h} h`
  return `${h} h ${r} min`
}

// Fecha local AAAA-MM-DD (el periodo se pide en días de calendario)
export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function rangoPeriodo(dias: number, hoy = new Date()): { desde: string; hasta: string } {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1))
  return { desde: fechaISO(desde), hasta: fechaISO(hoy) }
}

// Filas de uso_resumen() y acciones_resumen()
export interface FilaUso {
  user_id: string
  app: string
  minutos: number
  aperturas: number
  dias: number
  ultima: string
}
export interface FilaAccion {
  user_id: string
  action: string
  n: number
}

export interface UsoMiembro {
  userId: string
  minutos: number
  aperturas: number
  dias: number
  ultima: string | null
  // Apps ordenadas por minutos, de mayor a menor (clave y nombre)
  apps: { clave: string; nombre: string; minutos: number; aperturas: number }[]
  acciones: number
}

export interface ResumenUso {
  miembros: UsoMiembro[]
  minutosEquipo: number
  activos: number
  accionesEquipo: number
  appMasUsada: { nombre: string; minutos: number } | null
}

// Resumen por miembro y del equipo. Las cuentas de servicio (claude-dev,
// bot, claude-qa) se excluyen salvo que se pidan.
export function resumirUso(
  filas: FilaUso[],
  acciones: FilaAccion[],
  apps: { slug: string; name: string }[],
  opciones: { excluir?: string[] } = {}
): ResumenUso {
  const excluir = new Set(opciones.excluir ?? [])
  const porMiembro = new Map<string, UsoMiembro>()
  const asegurar = (userId: string) => {
    let m = porMiembro.get(userId)
    if (!m) {
      m = { userId, minutos: 0, aperturas: 0, dias: 0, ultima: null, apps: [], acciones: 0 }
      porMiembro.set(userId, m)
    }
    return m
  }
  for (const f of filas) {
    if (excluir.has(f.user_id)) continue
    const m = asegurar(f.user_id)
    m.minutos += f.minutos
    m.aperturas += f.aperturas
    m.dias = Math.max(m.dias, f.dias)
    if (f.ultima && (!m.ultima || f.ultima > m.ultima)) m.ultima = f.ultima
    m.apps.push({ clave: f.app, nombre: nombreApp(f.app, apps), minutos: f.minutos, aperturas: f.aperturas })
  }
  for (const a of acciones) {
    if (excluir.has(a.user_id)) continue
    asegurar(a.user_id).acciones += a.n
  }
  const porApp = new Map<string, number>()
  for (const m of porMiembro.values()) {
    m.apps.sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre, 'es'))
    for (const a of m.apps) porApp.set(a.nombre, (porApp.get(a.nombre) ?? 0) + a.minutos)
  }
  const miembros = [...porMiembro.values()].sort(
    (a, b) => b.minutos - a.minutos || b.acciones - a.acciones || a.userId.localeCompare(b.userId)
  )
  let appMasUsada: ResumenUso['appMasUsada'] = null
  for (const [nombre, minutos] of porApp) {
    if (minutos > 0 && (!appMasUsada || minutos > appMasUsada.minutos)) appMasUsada = { nombre, minutos }
  }
  return {
    miembros,
    minutosEquipo: miembros.reduce((s, m) => s + m.minutos, 0),
    activos: miembros.filter((m) => m.minutos > 0).length,
    accionesEquipo: miembros.reduce((s, m) => s + m.acciones, 0),
    appMasUsada,
  }
}

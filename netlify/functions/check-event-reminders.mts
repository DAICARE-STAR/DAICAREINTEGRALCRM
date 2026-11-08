import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  destinoAviso,
  enlaceHttps,
  enlaceReunion,
  esCuentaServicio,
  escHtml,
  nombrePortal,
  sendEmailTo,
  teamEmails,
  type Asistente,
  type EmailContent,
} from '../lib/email.mts'
import { broadcastPush } from '../lib/push.mts'

// Recordatorios de reuniones del calendario del equipo. Cada 5 minutos
// reclama los eventos cuyo aviso ya venció (claim_due_event_reminders marca
// reminded_at en el mismo UPDATE, así nunca se duplica) y avisa por tres
// vías: dentro del portal (user_notifications), push del navegador y correo:
// a los invitados si el evento tiene lista de asistentes, o a todo el equipo
// si es un evento abierto (la campana, sin las cuentas de servicio). Un
// bloque de mantenimiento («MANT · …») sin invitados no avisa a nadie. Si la
// lista de invitados no se puede leer, no se avisa y el reclamo se libera
// para que lo reintente la corrida siguiente.

export type EventRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  meeting_url: string | null
  starts_at: string
  all_day: boolean
}

function cuando(ev: EventRow): string {
  const start = new Date(ev.starts_at)
  if (ev.all_day) {
    // Fecha civil de Bogotá, la misma del .ics y de la copia en Google
    return start.toLocaleDateString('es-419', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' })
  }
  const mins = Math.max(1, Math.round((start.getTime() - Date.now()) / 60000))
  if (mins < 60) return `en ${mins} min`
  const horas = Math.round(mins / 60)
  return horas === 1 ? 'en 1 hora' : `en ${horas} horas`
}

function horaLocal(iso: string): string {
  // El equipo trabaja en Colombia (UTC-5)
  return new Date(iso).toLocaleString('es-419', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  })
}

// Todo lo que viene de la base va escapado en el HTML; «Unirse» (botón y
// línea del texto plano, que el cliente de correo vuelve clicable) solo
// aparece con un enlace https limpio. El asunto y el resto del texto plano
// no se interpretan como HTML y quedan tal cual.
export function renderReminderEmail(ev: EventRow, portalUrl: string): EmailContent {
  const subject = `Recordatorio: «${ev.title.slice(0, 80)}» ${cuando(ev)}`
  const detalles = [
    `Hora: ${horaLocal(ev.starts_at)} (hora Colombia)`,
    ev.location ? `Lugar: ${ev.location}` : null,
  ].filter(Boolean)
  const unirse = enlaceHttps(ev.meeting_url)

  const html = `
  <div style="background:#F2F0EC;padding:28px 12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E4E1DB;border-radius:12px;overflow:hidden;">
      <div style="background:#171512;padding:18px 20px;">
        <span style="color:#7CC3DC;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${escHtml(nombrePortal())}</span>
        <h1 style="color:#ffffff;font-size:18px;margin:6px 0 0;">Próxima reunión</h1>
      </div>
      <div style="padding:20px;">
        <p style="color:#171512;font-size:16px;font-weight:600;margin:0 0 10px;">${escHtml(ev.title)}</p>
        ${detalles.map((d) => `<p style="color:#625C52;font-size:13.5px;margin:0 0 6px;">${escHtml(d as string)}</p>`).join('')}
        ${ev.description ? `<p style="color:#171512;font-size:13.5px;margin:12px 0 0;white-space:pre-line;">${escHtml(ev.description)}</p>` : ''}
      </div>
      <div style="padding:0 20px 20px;text-align:center;">
        ${
          unirse
            ? `<a href="${escHtml(unirse)}" style="display:inline-block;background:#7CC3DC;color:#171512;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px;text-decoration:none;margin-right:8px;">Unirse a la reunión</a>`
            : ''
        }
        <a href="${portalUrl}${enlaceReunion(ev.id)}" style="display:inline-block;color:#171512;font-weight:600;font-size:13px;padding:11px 16px;text-decoration:underline;">Ver en el calendario</a>
      </div>
      <p style="color:#AAA49A;font-size:11px;text-align:center;padding:0 20px 18px;margin:0;">
        Recibes este correo por ser miembro del portal del equipo.
      </p>
    </div>
  </div>`

  const text =
    `Próxima reunión: ${ev.title}\n` +
    detalles.map((d) => d?.replace(/^[^\s]+\s/, '')).join('\n') +
    (ev.description ? `\n\n${ev.description}` : '') +
    (unirse ? `\n\nUnirse: ${unirse}` : '') +
    `\n\nCalendario: ${portalUrl}${enlaceReunion(ev.id)}`

  return { subject, html, text }
}

// Ids de las cuentas de servicio (claude-dev, bot, claude-qa), para
// sacarlas de la campana de las reuniones abiertas. profiles no guarda el
// correo, así que salen de auth.admin.listUsers con la lista única de
// email.mts (esCuentaServicio). Por user_roles no alcanza: claude-qa es solo
// member y no tiene un rol propio. Se pide una vez por corrida y solo si hay
// una reunión abierta (los invitados y los MANT no la necesitan), paginando
// si el equipo pasa de una página. Si falla devuelve null y la campana sale
// sin la exclusión: un aviso de más a una cuenta sin buzón pesa menos que
// dejar al equipo sin recordatorio. Con plazo: la función programada corta a
// los 30 s y, si Auth se cuelga, se perderían campana y push de eventos ya
// reclamados (reminded_at marcado).
export const USUARIOS_POR_PAGINA = 1000
const MAX_PAGINAS = 20
export const PLAZO_CUENTAS_SERVICIO_MS = 8000
// La lista de correos (teamEmails) también lee Auth: mismo riesgo, plazo
// propio. Si vence, ese evento queda sin correo y los siguientes de la
// corrida no lo intentan (Auth no responde); campana y push siguen.
export const PLAZO_CORREOS_MS = 5000

async function conPlazo<T>(promesa: Promise<T>, plazoMs: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const plazo = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('plazo de Auth vencido')), plazoMs)
  })
  try {
    return await Promise.race([promesa, plazo])
  } finally {
    clearTimeout(temporizador)
  }
}

export async function idsCuentasServicio(
  admin: SupabaseClient,
  plazoMs = PLAZO_CUENTAS_SERVICIO_MS,
): Promise<Set<string> | null> {
  try {
    return await conPlazo(leerCuentasServicio(admin), plazoMs)
  } catch (err) {
    console.error('check-event-reminders: cuentas de servicio no disponibles, la campana sale sin excluirlas', {
      motivo: err instanceof Error ? err.message.slice(0, 200) : 'error desconocido',
    })
    return null
  }
}

async function leerCuentasServicio(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USUARIOS_POR_PAGINA })
    if (error) throw error
    const users = data?.users ?? []
    for (const u of users) if (esCuentaServicio(u.email)) ids.add(u.id)
    if (users.length < USUARIOS_POR_PAGINA) return ids
  }
  console.error('check-event-reminders: más de', MAX_PAGINAS, 'páginas de usuarios; la exclusión puede quedar incompleta')
  return ids
}

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Función no configurada' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: due, error } = await admin.rpc('claim_due_event_reminders')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const events = (due ?? []) as EventRow[]
  if (events.length === 0) return Response.json({ reminded: 0 })

  const portalUrl = process.env.URL ?? 'http://localhost:5190'
  let push = 0
  let email = 0
  let enPortal = 0
  let sinAviso = 0
  let aReintentar = 0
  // Se resuelve con la primera reunión abierta y se reutiliza en el resto
  let cuentasServicio: Promise<Set<string> | null> | undefined
  let correosSinAuth = false

  for (const ev of events) {
    // select * tolera bases sin la columna invited (migración 15 pendiente).
    const { data: att, error: errAtt } = await admin
      .from('event_attendees')
      .select('*')
      .eq('event_id', ev.id)
    if (errAtt) {
      // Un fallo de lectura nunca es «sin invitados»: una reunión privada
      // llegaría a todo el equipo y un bloque de mantenimiento perdería su
      // aviso. Se devuelve el reclamo (reminded_at = null) y la corrida de
      // dentro de 5 min lo vuelve a tomar mientras no haya empezado.
      console.error('check-event-reminders: invitados no disponibles, se reintenta', {
        id: ev.id,
        codigo: errAtt.code,
      })
      const { error: errLibera } = await admin.from('calendar_events').update({ reminded_at: null }).eq('id', ev.id)
      if (errLibera) {
        console.error('check-event-reminders: no se pudo liberar el recordatorio', { id: ev.id, codigo: errLibera.code })
      }
      aReintentar += 1
      continue
    }
    const destino = destinoAviso(ev, (att ?? []) as Asistente[])
    if (destino.modo === 'nadie') {
      // El recordatorio ya quedó reclamado: no se reintenta
      console.log('check-event-reminders: bloque de mantenimiento sin invitados, sin aviso', { id: ev.id })
      sinAviso += 1
      continue
    }
    const userIds = destino.modo === 'invitados' ? destino.userIds : undefined

    // Aviso DENTRO del portal (campana y barra derecha). Es la vía que no
    // depende de que el navegador tenga el push concedido ni de que se
    // mire el correo. Si no hay invitados concretos, el evento es abierto
    // y se avisa a todo el equipo, sin las cuentas de servicio.
    let destinoPortal: string[]
    if (userIds) {
      destinoPortal = userIds
    } else {
      cuentasServicio ??= idsCuentasServicio(admin)
      const servicio = await cuentasServicio
      const { data: filas, error: errPerfiles } = await admin.from('profiles').select('id')
      if (errPerfiles) console.error('check-event-reminders: perfiles no disponibles, la reunión abierta sale sin campana ni push', { id: ev.id, codigo: errPerfiles.code })
      const perfiles = (filas ?? []).map((p) => p.id as string)
      destinoPortal = servicio ? perfiles.filter((id) => !servicio.has(id)) : perfiles
    }
    if (destinoPortal.length > 0) {
      const { error: notifErr } = await admin.from('user_notifications').insert(
        destinoPortal.map((uid) => ({
          user_id: uid,
          kind: 'evento',
          title: 'Próxima reunión',
          body: `«${ev.title.slice(0, 80)}» comienza ${cuando(ev)}`,
          link: enlaceReunion(ev.id),
        })),
      )
      if (notifErr) console.error('check-event-reminders: aviso en portal falló:', notifErr.message)
      else enPortal += destinoPortal.length
    }

    // El push va a la misma lista que la campana (sin las cuentas de
    // servicio). Con lista vacía no se llama (tampoco avisaría a nadie: en
    // broadcastPush, userIds [] = nadie).
    if (destinoPortal.length > 0) {
      const res = await broadcastPush(
        admin,
        {
          title: 'Próxima reunión',
          body: `«${ev.title.slice(0, 80)}» comienza ${cuando(ev)}`,
          url: enlaceReunion(ev.id),
          tag: `evento-${ev.id}`,
        },
        { userIds: destinoPortal },
      )
      push += res.sent
    }

    if (correosSinAuth) continue
    let destinatarios: string[]
    try {
      destinatarios = await conPlazo(teamEmails(admin, userIds), PLAZO_CORREOS_MS)
    } catch (err) {
      correosSinAuth = true
      console.error('check-event-reminders: correos del equipo no disponibles, la corrida sigue sin correo', {
        id: ev.id,
        motivo: err instanceof Error ? err.message.slice(0, 200) : 'error desconocido',
      })
      continue
    }
    try {
      const sent = await sendEmailTo(destinatarios, renderReminderEmail(ev, portalUrl), `Calendario — ${nombrePortal()}`)
      email += sent.sent
    } catch {
      // correo best-effort: no debe frenar el resto de recordatorios
    }
  }

  return Response.json({ reminded: events.length, enPortal, push, email, sinAviso, aReintentar })
}

// Cada 5 minutos: el margen de error de un recordatorio queda en ±5 min
// Función programada de Netlify: solo se lee schedule (sin @netlify/functions)
export const config = {
  schedule: '*/5 * * * *',
}

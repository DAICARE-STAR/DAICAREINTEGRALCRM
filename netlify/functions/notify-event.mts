import { z } from 'zod'
import { auditar, autenticar, exigir, limiteBase, respuesta, tokenDeCabecera } from '../lib/autorizacion.mts'
import { resumenError } from '../lib/errores.mts'
import {
  destinoAviso,
  enlaceHttps,
  enlaceReunion,
  esBloqueMantenimiento,
  esCuentaServicio,
  escHtml,
  nombrePortal,
  sendEmailTo,
  type Asistente,
  type EmailContent,
} from '../lib/email.mts'
import {
  buildInvite,
  planSerie,
  reglaSerie,
  tipoSerie,
  uidSerie,
  type Attendee,
  type InviteEvent,
  type OpcionesInvitacion,
  type Repeticion,
} from '../lib/ics.mts'
import { broadcastPush } from '../lib/push.mts'

// Aviso inmediato al crear (o actualizar) una reunión del calendario:
//
//   1. Notificación push a los invitados (o a todo el equipo si es abierta).
//   2. Correo por el SMTP de Titan con la reunión adjunta como INVITACIÓN de
//      calendario (iCalendar METHOD:REQUEST). Es el mismo mecanismo que usa
//      Google para invitar: al abrirlo en Gmail, el evento se añade a Google
//      Calendar con los botones Sí / No / Quizá. Igual en Outlook y Apple.
//
// Un bloque de mantenimiento («MANT · …») avisa solo a sus invitados y, sin
// invitados, a nadie. Si la lista de invitados no se puede leer, responde
// 503 sin avisar: una reunión privada nunca sale a todo el equipo.
//
// Seguridad: exige sesión válida y el CONTENIDO del aviso se compone AQUÍ
// desde la base — el cliente solo manda el id del evento, nunca el texto.

const bodySchema = z
  .object({
    // z.guid(): mismo formato de id que aceptaba zod 3 (z.uuid() de zod 4
    // exige los bits de versión y variante)
    eventId: z.guid(),
    cancel: z.boolean().optional(),
    // Cancelación solo para estos invitados (los que se quitan al editar).
    // Se cruza con los invitados guardados: nadie más puede recibirla. Con
    // `serie`, es desde esta fecha: si hay fechas antes, la serie les llega
    // con su nuevo final en vez de cancelarse entera.
    soloA: z.array(z.guid()).min(1).max(200).optional(),
    // Reunión periódica: la invitación (o la cancelación) es de la serie
    // entera, con su regla. Sin él, una ocurrencia de una serie va como
    // cambio de esa sola fecha (RECURRENCE-ID).
    serie: z.boolean().optional(),
  })
  .strict()
  .refine((b) => !b.soloA || b.cancel === true, { message: 'soloA solo con cancel' })

// Fila de calendar_events; las columnas de serie existen desde la 82
type FilaEvento = InviteEvent & {
  created_by: string | null
  serie_id?: string | null
  repeticion?: Repeticion | null
  serie_inicio?: string | null
}

const TEXTO_REPETICION: Record<Repeticion, string> = {
  semanal: 'cada semana',
  quincenal: 'cada dos semanas',
  mensual: 'cada mes',
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-419', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}

const MAX_PER_MINUTE = 10
// Avisos por hora de un mismo miembro, compartido entre instancias
const MAX_POR_HORA = 20

function cuando(ev: InviteEvent): string {
  const start = new Date(ev.starts_at)
  if (ev.all_day) {
    // Fecha civil de Bogotá, la misma del .ics adjunto
    return start.toLocaleDateString('es-419', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Bogota',
    })
  }
  return start.toLocaleString('es-419', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  })
}

// `desde`: cancelación de una serie desde esa fecha (las anteriores siguen)
function renderEmail(
  ev: InviteEvent,
  quien: string,
  portalUrl: string,
  cancel: boolean,
  repite: string | null = null,
  desde: string | null = null,
): EmailContent {
  const titulo = ev.title.slice(0, 80)
  const cancelada = desde ? `Cancelada desde el ${desde}` : 'Cancelada'
  const subject = cancel
    ? `${cancelada}: «${titulo}»`
    : `Invitación: «${titulo}» — ${cuando(ev)}`

  const detalles = [
    `Hora: ${cuando(ev)}${ev.all_day ? '' : ' (hora Colombia)'}`,
    repite ? `Frecuencia: ${repite}` : null,
    ev.location ? `Lugar: ${ev.location}` : null,
  ].filter(Boolean)
  const unirse = cancel ? null : enlaceHttps(ev.meeting_url)

  const html = `
  <div style="background:#F2F0EC;padding:28px 12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E4E1DB;border-radius:12px;overflow:hidden;">
      <div style="background:#171512;padding:18px 20px;">
        <span style="color:#7CC3DC;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${escHtml(nombrePortal())}</span>
        <h1 style="color:#ffffff;font-size:18px;margin:6px 0 0;">${cancel ? (desde ? `Reunión cancelada desde el ${escHtml(desde)}` : 'Reunión cancelada') : 'Nueva reunión'}</h1>
      </div>
      <div style="padding:20px;">
        <p style="color:#171512;font-size:16px;font-weight:600;margin:0 0 10px;${cancel && !desde ? 'text-decoration:line-through;' : ''}">${escHtml(ev.title)}</p>
        ${detalles.map((d) => `<p style="color:#625C52;font-size:13.5px;margin:0 0 6px;">${escHtml(d as string)}</p>`).join('')}
        ${ev.description ? `<p style="color:#171512;font-size:13.5px;margin:12px 0 0;white-space:pre-line;">${escHtml(ev.description)}</p>` : ''}
        <p style="color:#625C52;font-size:12.5px;margin:14px 0 0;">Convocada por ${escHtml(quien)}</p>
      </div>
      <div style="padding:0 20px 20px;text-align:center;">
        ${
          // Solo https: un meeting_url con otro esquema (javascript:, data:)
          // no debe convertirse en botón del correo
          unirse
            ? `<a href="${escHtml(unirse)}" style="display:inline-block;background:#7CC3DC;color:#171512;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px;text-decoration:none;margin-right:8px;">Unirse a la reunión</a>`
            : ''
        }
        <a href="${portalUrl}${enlaceReunion(ev.id)}" style="display:inline-block;color:#171512;font-weight:600;font-size:13px;padding:11px 16px;text-decoration:underline;">Ver en el calendario</a>
      </div>
      ${
        cancel
          ? ''
          : `<p style="color:#AAA49A;font-size:11px;text-align:center;padding:0 20px 18px;margin:0;">
        Este correo lleva la reunión adjunta: tu calendario (Google, Outlook o Apple)
        debería ofrecerte añadirla y confirmar asistencia.
      </p>`
      }
    </div>
  </div>`

  const text =
    (cancel
      ? `Reunión CANCELADA${desde ? ` desde el ${desde}` : ''}: ${ev.title}`
      : `Nueva reunión: ${ev.title}`) +
    `\n` +
    detalles.map((d) => d?.replace(/^[^\s]+\s/, '')).join('\n') +
    (ev.description ? `\n\n${ev.description}` : '') +
    `\n\nConvocada por ${quien}` +
    // Igual que el botón: un enlace que no es https no va ni en texto plano,
    // porque el cliente de correo lo vuelve clicable
    (unirse ? `\nUnirse: ${unirse}` : '') +
    `\n\nCalendario: ${portalUrl}${enlaceReunion(ev.id)}`

  return { subject, html, text }
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 })
  }

  // Sesión, regla de MFA y límite por minuto: helper común
  const r = await autenticar(tokenDeCabecera(req.headers.get('authorization')), {
    maxPorMinuto: MAX_PER_MINUTE,
    accion: 'notify-event',
  })
  if (r.fallo) return respuesta(r.fallo)
  const { ctx } = r
  const admin = ctx.admin
  // Los eventos son del módulo calendario: inactivo, 403 modulo_inactivo
  const sinModulo = await exigir(ctx, { modulo: 'calendario' }, 'notify-event')
  if (sinModulo) return respuesta(sinModulo)

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return Response.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  // El evento y su texto salen de la base, no del cliente. select * tolera
  // bases sin las columnas de serie (migración 82 pendiente).
  const { data: ev, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('id', parsed.eventId)
    .maybeSingle<FilaEvento>()
  if (error) {
    // El mensaje de PostgREST queda en el registro, no en la respuesta
    console.error('notify-event: no se pudo leer el evento', { codigo: error.code })
    return Response.json({ error: 'No se pudo leer el evento' }, { status: 500 })
  }
  if (!ev) return Response.json({ error: 'Evento no encontrado' }, { status: 404 })

  // Solo el creador o un admin pueden convocar en nombre del equipo
  if (ev.created_by !== ctx.userId && !ctx.esAdmin) {
    console.warn('[seguridad] denegado', { codigo: 'sin_permiso', userId: ctx.userId, accion: 'notify-event' })
    return Response.json(
      { error: 'Solo quien creó la reunión (o un admin) puede avisar al equipo.', codigo: 'sin_permiso' },
      { status: 403 },
    )
  }

  const tasa = await limiteBase(ctx, 'notify-event:' + ctx.userId, 3600, MAX_POR_HORA)
  if (tasa) return respuesta(tasa)

  // Destinatarios: los invitados del creador; si no hay, todo el equipo
  // (salvo un bloque de mantenimiento). select * tolera bases sin la
  // columna invited (migración 15 pendiente).
  const { data: att, error: errAtt } = await admin
    .from('event_attendees')
    .select('*')
    .eq('event_id', ev.id)
  if (errAtt) {
    // Un fallo de lectura nunca es «sin invitados»: la invitación y el push
    // de una reunión privada saldrían a todo el equipo. No se avisa a nadie
    // y quien convoca ve el error para reintentar.
    console.error('notify-event: invitados no disponibles, sin aviso', { id: ev.id, codigo: errAtt.code })
    return Response.json(
      {
        error: 'No se pudo leer la lista de invitados y no se envió ningún aviso. Intenta de nuevo en unos minutos.',
        codigo: 'invitados_no_disponibles',
      },
      { status: 503 },
    )
  }
  const asistentes = (att ?? []) as Asistente[]
  // Cancelación parcial: solo a los invitados pedidos que de verdad figuran.
  // Sin coincidencias no se avisa a nadie (nunca cae a «todo el equipo»).
  const pedidos = parsed.soloA ? new Set(parsed.soloA) : null
  const quitados = pedidos
    ? asistentes.filter((a) => a.invited !== false && pedidos.has(a.user_id)).map((a) => a.user_id)
    : []
  const destino = !pedidos
    ? destinoAviso(ev, asistentes)
    : quitados.length > 0
      ? { modo: 'invitados' as const, userIds: quitados }
      : { modo: 'nadie' as const }
  if (destino.modo === 'nadie') {
    // Ni push ni correo, tampoco a quien convoca. La interfaz lo muestra
    // como «No había a quién avisar (revisa los invitados)».
    console.log('notify-event: bloque de mantenimiento sin invitados, sin aviso', { id: ev.id })
    return Response.json({
      recipients: 0,
      push: { sent: 0, removed: 0 },
      email: { sent: 0 },
      sinAviso: 'mantenimiento_sin_invitados',
    })
  }
  const userIds = destino.modo === 'invitados' ? destino.userIds : undefined

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const users = (list?.users ?? []).filter((u) => u.email && !esCuentaServicio(u.email))
  const destinatarios: Attendee[] = users
    .filter((u) => !userIds || userIds.includes(u.id))
    .map((u) => ({ email: u.email as string }))

  // Quien convoca siempre recibe la invitación: así la reunión también queda
  // en SU calendario (Google/Outlook/Apple), aunque no se haya autoinvitado.
  // `users` ya excluye las cuentas de servicio, que no tienen buzón real: si
  // el convocante es una de ellas, no se añade (el SMTP rechazaría el envío).
  // Un bloque de mantenimiento va solo a sus invitados: ahí no se añade.
  // Tampoco en una cancelación parcial: la reunión sigue en pie para él.
  const convocante = esBloqueMantenimiento(ev.title) || pedidos
    ? undefined
    : users.find((u) => u.id === ev.created_by)?.email
  if (convocante && !destinatarios.some((d) => d.email === convocante)) {
    destinatarios.unshift({ email: convocante })
  }

  const portalUrl = process.env.URL ?? 'http://localhost:5190'
  const quien = ctx.nombre ?? (ctx.email || 'un miembro del equipo')
  const cancel = parsed.cancel === true

  // El enlace de la reunión solo viaja si es https, también en el ICS
  // adjunto: Google, Outlook y Apple guardan ese evento en el calendario de
  // cada invitado con el enlace clicable («Unirse:» y URL), y buildInvite lo
  // escribe tal cual. Mismo saneo que el feed (calendar-ics): el CHECK de la
  // 63 es NOT VALID y deja pasar filas viejas.
  const evAviso: InviteEvent = { ...(ev as InviteEvent), meeting_url: enlaceHttps(ev.meeting_url) }
  // Lo que va en el adjunto .ics: en una serie, el maestro (planSerie); el
  // correo y el push muestran la fecha que disparó el aviso, con su cambio
  let evIcs: InviteEvent = evAviso

  // Reunión periódica: la invitación lleva el UID de la serie. Con `serie`,
  // es la serie entera (DTSTART de la primera ocurrencia y RRULE hasta la
  // última); si no, solo esta fecha (RECURRENCE-ID = su inicio original).
  // SEQUENCE crece con el tiempo desde que se creó la serie: cada reenvío
  // gana al anterior en el calendario de cada invitado.
  let opciones: OpcionesInvitacion = { cancel }
  let repite: string | null = null
  // Fecha desde la que se cancela (quitar invitados de «Esta y las siguientes»)
  let desde: string | null = null
  if (ev.serie_id && ev.repeticion) {
    const sequence = Math.max(0, Math.floor((Date.now() - new Date(ev.created_at).getTime()) / 1000))
    // La serie entera hace falta en los dos casos: para la invitación de la
    // serie (maestro, EXDATE y excepciones) y, en una sola fecha, para el
    // tipo del RECURRENCE-ID (el de la serie, no el de la fecha)
    const { data: filas, error: errSerie } = await admin
      .from('calendar_events')
      .select('*')
      .eq('serie_id', ev.serie_id)
      .order('starts_at')
    const lista = (filas ?? []) as FilaEvento[]
    if (errSerie || lista.length === 0) {
      console.error('notify-event: no se pudo leer la serie', { id: ev.id, codigo: errSerie?.code })
      return Response.json({ error: 'No se pudo leer la serie de la reunión' }, { status: 500 })
    }
    const sanear = (f: InviteEvent): InviteEvent => ({ ...f, meeting_url: enlaceHttps(f.meeting_url) })
    // El tipo (con hora o de todo el día) sale de la columna all_day de las
    // fechas de la serie entera
    const allDay = tipoSerie(lista)
    // Quitar invitados de «Esta y las siguientes» desde una fecha que no es
    // la primera: para ellos la serie termina antes. No se les cancela
    // entera (las fechas anteriores siguen siendo suyas): se les reenvía
    // con su nuevo final, como al eliminar desde una fecha.
    const original = (f: FilaEvento) => new Date(f.serie_inicio ?? f.starts_at).getTime()
    const previas = pedidos && parsed.serie ? lista.filter((f) => original(f) < original(ev)) : []
    const plan = planSerie(previas.length > 0 ? previas : lista, ev.repeticion, allDay)
    if (parsed.serie) {
      // El maestro del .ics lleva los datos que comparten más fechas; las
      // que difieren (hora, lugar, enlace…) van como excepción
      evIcs = sanear(plan.maestro)
      opciones = {
        cancel: cancel && previas.length === 0,
        uid: uidSerie(ev.serie_id),
        rrule: reglaSerie(ev.repeticion, plan.ultimo, plan.allDay),
        exdates: plan.exdates,
        excepciones: plan.excepciones.map((x) => ({ ...x, ev: sanear(x.ev) })),
        zona: true,
        recurrenceAllDay: plan.allDay,
        sequence,
      }
      if (previas.length > 0) desde = fechaCorta(ev.serie_inicio ?? ev.starts_at)
      else repite = `${TEXTO_REPETICION[ev.repeticion]}, hasta el ${fechaCorta(plan.ultimo)}`
    } else {
      opciones = {
        cancel,
        uid: uidSerie(ev.serie_id),
        recurrenceId: ev.serie_inicio ?? ev.starts_at,
        recurrenceAllDay: plan.allDay,
        zona: true,
        sequence,
      }
    }
  }

  // 1) Push inmediato: a los invitados o, en una reunión abierta, al equipo
  // ya sin las cuentas de servicio. Con lista vacía no se llama (tampoco
  // avisaría a nadie: en broadcastPush, userIds [] = nadie).
  const destinoPush = userIds ?? users.map((u) => u.id)
  const push =
    destinoPush.length > 0
      ? await broadcastPush(
          admin,
          {
            title: cancel ? 'Reunión cancelada' : 'Nueva reunión',
            body: `«${ev.title.slice(0, 70)}» · ${desde ? 'desde el ' : ''}${cuando(evAviso)}`,
            url: enlaceReunion(ev.id),
            tag: `evento-nuevo-${ev.id}`,
          },
          { userIds: destinoPush },
        )
      : { sent: 0, removed: 0 }

  // 2) Correo con la invitación de calendario adjunta
  let email: { sent: number; error?: string; codigo?: string } = { sent: 0 }
  try {
    const organizerEmail = process.env.SMTP_USER
    if (organizerEmail && destinatarios.length > 0) {
      const ics = buildInvite(
        evIcs,
        { email: organizerEmail, name: `${quien} — ${nombrePortal()}` },
        destinatarios,
        opciones,
      )
      email = await sendEmailTo(
        destinatarios.map((d) => d.email),
        renderEmail(evAviso, quien, portalUrl, cancel, repite, desde),
        `Calendario — ${nombrePortal()}`,
        {
          visibleTo: true,
          // El nuevo final de una serie (`desde`) va como actualización
          icalEvent: { method: opciones.cancel ? 'CANCEL' : 'REQUEST', content: ics },
        },
      )
    }
  } catch (err) {
    // El correo es best-effort (el evento ya está creado), pero el fallo NO
    // puede quedar en silencio: si no, la interfaz diría "invitación enviada"
    // sin haber enviado nada. Al cliente va un texto fijo con código; al log,
    // solo el nombre y el código del error SMTP (seguridad.md: ni el objeto
    // ni el mensaje, que puede traer el usuario o la respuesta del servidor).
    const { nombre, codigo } = resumenError(err)
    console.error('notify-event: correo', { nombre, codigo })
    email = { sent: 0, error: 'falló el servidor de correo', codigo: 'smtp' }
  }

  // Constancia del aviso (origen servidor), con cifras y sin correos
  await auditar(admin, {
    userId: ctx.userId,
    email: ctx.email,
    action: cancel ? 'reunion.cancelar_aviso' : 'reunion.avisar',
    detail: `${destinatarios.length} destinatarios · push ${push.sent} · correo ${email.sent}`,
    entity: 'calendar_events',
    entityId: ev.id,
  })

  return Response.json({ recipients: destinatarios.length, push, email })
}

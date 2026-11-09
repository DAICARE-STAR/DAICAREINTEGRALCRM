// Utilidades iCalendar (RFC 5545) compartidas por el feed del calendario
// (calendar-ics) y las invitaciones por correo (notify-event). El escapado y
// el plegado de líneas son sutiles: viven en un solo sitio para que las dos
// salidas no diverjan.

import { enlaceHttps } from './email.mts'

// Texto seguro para ICS: escapa \ ; , y saltos de línea (CRLF, LF o un CR
// suelto, que el cliente de calendario tomaría como fin de línea)
export function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Valor de un parámetro (CN= de ORGANIZER y ATTENDEE). No es TEXT: ahí la
// barra no escapa nada, y un «:» o «;» sin comillas corta la lista de
// parámetros y reescribe el mailto. Va entre comillas dobles, sin comillas
// ni saltos de línea dentro (RFC 5545, 3.2: quoted-string).
export function escParam(value: string): string {
  return `"${String(value).replace(/["\r\n]/g, '')}"`
}

// Octetos de un carácter en UTF-8 (un sustituto suelto sale como U+FFFD: 3)
function octetosUtf8(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

// Plegado de líneas largas según RFC 5545 (3.1): como mucho 75 octetos
// UTF-8 por línea, sin partir un carácter (ni sus octetos ni un par
// sustituto). La continuación empieza con un espacio, que cuenta en sus 75.
export function fold(line: string): string {
  const out: string[] = []
  let actual = ''
  let octetos = 0
  for (const ch of line) {
    const n = octetosUtf8(ch)
    if (octetos + n > 75) {
      out.push(actual)
      actual = ' '
      octetos = 1
    }
    actual += ch
    octetos += n
  }
  out.push(actual)
  return out.join('\r\n')
}

// 2026-08-02T15:30:00Z → 20260802T153000Z
export function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Fecha civil de Bogotá (AAAA-MM-DD), la del equipo: un evento de todo el
// día guardado después de las 19:00 no cae al día siguiente. Misma regla
// que civilBogota de gcalendar.mts y que src/lib/calendar.ts.
function civilBogota(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// Solo la fecha (eventos de día completo)
export function dateOnly(iso: string): string {
  return civilBogota(iso).replace(/-/g, '')
}

// En ICS los eventos de día completo terminan en la fecha EXCLUSIVA
export function nextDay(iso: string): string {
  const [y, m, d] = civilBogota(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
}

export type InviteEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  meeting_url: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  created_at: string
  updated_at: string
}

export type Attendee = { email: string; name?: string | null }

export type Repeticion = 'semanal' | 'quincenal' | 'mensual'

// UID de una serie en las invitaciones: distinto del de cada fila (el feed
// sigue publicando una fila por ocurrencia con su propio id)
export function uidSerie(serieId: string): string {
  return `serie-${serieId}@portal.invalid`
}

// Colombia no tiene horario de verano: UTC-5 fijo todo el año
const BOGOTA_MS = 5 * 3600_000
export const TZID_BOGOTA = 'America/Bogota'

// Hora de pared de Bogotá (20261102T100000) de un instante ISO
export function horaBogota(iso: string): string {
  return new Date(new Date(iso).getTime() - BOGOTA_MS)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')
}

// Inicios originales de la serie (ms), de `primero` a `ultimo` inclusive,
// contados en hora de Bogotá: la misma regla que reglaSerie con TZID y que
// ocurrencias() de src/lib/calendar.ts. Sirve para saber qué fechas faltan
// (EXDATE).
export function iniciosSerie(repeticion: Repeticion, primero: string, ultimo: string): number[] {
  const t0 = new Date(primero).getTime()
  const fin = new Date(ultimo).getTime()
  const pared = new Date(t0 - BOGOTA_MS)
  const out: number[] = []
  for (let k = 0; k < 400; k++) {
    const t =
      repeticion === 'mensual'
        ? Date.UTC(
            pared.getUTCFullYear(),
            pared.getUTCMonth() + k,
            pared.getUTCDate(),
            pared.getUTCHours(),
            pared.getUTCMinutes(),
          ) + BOGOTA_MS
        : t0 + k * (repeticion === 'quincenal' ? 14 : 7) * 86400_000
    if (t > fin) break
    out.push(t)
  }
  return out
}

// RRULE de la serie hasta su última ocurrencia (UNTIL inclusivo, en UTC como
// pide el RFC con DTSTART;TZID). El día de la semana y el del mes salen del
// DTSTART en hora de Bogotá; las mensuales del portal solo admiten días 1 a
// 28, así que no hay meses que la regla salte.
export function reglaSerie(repeticion: Repeticion, ultimoInicio: string, allDay: boolean): string {
  const freq =
    repeticion === 'mensual' ? 'FREQ=MONTHLY' : `FREQ=WEEKLY;INTERVAL=${repeticion === 'quincenal' ? 2 : 1}`
  return `${freq};UNTIL=${allDay ? dateOnly(ultimoInicio) : utc(ultimoInicio)}`
}

// Fila de una serie tal como la guarda calendar_events (migración 82)
export type FilaSerie = InviteEvent & { serie_inicio?: string | null }

export type PlanSerie = {
  maestro: InviteEvent
  allDay: boolean
  primero: string
  ultimo: string
  exdates: string[]
  excepciones: { recurrenceId: string; ev: InviteEvent }[]
}

// Tipo de la serie (con hora o de todo el día), de la columna all_day de
// las fechas que siguen en su inicio original: pasar una fecha suelta a
// «Todo el día» casi siempre la mueve (empieza a las 8:00). Si entre esas
// hay de los dos tipos, la serie es a las 8:00 y es con hora: lo habitual es
// pasar una fecha suelta a «Todo el día»; lo contrario exige poner a mano
// una hora que empiece justo a las 8:00. No se cuenta por mayoría: el tipo
// no cambia por cuántas fechas sueltas se pasen al otro.
// No hay columna con el tipo de la serie a propósito (1.11.31): no vale una
// migración, y el único caso que esta regla toma mal (una fecha suelta de
// una serie de todo el día pasada a una hora que empieza a las 8:00) queda
// fijado en las pruebas.
export function tipoSerie(filas: FilaSerie[]): boolean {
  const ms = (iso: string) => new Date(iso).getTime()
  const sinMover = filas.filter((f) => ms(f.starts_at) === ms(f.serie_inicio ?? f.starts_at))
  const referencia = sinMover.length > 0 ? sinMover : filas
  return referencia.length > 0 && referencia.every((f) => f.all_day)
}

// La serie como la entiende un calendario (RFC 5546): un maestro con la
// regla y los datos que comparten más fechas, EXDATE para las fechas
// originales que ya no existen y un VEVENT con RECURRENCE-ID por cada fecha
// que difiere del maestro en hora, duración o datos (título, lugar, enlace,
// descripción, «todo el día»). Así un reenvío desde cualquier fecha manda
// lo mismo y ninguna fecha arrastra a las demás. `allDay` es el tipo de la
// serie entera cuando `filas` es solo una parte (el nuevo final de quienes
// salen desde una fecha); sin él, sale de tipoSerie (sin columna propia: ver
// allí por qué).
export function planSerie(
  filas: FilaSerie[],
  repeticion: Repeticion,
  allDay: boolean = tipoSerie(filas),
): PlanSerie {
  const ms = (iso: string) => new Date(iso).getTime()
  const original = (f: FilaSerie) => f.serie_inicio ?? f.starts_at
  const firma = (f: FilaSerie) =>
    JSON.stringify([
      f.title,
      f.description ?? null,
      f.location ?? null,
      f.meeting_url ?? null,
      f.all_day,
      ms(f.ends_at) - ms(f.starts_at),
    ])
  const ordenadas = [...filas].sort((a, b) => ms(original(a)) - ms(original(b)))
  // Maestro: entre las fechas del tipo de la serie (el RECURRENCE-ID debe
  // casar con el maestro que ya tiene el invitado), la firma más repetida;
  // en empate, la de la fecha más temprana
  const delTipo = ordenadas.filter((f) => f.all_day === allDay)
  const candidatas = delTipo.length > 0 ? delTipo : ordenadas
  const cuenta = new Map<string, number>()
  for (const f of candidatas) cuenta.set(firma(f), (cuenta.get(firma(f)) ?? 0) + 1)
  const base = candidatas.reduce((mejor, f) =>
    (cuenta.get(firma(f)) ?? 0) > (cuenta.get(firma(mejor)) ?? 0) ? f : mejor
  )
  const firmaBase = firma(base)
  const primero = original(ordenadas[0])
  const ultimo = original(ordenadas[ordenadas.length - 1])
  const duracion = ms(base.ends_at) - ms(base.starts_at)
  const existentes = new Set(ordenadas.map((f) => ms(original(f))))
  return {
    maestro: {
      ...base,
      all_day: allDay,
      starts_at: primero,
      ends_at: new Date(ms(primero) + duracion).toISOString(),
    },
    allDay,
    primero,
    ultimo,
    exdates: iniciosSerie(repeticion, primero, ultimo)
      .filter((t) => !existentes.has(t))
      .map((t) => new Date(t).toISOString()),
    excepciones: ordenadas
      .filter((f) => ms(f.starts_at) !== ms(original(f)) || firma(f) !== firmaBase)
      .map((f) => ({ recurrenceId: original(f), ev: f })),
  }
}

export type OpcionesInvitacion = {
  cancel?: boolean
  // Serie: UID común y, o bien la regla (la serie entera), o bien la
  // ocurrencia que se cambia o cancela (RECURRENCE-ID = su inicio original)
  uid?: string
  rrule?: string
  recurrenceId?: string
  // Serie entera: fechas originales que ya no existen y fechas movidas
  // (cada una va como VEVENT propio con su RECURRENCE-ID)
  exdates?: string[]
  excepciones?: { recurrenceId: string; ev: InviteEvent }[]
  // Horas con TZID=America/Bogota (series): la regla se expande en la hora
  // de Colombia en cualquier zona del invitado
  zona?: boolean
  // RECURRENCE-ID va con el tipo de la SERIE (fecha o fecha-hora), aunque
  // la fecha cambiada sea de otro tipo (RFC 5545 §3.8.4.4)
  recurrenceAllDay?: boolean
  // Sin él, se deriva de updated_at - created_at de la fila
  sequence?: number
}

const VTIMEZONE_BOGOTA = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID_BOGOTA}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0500',
  'TZNAME:-05',
  'END:STANDARD',
  'END:VTIMEZONE',
]

// Valor de fecha: día (todo el día), hora de Bogotá (con TZID) o UTC
function valorFecha(iso: string, allDay: boolean, zona: boolean, esFin = false): string {
  if (allDay) return esFin ? nextDay(iso) : dateOnly(iso)
  return zona ? horaBogota(iso) : utc(iso)
}

function propFecha(nombre: string, iso: string, allDay: boolean, zona: boolean, esFin = false): string {
  const params = allDay ? ';VALUE=DATE' : zona ? `;TZID=${TZID_BOGOTA}` : ''
  return `${nombre}${params}:${valorFecha(iso, allDay, zona, esFin)}`
}

// Invitación de calendario (METHOD:REQUEST). Es el mismo mecanismo que usan
// Google Calendar y Outlook para invitar: al llegar como adjunto del correo,
// el cliente ofrece añadir el evento y responder Sí/No/Quizá.
export function buildInvite(
  ev: InviteEvent,
  organizer: { email: string; name: string },
  attendees: Attendee[],
  opts: OpcionesInvitacion = {},
): string {
  const cancel = opts.cancel === true
  // Con zona, las horas van con TZID (propFecha deja en DATE las de todo el
  // día); el VTIMEZONE va siempre que haya zona, por si una fecha cambiada
  // tiene hora aunque la serie no
  const zona = opts.zona === true
  const recurrenceAllDay = opts.recurrenceAllDay ?? ev.all_day
  // SEQUENCE debe crecer en cada reenvío o el cliente ignora la
  // actualización. Se deriva de updated_at para no guardar un contador.
  const sequence =
    opts.sequence ??
    Math.max(0, Math.floor((new Date(ev.updated_at).getTime() - new Date(ev.created_at).getTime()) / 1000))
  const uid = opts.uid ?? `${ev.id}@portal.invalid`
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TailorSuite//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancel ? 'CANCEL' : 'REQUEST'}`,
    ...(zona ? VTIMEZONE_BOGOTA : []),
    ...lineasVevent(ev, organizer, attendees, {
      uid,
      sequence,
      cancel,
      zona,
      rrule: opts.rrule,
      recurrenceId: opts.recurrenceId,
      recurrenceAllDay,
      exdates: opts.exdates,
    }),
  ]
  // Fechas cambiadas de la serie: el mismo UID con su RECURRENCE-ID original
  if (!cancel) {
    for (const x of opts.excepciones ?? []) {
      lines.push(
        ...lineasVevent(x.ev, organizer, attendees, {
          uid,
          sequence,
          cancel,
          zona,
          recurrenceId: x.recurrenceId,
          recurrenceAllDay,
        }),
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function lineasVevent(
  ev: InviteEvent,
  organizer: { email: string; name: string },
  attendees: Attendee[],
  o: {
    uid: string
    sequence: number
    cancel: boolean
    zona: boolean
    rrule?: string
    recurrenceId?: string
    recurrenceAllDay?: boolean
    exdates?: string[]
  },
): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    fold(`UID:${o.uid}`),
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `SEQUENCE:${o.sequence}`,
    propFecha('DTSTART', ev.starts_at, ev.all_day, o.zona),
    propFecha('DTEND', ev.ends_at, ev.all_day, o.zona, true),
  ]
  if (o.rrule) lines.push(`RRULE:${o.rrule}`)
  if (o.exdates?.length) {
    const params = ev.all_day ? ';VALUE=DATE' : o.zona ? `;TZID=${TZID_BOGOTA}` : ''
    lines.push(fold(`EXDATE${params}:${o.exdates.map((x) => valorFecha(x, ev.all_day, o.zona)).join(',')}`))
  }
  if (o.recurrenceId) {
    lines.push(propFecha('RECURRENCE-ID', o.recurrenceId, o.recurrenceAllDay ?? ev.all_day, o.zona))
  }

  lines.push(fold(`SUMMARY:${esc(ev.title)}`))

  // El enlace solo viaja si es https (defensa en profundidad: notify-event
  // ya lo sanea, igual que calendar-ics)
  const enlace = enlaceHttps(ev.meeting_url)
  const desc = [ev.description, enlace ? `Unirse: ${enlace}` : null]
    .filter(Boolean)
    .join('\n\n')
  if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`))
  if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`))
  if (enlace) lines.push(fold(`URL:${esc(enlace)}`))

  // El ORGANIZER es el buzón que realmente envía: si no coincide con el
  // remitente SMTP, varios clientes marcan la invitación como sospechosa.
  lines.push(fold(`ORGANIZER;CN=${escParam(organizer.name)}:mailto:${organizer.email}`))

  // Solo se declara RSVP=TRUE (pedir respuesta). CUTYPE, ROLE y PARTSTAT ya
  // tienen justo el valor que queremos por defecto en el RFC, y omitirlos
  // deja la línea corta: así no hace falta plegarla, que es donde algunos
  // clientes de calendario tropiezan.
  for (const a of attendees) {
    lines.push(
      fold(`ATTENDEE;RSVP=TRUE` + (a.name ? `;CN=${escParam(a.name)}` : '') + `:mailto:${a.email}`),
    )
  }

  lines.push(`STATUS:${o.cancel ? 'CANCELLED' : 'CONFIRMED'}`)
  lines.push('TRANSP:OPAQUE')
  lines.push('END:VEVENT')
  return lines
}

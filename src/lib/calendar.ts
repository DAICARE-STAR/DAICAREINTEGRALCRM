import type {
  AttendeeStatus,
  CalendarEvent,
  CalendarSubscription,
  EventAttendee,
  ExternalCalendarInfo,
  ExternalEvent,
  Repeticion,
  TeamMember,
} from '../types'
import { supabase } from './supabase'

// Datos del calendario del equipo. La seguridad real está en RLS:
// todos leen, cada quien crea como sí mismo, y solo el creador o un
// admin edita/elimina.

// Enlace de reunión que se puede volver clicable: solo https y sin
// espacios, comillas ni < >. Es la regla del CHECK de meeting_url
// (migración 63) y la de enlaceHttps de netlify/lib/email.mts; el CHECK es
// NOT VALID, así que las filas viejas pueden traer http:// o javascript:.
export function enlaceHttps(url: string | null | undefined): string | null {
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null
}

// Bloque de mantenimiento: reunión sembrada con el título «MANT · …» (la
// misma regla que esBloqueMantenimiento de netlify/lib/email.mts).
export function esBloqueMantenimiento(titulo: string | null | undefined): boolean {
  return /^\s*MANT · /.test(titulo ?? '')
}

export type CalendarEventInput = {
  title: string
  description: string | null
  location: string | null
  meeting_url: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  remind_minutes: number | null
}

// Reuniones que SE SOLAPAN con el rango (no solo las que empiezan en él):
// unas vacaciones del 28 al 3 también salen al mirar el mes siguiente.
export async function fetchEventsBetween(
  fromIso: string,
  toIso: string
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .lte('starts_at', toIso)
    .gte('ends_at', fromIso)
    .order('starts_at')
  if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

// Una reunión suelta (enlace /calendario?reunion=<id>). null si no existe
// o ya se borró.
export async function fetchEvent(id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as CalendarEvent | null) ?? null
}

// Id de reunión del parámetro ?reunion= (solo un uuid; lo demás se ignora)
export function reunionDeUrl(search: string): string | null {
  const id = new URLSearchParams(search).get('reunion')
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null
}

// Colores de los calendarios suscritos: la paleta de marca (marca.css) en
// hex, porque el CHECK de la migración 16 exige #rrggbb. Acento, info,
// éxito, aviso, error y gris de control.
export const COLORES_CALENDARIO = ['#7CC3DC', '#2A64A8', '#276B3C', '#94520A', '#B3362C', '#817B6F']

export async function fetchUpcomingEvents(limit = 8): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

// ¿La fila es de un invitado del creador? (sin migración 15 la columna no
// existe y todas las filas cuentan como invitación: comportamiento anterior)
export function isInvited(a: EventAttendee): boolean {
  return a.invited !== false
}

// Los bloques de mantenimiento solo salen en el calendario de sus invitados
// y de quien los creó, como en el feed de calendar-ics. Es solo para quitar
// ruido: no es control de acceso (todo el equipo puede leerlos).
export function eventosVisibles(
  eventos: CalendarEvent[],
  asistentes: EventAttendee[],
  userId: string | undefined
): CalendarEvent[] {
  const invitadoEn = new Set(
    asistentes.filter((a) => a.user_id === userId && isInvited(a)).map((a) => a.event_id)
  )
  return eventos.filter(
    (ev) =>
      !esBloqueMantenimiento(ev.title) ||
      (!!userId && ev.created_by === userId) ||
      invitadoEn.has(ev.id)
  )
}

// ¿Esta persona participa en la reunión? La creó o está invitada sin haber
// dicho «No puedo». Las reuniones abiertas no cuentan para nadie en
// concreto (si no, todo el equipo chocaría con todas).
function participa(ev: CalendarEvent, asistentesDelEvento: EventAttendee[], userId: string): boolean {
  if (ev.created_by === userId) return true
  return asistentesDelEvento.some(
    (a) => a.user_id === userId && isInvited(a) && a.status !== 'declined'
  )
}

export type Conflicto = { userId: string; ev: CalendarEvent }

// Choques de agenda de las personas `ids` con el rango [inicio, fin):
// reuniones que se solapan y en las que participan. `excluir` es la propia
// reunión en edición. Avisa; no bloquea.
export function conflictos(
  eventos: CalendarEvent[],
  asistentes: EventAttendee[],
  ids: string[],
  inicioIso: string,
  finIso: string,
  excluir?: string
): Conflicto[] {
  const inicio = new Date(inicioIso).getTime()
  const fin = new Date(finIso).getTime()
  const out: Conflicto[] = []
  for (const ev of eventos) {
    if (ev.id === excluir) continue
    const s = new Date(ev.starts_at).getTime()
    const e = new Date(ev.ends_at).getTime()
    // Una reunión que termina justo cuando empieza la otra no choca
    if (!(s < fin && e > inicio)) continue
    const delEvento = asistentes.filter((a) => a.event_id === ev.id)
    for (const uid of ids) {
      if (participa(ev, delEvento, uid)) out.push({ userId: uid, ev })
    }
  }
  return out
}

// «Mis reuniones»: las que creé, a las que me invitaron y las abiertas
export function esMia(ev: CalendarEvent, asistentes: EventAttendee[], userId: string | undefined): boolean {
  if (!userId) return false
  if (ev.created_by === userId) return true
  const invitados = asistentes.filter((a) => a.event_id === ev.id && isInvited(a))
  return invitados.length === 0 || invitados.some((a) => a.user_id === userId)
}

type FilaInvitacion = { event_id: string; user_id: string; status: AttendeeStatus }

// Las filas que ya existen se dejan como están (ON CONFLICT DO NOTHING: solo
// pide la política de INSERT, no la de UPDATE, que es solo de cada quien)
const SIN_DUPLICAR = { onConflict: 'event_id,user_id', ignoreDuplicates: true }

// Inserta invitaciones; si la columna invited aún no existe (migración 15
// pendiente), reintenta sin ella.
async function insertInvitees(filas: FilaInvitacion[]): Promise<void> {
  if (filas.length === 0) return
  const { error } = await supabase
    .from('event_attendees')
    .upsert(filas.map((f) => ({ ...f, invited: true })), SIN_DUPLICAR)
  if (!error) return
  if (!/invited/i.test(error.message)) throw error
  const { error: retryError } = await supabase.from('event_attendees').upsert(filas, SIN_DUPLICAR)
  if (retryError) throw retryError
}

// Invita a userIds en las reuniones eventIds. Los ya invitados no se tocan.
// Quien respondió por su cuenta (fila invited=false) queda invitado con la
// misma respuesta. La RLS solo deja a cada quien cambiar su propia fila y el
// creador no puede marcar la de otro: esa fila se borra y se inserta de nuevo.
// Solo se leen esas respuestas (pocas): leer todas las filas se cortaría en
// 1000 en una serie larga con muchos invitados.
async function invitar(eventIds: string[], userIds: string[]): Promise<void> {
  if (eventIds.length === 0 || userIds.length === 0) return
  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id, user_id, status')
    .in('event_id', eventIds)
    .in('user_id', userIds)
    .eq('invited', false)
  // Sin la columna invited (migración 15) no hay respuestas que conservar
  if (error && !/invited/i.test(error.message)) throw error
  const respuestas = error ? [] : ((data ?? []) as FilaInvitacion[])
  const clave = (eventId: string, userId: string) => `${eventId}|${userId}`
  const estado = new Map(respuestas.map((a) => [clave(a.event_id, a.user_id), a.status]))
  if (respuestas.length > 0) {
    const { error: errBorrar } = await supabase
      .from('event_attendees')
      .delete()
      .in('event_id', eventIds)
      .in('user_id', userIds)
      .eq('invited', false)
    if (errBorrar) throw errBorrar
  }
  try {
    await insertInvitees(
      eventIds.flatMap((event_id) =>
        userIds.map((user_id) => ({
          event_id,
          user_id,
          status: estado.get(clave(event_id, user_id)) ?? 'pending',
        }))
      )
    )
  } catch (err) {
    // Borrar e insertar no es atómico: si la invitación no entra, se
    // devuelven las respuestas borradas (si esto también falla, un
    // reintento las invita como pendientes)
    if (respuestas.length > 0) {
      await supabase
        .from('event_attendees')
        .upsert(
          respuestas.map((a) => ({ event_id: a.event_id, user_id: a.user_id, status: a.status, invited: false })),
          SIN_DUPLICAR
        )
        .then(
          () => undefined,
          () => undefined
        )
    }
    throw err
  }
}

// Devuelve el id del evento creado: hace falta para avisar al equipo
export async function createEvent(
  input: CalendarEventInput,
  attendeeIds: string[]
): Promise<string> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  // Reunión recién creada: aún no tiene respuestas
  await insertInvitees(
    attendeeIds.map((user_id) => ({ event_id: data.id as string, user_id, status: 'pending' }))
  )
  return data.id as string
}

// alQuitar corre ANTES de borrar a los invitados que salen: la cancelación
// por correo (notifyEvent con soloA) necesita que aún figuren en la base.
// Si alQuitar falla, el borrado sigue igual (el aviso es best-effort).
export async function updateEvent(
  id: string,
  input: CalendarEventInput,
  attendeeIds: string[],
  alQuitar?: (userIds: string[]) => Promise<void>
): Promise<void> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar (¿permisos insuficientes?)')
  }
  // Sincronizar INVITADOS conservando su RSVP; los RSVP espontáneos
  // (invited=false) no se tocan.
  const { data: current, error: errActual } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('event_id', id)
  if (errActual) throw new Error('La reunión se guardó, pero no se pudo leer la lista de invitados.')
  const invitedNow = ((current ?? []) as EventAttendee[]).filter(isInvited)
  const existing = new Set(invitedNow.map((a) => a.user_id))
  const wanted = new Set(attendeeIds)
  const toAdd = attendeeIds.filter((uid) => !existing.has(uid))
  const toRemove = [...existing].filter((uid) => !wanted.has(uid))
  // Quien ya respondió por su cuenta pasa a invitado con su respuesta
  await invitar([id], toAdd).catch(() => {
    throw new Error('La reunión se guardó, pero no se pudo invitar a todos.')
  })
  if (toRemove.length > 0) {
    if (alQuitar) await alQuitar(toRemove).catch(() => {})
    const { error: errQuitar } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', id)
      .in('user_id', toRemove)
    if (errQuitar) throw new Error('La reunión se guardó, pero no se pudo quitar a los invitados.')
  }
}

// ============================================================
// Reuniones periódicas (migración 82): una fila por ocurrencia, unidas por
// serie_id. La invitación por correo es una sola, con la regla (notify-event
// con `serie`).
// ============================================================

export const MAX_OCURRENCIAS = 60
const MAX_DIAS_SERIE = 366
// Colombia no tiene horario de verano: UTC-5 fijo todo el año
const BOGOTA_MS = 5 * 3600_000

// Día del mes en Colombia (la regla mensual repite este día)
export function diaBogota(iso: string): number {
  return new Date(new Date(iso).getTime() - BOGOTA_MS).getUTCDate()
}

// Fechas de la serie desde la primera hasta `hasta` (AAAA-MM-DD, inclusivo),
// contadas en hora de Colombia (como la invitación, que va con
// TZID=America/Bogota), sea cual sea la zona del navegador. Tope de 60
// fechas y de un año. Las mensuales repiten el día del mes (el formulario
// solo deja del 1 al 28). Misma cuenta que iniciosSerie de netlify/lib/ics.mts.
export function ocurrencias(
  inicioIso: string,
  finIso: string,
  repeticion: Repeticion,
  hasta: string
): { starts_at: string; ends_at: string }[] {
  const t0 = new Date(inicioIso).getTime()
  const duracion = new Date(finIso).getTime() - t0
  const pared = new Date(t0 - BOGOTA_MS)
  const [hy, hm, hd] = hasta.split('-').map(Number)
  const limite = Math.min(Date.UTC(hy, hm - 1, hd, 23, 59, 59) + BOGOTA_MS, t0 + MAX_DIAS_SERIE * 86400000)
  const out: { starts_at: string; ends_at: string }[] = []
  for (let i = 0; out.length < MAX_OCURRENCIAS; i++) {
    const t =
      repeticion === 'mensual'
        ? Date.UTC(
            pared.getUTCFullYear(),
            pared.getUTCMonth() + i,
            pared.getUTCDate(),
            pared.getUTCHours(),
            pared.getUTCMinutes()
          ) + BOGOTA_MS
        : t0 + i * (repeticion === 'quincenal' ? 14 : 7) * 86400000
    if (t > limite) break
    out.push({ starts_at: new Date(t).toISOString(), ends_at: new Date(t + duracion).toISOString() })
  }
  return out
}

// Invitados de varias reuniones (las fechas de una serie)
async function invitarEnVarias(eventIds: string[], userIds: string[]): Promise<void> {
  await invitar(eventIds, userIds).catch(() => {
    throw new Error('Las reuniones se guardaron, pero no se pudo invitar a todos.')
  })
}

async function idsDeSerie(serieId: string, desde?: string): Promise<string[]> {
  let q = supabase.from('calendar_events').select('id, starts_at').eq('serie_id', serieId)
  if (desde) q = q.gte('starts_at', desde)
  const { data, error } = await q.order('starts_at')
  if (error) throw error
  return ((data ?? []) as { id: string }[]).map((f) => f.id)
}

// Crea todas las ocurrencias y devuelve sus ids en orden. `serieId` lo
// genera el formulario una vez: si un reintento llega con filas ya creadas
// (falló la invitación), no las duplica y solo completa los invitados.
export async function createSerie(
  input: CalendarEventInput,
  fechas: { starts_at: string; ends_at: string }[],
  repeticion: Repeticion,
  attendeeIds: string[],
  serieId: string
): Promise<string[]> {
  // Un fallo al leer NO es «no existen»: se lanza en vez de duplicar
  let ids = await idsDeSerie(serieId)
  if (ids.length === 0) {
    const { error } = await supabase
      .from('calendar_events')
      .insert(fechas.map((f) => ({ ...input, ...f, serie_id: serieId, repeticion, serie_inicio: f.starts_at })))
    if (error) {
      throw new Error(
        /serie_id|repeticion|serie_inicio/.test(error.message)
          ? 'Las reuniones periódicas necesitan la migración 82.'
          : error.message
      )
    }
    // Después de escribir, cualquier fallo deja el guardado a medias
    ids = await idsDeSerie(serieId).catch(() => {
      throw parcial('Las fechas se crearon, pero no se pudieron leer. Pulsa «Reintentar».')
    })
  }
  await invitarEnVarias(ids, attendeeIds).catch((err: Error) => {
    throw parcial(`${err.message} Pulsa «Reintentar».`)
  })
  return ids
}

// Ocurrencia de la serie anterior a esta (null si esta es la primera)
export async function anteriorDeSerie(ev: CalendarEvent): Promise<string | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('serie_id', ev.serie_id as string)
    .lt('starts_at', ev.starts_at)
    .order('starts_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data ?? []) as { id: string }[])[0]?.id ?? null
}

// ¿El cambio mueve las fechas (hora, duración o «todo el día»)?
export function mueveFechas(ev: CalendarEvent, input: CalendarEventInput): boolean {
  const ms = (iso: string) => new Date(iso).getTime()
  return (
    ms(input.starts_at) !== ms(ev.starts_at) ||
    ms(input.ends_at) - ms(input.starts_at) !== ms(ev.ends_at) - ms(ev.starts_at) ||
    input.all_day !== ev.all_day
  )
}

export type ResultadoSerie = { movida: boolean; primeraId: string; anteriorId: string | null }

// «Esta y las siguientes».
// · Sin mover fechas: los datos cambian en una sola sentencia y la serie
//   sigue siendo la misma (los invitados ya la tienen con su UID).
// · Moviendo fechas: las siguientes pasan a la serie `serieNueva` (la genera
//   el formulario una vez, así un reintento sigue donde quedó: las ya
//   movidas no vuelven a moverse). `antesDeMover` corre con las filas aún
//   en la serie vieja (para cancelarla si se mueve entera). El inicio
//   original se desplaza igual (serie_inicio + delta): una fecha movida
//   antes con «Solo esta» sigue siendo excepción en la serie nueva.
// alQuitar avisa a quienes salen DESPUÉS de guardar y antes de quitarlos.
export async function updateSerieDesde(
  ev: CalendarEvent,
  input: CalendarEventInput,
  attendeeIds: string[],
  opciones: {
    serieNueva: string
    antesDeMover?: (anteriorId: string | null, idEnSerieVieja: string) => Promise<void>
    alQuitar?: (userIds: string[]) => Promise<void>
  }
): Promise<ResultadoSerie> {
  const serieVieja = ev.serie_id as string
  const anteriorId = await anteriorDeSerie(ev)
  const { data: actuales, error: errAtt } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('event_id', ev.id)
  if (errAtt) throw errAtt
  const quitados = ((actuales ?? []) as EventAttendee[])
    .filter((a) => isInvited(a) && !attendeeIds.includes(a.user_id))
    .map((a) => a.user_id)

  const movida = mueveFechas(ev, input)
  let serieFinal = serieVieja
  if (!movida) {
    const { error } = await supabase
      .from('calendar_events')
      .update({
        title: input.title,
        description: input.description,
        location: input.location,
        meeting_url: input.meeting_url,
        remind_minutes: input.remind_minutes,
      })
      .eq('serie_id', serieVieja)
      .gte('starts_at', ev.starts_at)
    if (error) throw new Error('No se pudo guardar la serie.')
  } else {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, starts_at, serie_inicio')
      .eq('serie_id', serieVieja)
      .gte('starts_at', ev.starts_at)
      .order('starts_at')
    if (error) throw error
    const filas = (data ?? []) as { id: string; starts_at: string; serie_inicio: string | null }[]
    // La cancelación de la serie vieja usa una fila que SIGUE en ella (en un
    // reintento, la editada ya puede estar en la nueva). Si falla, lanza y
    // no se mueve nada: con las filas fuera de la serie vieja ya no habría
    // forma de cancelarla desde el portal.
    if (opciones.antesDeMover && filas.length > 0) await opciones.antesDeMover(anteriorId, filas[0].id)
    const nuevoInicio = moverInicios(ev, input)
    const duracion = new Date(input.ends_at).getTime() - new Date(input.starts_at).getTime()
    // Cada fila cambia de serie y de hora en la misma sentencia
    const resultados = await Promise.all(
      filas.map((f) => {
        const { inicio, original } = nuevoInicio(f.starts_at, f.serie_inicio ?? f.starts_at)
        return supabase
          .from('calendar_events')
          .update({
            ...input,
            starts_at: inicio,
            ends_at: new Date(new Date(inicio).getTime() + duracion).toISOString(),
            serie_id: opciones.serieNueva,
            serie_inicio: original,
          })
          .eq('id', f.id)
          .eq('serie_id', serieVieja)
      })
    )
    if (resultados.some((r) => r.error)) {
      throw parcial('La serie quedó a medias: no se pudieron mover todas las fechas. Pulsa «Reintentar» para terminar.')
    }
    serieFinal = opciones.serieNueva
  }

  // Después de escribir, cualquier fallo deja el guardado a medias
  const ids = await (movida ? idsDeSerie(serieFinal) : idsDeSerie(serieFinal, ev.starts_at)).catch(() => {
    throw parcial('La serie se guardó, pero no se pudo terminar. Pulsa «Reintentar».')
  })
  if (quitados.length > 0) {
    // Al mover, la cancelación o el nuevo final de la serie vieja ya los
    // cubre; sin mover, se les cancela la serie antes de quitarlos
    if (!movida && opciones.alQuitar) await opciones.alQuitar(quitados).catch(() => {})
    const { error: errQuitar } = await supabase
      .from('event_attendees')
      .delete()
      .in('event_id', ids)
      .eq('invited', true)
      .in('user_id', quitados)
    if (errQuitar) throw parcial('La serie se guardó, pero no se pudo quitar a los invitados. Pulsa «Reintentar».')
  }
  await invitarEnVarias(ids, attendeeIds).catch((err: Error) => {
    throw parcial(`${err.message} Pulsa «Reintentar».`)
  })
  return { movida, primeraId: ids[0] ?? ev.id, anteriorId }
}

// Error de un guardado que quedó a medias: el formulario bloquea los datos
// y solo deja reintentar lo mismo (o cerrar sabiendo que quedó a medias)
function parcial(mensaje: string): Error {
  return Object.assign(new Error(mensaje), { parcial: true })
}

const BOGOTA = 5 * 3600_000

// Nuevo inicio de cada fecha al mover «Esta y las siguientes».
// · Semanales: el mismo desplazamiento (Colombia no cambia de hora).
// · Mensuales: por hora de pared de Bogotá, con el día del mes nuevo en el
//   mes que le toca (sumar milisegundos correría el día con la longitud de
//   cada mes y la invitación FREQ=MONTHLY ya no coincidiría con el portal).
// Una fecha movida antes con «Solo esta» conserva su diferencia con el
// inicio original.
export function moverInicios(ev: CalendarEvent, input: CalendarEventInput) {
  const ms = (iso: string) => new Date(iso).getTime()
  const delta = ms(input.starts_at) - ms(ev.starts_at)
  const pared = (t: number) => new Date(t - BOGOTA)
  // El ancla es el inicio ORIGINAL de la fecha editada (desplazado igual
  // que ella): si esa fecha se había movido «Solo esta», su día actual no es
  // el de la serie y arrastraría a las demás
  const anclaVieja = ms(ev.serie_inicio ?? ev.starts_at)
  const nueva = pared(anclaVieja + delta)
  const vieja = pared(anclaVieja)
  const meses =
    nueva.getUTCFullYear() * 12 + nueva.getUTCMonth() - (vieja.getUTCFullYear() * 12 + vieja.getUTCMonth())
  return (inicioActual: string, inicioOriginal: string) => {
    if (ev.repeticion !== 'mensual') {
      return {
        inicio: new Date(ms(inicioActual) + delta).toISOString(),
        original: new Date(ms(inicioOriginal) + delta).toISOString(),
      }
    }
    const p = pared(ms(inicioOriginal))
    const original =
      Date.UTC(
        p.getUTCFullYear(),
        p.getUTCMonth() + meses,
        nueva.getUTCDate(),
        nueva.getUTCHours(),
        nueva.getUTCMinutes()
      ) + BOGOTA
    return {
      inicio: new Date(original + (ms(inicioActual) - ms(inicioOriginal))).toISOString(),
      original: new Date(original).toISOString(),
    }
  }
}

// Borra esta ocurrencia y las siguientes (desde la primera: la serie entera)
export async function borrarSerieDesde(ev: CalendarEvent): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('serie_id', ev.serie_id as string)
    .gte('starts_at', ev.starts_at)
  if (error) throw new Error('No se pudo eliminar la serie.')
}

export async function deleteEvent(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('No se pudo eliminar (¿permisos insuficientes?)')
  }
}

export async function fetchAttendees(eventIds: string[]): Promise<EventAttendee[]> {
  if (eventIds.length === 0) return []
  // select * para tolerar bases con o sin la columna invited (migración 15)
  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .in('event_id', eventIds)
  if (error) throw error
  return (data ?? []) as EventAttendee[]
}

// RSVP propio: crea o actualiza la fila del usuario actual
export async function setMyRsvp(
  eventId: string,
  userId: string,
  status: AttendeeStatus
): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .upsert({ event_id: eventId, user_id: userId, status }, { onConflict: 'event_id,user_id' })
  if (error) throw error
}

// Miembros visibles para todo el equipo (política «el equipo ve los perfiles»),
// sin las cuentas de servicio (claude-dev, bot y claude-qa): sus ids los
// da cuentas_servicio_ids() de la migración 71; si la RPC falla, no se
// filtra. El chat las pide también (conServicio) para nombrar al autor de
// los mensajes del bot.
export async function fetchTeamMembers(
  { conServicio = false }: { conServicio?: boolean } = {}
): Promise<TeamMember[]> {
  const [withAvatar, servicio] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, role').order('full_name'),
    conServicio ? null : supabase.rpc('cuentas_servicio_ids'),
  ])
  const ocultas = new Set<string>(!servicio || servicio.error ? [] : ((servicio.data as string[] | null) ?? []))
  const visibles = (m: TeamMember) => !ocultas.has(m.id)
  if (!withAvatar.error) return ((withAvatar.data ?? []) as TeamMember[]).filter(visibles)

  // Base sin la migración 19 (columna avatar_url aún no existe): degradar
  // sin avatar en vez de romper el equipo entero.
  const plain = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')
  if (plain.error) throw plain.error
  return (plain.data ?? []).map((m) => ({ ...(m as TeamMember), avatar_url: null })).filter(visibles)
}

// Invitados que se pueden editar al abrir un evento: sin los ids que el
// selector oculta (cuentas de servicio: están en `autores`, la lista con
// conServicio, y no en `equipo`), para que no se conserven en silencio al
// guardar. Si el equipo no cargó no se quita nada.
export function invitadosEditables(
  ids: string[],
  equipo: Pick<TeamMember, 'id'>[],
  autores: Pick<TeamMember, 'id'>[]
): string[] {
  if (equipo.length === 0) return ids
  const visibles = new Set(equipo.map((m) => m.id))
  const ocultos = new Set(autores.map((a) => a.id).filter((id) => !visibles.has(id)))
  return ids.filter((id) => !ocultos.has(id))
}

// ============================================================
// Calendarios externos suscritos (Google Calendar / Outlook / Apple)
// Dirección inversa del feed: aquí el portal LEE calendarios de fuera.
// Las URLs las descarga la Netlify Function (nunca el navegador: llevan
// un token privado y hay validación anti-SSRF del lado del servidor).
// ============================================================

async function callImport<T>(body: object): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sin sesión')

  const res = await fetch('/api/calendar-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !json) throw new Error(json?.error ?? `Error del servidor (${res.status})`)
  return json
}

// Avisa al equipo de una reunión: push inmediato + correo con la reunión
// adjunta como invitación de calendario (se añade a Google/Outlook/Apple).
// El texto lo compone el servidor desde la base; aquí solo viaja el id.
// cancel + soloA: cancelación solo para esos invitados (los que se quitan).
export async function notifyEvent(
  eventId: string,
  opts: { cancel?: boolean; soloA?: string[]; serie?: boolean } = {}
): Promise<{
  recipients: number
  email: { sent: number; error?: string }
  push: { sent: number }
}> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sin sesión')

  const res = await fetch('/api/notify-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventId,
      ...(opts.cancel ? { cancel: true } : {}),
      ...(opts.cancel && opts.soloA?.length ? { soloA: opts.soloA } : {}),
      ...(opts.serie ? { serie: true } : {}),
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) {
    throw new Error(json?.error ?? `No se pudo avisar al equipo (${res.status})`)
  }
  return json
}

export function fetchExternalEvents(
  fromIso: string,
  toIso: string
): Promise<{ calendars: ExternalCalendarInfo[]; events: ExternalEvent[] }> {
  return callImport({ action: 'events', from: fromIso, to: toIso })
}

// Comprueba una URL antes de guardarla: devuelve cuántos eventos tiene y,
// si el calendario publica su nombre (X-WR-CALNAME), lo sugiere.
export function testSubscription(
  url: string
): Promise<{ ok: boolean; events?: number; name?: string | null; error?: string }> {
  return callImport({ action: 'test', url })
}

export async function fetchSubscriptions(): Promise<CalendarSubscription[]> {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('id, owner_id, name, url, color, scope, active')
    .order('name')
  if (error) throw error
  return (data ?? []) as CalendarSubscription[]
}

export async function createSubscription(input: {
  name: string
  url: string
  color: string
  scope: 'personal' | 'team'
}): Promise<void> {
  const { error } = await supabase.from('calendar_subscriptions').insert(input)
  if (error) throw error
}

// Nombre y color de una suscripción propia (RLS de update, migración 16)
export async function updateSubscription(
  id: string,
  cambios: { name: string; color: string }
): Promise<void> {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .update(cambios)
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar (¿permisos insuficientes?)')
  }
}

export async function deleteSubscription(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('No se pudo eliminar (¿permisos insuficientes?)')
  }
}

// ============================================================
// Conector calendar: crear el evento TAMBIÉN en un calendario de Google
// del equipo (service account; el calendario debe estar compartido con
// ella). El vínculo se guarda en calendar_events.google_* (migración 34)
// para poder actualizar/borrar la copia después.
// ============================================================

export interface GoogleCalendarOption {
  id: string
  name: string
  color: string | null
}

async function callCalendar<T>(action: string, extra: object): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sin sesión')
  const res = await fetch('/api/connector-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ connector: 'calendar', action, ...extra }),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !json) throw new Error(json?.error ?? `Error del conector (${res.status})`)
  return json
}

// Calendarios de Google donde se puede escribir. null = conector no
// disponible (sin configurar, dev sin functions, sin sesión): el
// formulario simplemente no ofrece la opción.
export async function fetchGoogleCalendars(): Promise<GoogleCalendarOption[] | null> {
  try {
    const body = await callCalendar<{ calendars?: GoogleCalendarOption[] }>('list-calendars', {})
    return body.calendars ?? []
  } catch {
    return null
  }
}

// Un calendario recién compartido con la cuenta de servicio no siempre
// entra solo en su lista (rareza conocida de la API de Google): esta
// acción lo añade por id. Requiere manage_connectors; el id es el correo
// de la cuenta de Google o un id xxx@group.calendar.google.com.
export function gcalAddCalendar(calendarId: string): Promise<{ calendar: GoogleCalendarOption }> {
  return callCalendar('add-calendar', { calendarId })
}

// Deja de ofrecer el calendario en el portal (no lo borra en Google).
export function gcalRemoveCalendar(calendarId: string): Promise<{ ok: boolean }> {
  return callCalendar('remove-calendar', { calendarId })
}

// El proxy valida el evento con una lista blanca estricta: solo viajan
// los campos del evento en sí (sin remind_minutes, que es del portal).
function eventoParaGoogle(input: CalendarEventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    meeting_url: input.meeting_url,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    all_day: input.all_day,
  }
}

export function gcalCreate(
  calendarId: string,
  input: CalendarEventInput
): Promise<{ eventId: string; htmlLink: string | null }> {
  return callCalendar('create-event', { calendarId, evento: eventoParaGoogle(input) })
}

export function gcalUpdate(
  calendarId: string,
  googleEventId: string,
  input: CalendarEventInput
): Promise<{ ok: boolean }> {
  return callCalendar('update-event', { calendarId, googleEventId, evento: eventoParaGoogle(input) })
}

export function gcalDelete(calendarId: string, googleEventId: string): Promise<{ ok: boolean }> {
  return callCalendar('delete-event', { calendarId, googleEventId })
}

// ============================================================
// Sala de Google Meet automática (función meet-create): la crea la cuenta
// anfitriona de Workspace y queda abierta a cualquiera con el enlace.
// ============================================================

async function callMeet<T>(accion: 'estado' | 'crear'): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sin sesión')
  const res = await fetch('/api/meet-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accion }),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !json) throw new Error(json?.error ?? `No se pudo crear la sala (${res.status})`)
  return json
}

// false si Meet no está configurado o la función no responde (dev sin
// functions): el formulario abre meet.google.com/new como antes.
export async function meetDisponible(): Promise<boolean> {
  try {
    return (await callMeet<{ disponible: boolean }>('estado')).disponible === true
  } catch {
    return false
  }
}

export async function crearMeet(): Promise<{ url: string; abierta: boolean }> {
  const r = await callMeet<{ url: string; abierta: boolean }>('crear')
  const url = enlaceHttps(r.url)
  if (!url) throw new Error('Google devolvió un enlace de sala inválido')
  return { url, abierta: r.abierta }
}

// Guarda el vínculo en la fila del evento. Best-effort: sin la migración
// 34 las columnas no existen y el update falla — el evento ya quedó en
// Google, solo no habrá sincronización posterior.
export async function linkGoogleEvent(
  eventId: string,
  calendarId: string,
  googleEventId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('calendar_events')
    .update({ google_calendar_id: calendarId, google_event_id: googleEventId })
    .eq('id', eventId)
  return !error
}

// ============================================================
// Feed iCal: URL secreta personal para Google Calendar / Outlook / Apple
// ============================================================

export async function getOrCreateFeedToken(): Promise<string> {
  const { data } = await supabase.from('calendar_feed_tokens').select('token').maybeSingle()
  if (data?.token) return data.token as string
  const { data: created, error } = await supabase
    .from('calendar_feed_tokens')
    .insert({})
    .select('token')
    .single()
  if (error) throw error
  return created.token as string
}

// Enlace iCal nuevo: el anterior deja de servir al instante (por si se
// compartió por error). Borrar y crear: la RLS deja a cada quien la suya.
export async function regenerarFeedToken(): Promise<string> {
  const { data: sesion } = await supabase.auth.getSession()
  const uid = sesion.session?.user.id
  if (!uid) throw new Error('Sin sesión')
  const { error: errBorrar } = await supabase.from('calendar_feed_tokens').delete().eq('user_id', uid)
  if (errBorrar) throw errBorrar
  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .insert({})
    .select('token')
    .single()
  if (error) throw error
  return data.token as string
}

export function feedUrl(token: string): string {
  return `${window.location.origin}/api/calendar-ics?t=${token}`
}

// ============================================================
// Exportar un evento individual
// ============================================================

// Fecha civil de Bogotá (AAAA-MM-DD), igual que netlify/lib/ics.mts y
// gcalendar.mts, para que el .ics, el feed, la invitación y la copia en
// Google digan el mismo día
function civilBogota(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// Todo el día: la fecha civil de Bogotá, igual que dateOnly de
// netlify/lib/ics.mts
function gcalDate(iso: string, allDay: boolean): string {
  const d = new Date(iso)
  if (allDay) return civilBogota(iso).replace(/-/g, '')
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// En ICS y en Google Calendar el fin de un evento de todo el día es
// EXCLUSIVO: el día siguiente al último (nextDay de netlify/lib/ics.mts)
function finTodoElDia(iso: string): string {
  const [y, m, d] = civilBogota(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
}

// Enlace «Añadir a Google Calendar» (crea una copia del evento en la
// cuenta personal; para sincronización continua está el feed iCal)
export function googleCalendarUrl(ev: CalendarEvent): string {
  const fin = ev.all_day ? finTodoElDia(ev.ends_at) : gcalDate(ev.ends_at, false)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${gcalDate(ev.starts_at, ev.all_day)}/${fin}`,
  })
  const enlace = enlaceHttps(ev.meeting_url)
  const details = [ev.description, enlace ? `Unirse: ${enlace}` : null]
    .filter(Boolean)
    .join('\n\n')
  if (details) params.set('details', details)
  if (ev.location) params.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    // También el CR suelto: un lector que corte líneas por CR vería una
    // propiedad inyectada (p. ej. «URL:») dentro del título o la descripción
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Texto del .ics de un evento. El enlace de reunión solo va si cumple
// enlaceHttps (el calendario de quien lo importa lo vuelve clicable), igual
// que en el feed de calendar-ics y en la invitación de notify-event.
export function contenidoIcs(ev: CalendarEvent): string {
  const dt = (iso: string) => gcalDate(iso, false)
  const enlace = enlaceHttps(ev.meeting_url)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TailorSuite//ES',
    'BEGIN:VEVENT',
    `UID:${ev.id}@portal.invalid`,
    `DTSTAMP:${dt(ev.updated_at)}`,
    ev.all_day
      ? `DTSTART;VALUE=DATE:${gcalDate(ev.starts_at, true)}`
      : `DTSTART:${dt(ev.starts_at)}`,
    ev.all_day ? `DTEND;VALUE=DATE:${finTodoElDia(ev.ends_at)}` : `DTEND:${dt(ev.ends_at)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : null,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
    enlace ? `URL:${icsEscape(enlace)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean) as string[]
  return lines.join('\r\n')
}

// Descarga un .ics del evento (Outlook/Apple/importar en cualquier calendario)
export function downloadEventIcs(ev: CalendarEvent): void {
  const blob = new Blob([contenidoIcs(ev)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'evento'}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

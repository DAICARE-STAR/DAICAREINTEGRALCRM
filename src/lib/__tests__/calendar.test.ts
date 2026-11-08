import { describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, EventAttendee } from '../../types'
import {
  conflictos,
  contenidoIcs,
  createSerie,
  diaBogota,
  mueveFechas,
  enlaceHttps,
  esBloqueMantenimiento,
  esMia,
  eventosVisibles,
  fetchEventsBetween,
  fetchTeamMembers,
  googleCalendarUrl,
  invitadosEditables,
  MAX_OCURRENCIAS,
  moverInicios,
  ocurrencias,
  reunionDeUrl,
  updateEvent,
} from '../calendar'

// Cliente de Supabase falso: solo fetchTeamMembers lo usa
const sb = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: sb }))

function evento(cambios: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev-1',
    title: 'Reunión de obra',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: '2026-10-07T14:00:00.000Z',
    ends_at: '2026-10-07T15:00:00.000Z',
    all_day: false,
    remind_minutes: 30,
    created_by: 'u-creador',
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
    ...cambios,
  }
}

const ENLACES_MALOS = [
  'javascript:alert(1)',
  'data:text/html,<b>x</b>',
  'http://meet.google.com/abc',
  'https://x.test/"onmouseover="alert(1)',
  "https://x.test/'a",
  'https://x.test/<script>',
  'https://x.test/a b',
  ' https://x.test',
  'https://',
]

describe('enlaceHttps', () => {
  it('acepta un enlace https limpio', () => {
    expect(enlaceHttps('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij'
    )
    expect(enlaceHttps('HTTPS://zoom.us/j/123?pwd=x')).toBe('HTTPS://zoom.us/j/123?pwd=x')
  })

  it('rechaza otros esquemas y los caracteres que rompen el atributo', () => {
    for (const url of ENLACES_MALOS) expect(enlaceHttps(url)).toBeNull()
  })

  it('null, undefined o vacío no son enlace', () => {
    expect(enlaceHttps(null)).toBeNull()
    expect(enlaceHttps(undefined)).toBeNull()
    expect(enlaceHttps('')).toBeNull()
  })

  // El tsconfig de src no admite rutas .mts; Vitest sí, en tiempo de ejecución
  it('es la misma regla que netlify/lib/email.mts', async () => {
    const ruta = new URL('../../../netlify/lib/email.mts', import.meta.url).href
    const servidor = (await import(/* @vite-ignore */ ruta)) as {
      enlaceHttps: (url: string | null | undefined) => string | null
      esBloqueMantenimiento: (titulo: string | null | undefined) => boolean
    }
    for (const url of [...ENLACES_MALOS, 'https://meet.google.com/abc', 'HTTPS://a.b/c?d=1,2;e', null, '']) {
      expect(enlaceHttps(url)).toBe(servidor.enlaceHttps(url))
    }
    for (const titulo of ['MANT · M2 · Ventana', '  MANT · SEM', '  mant ·SEM', 'Mant · luminarias hotel', 'Mantenimiento', 'Reunión MANT · x', null]) {
      expect(esBloqueMantenimiento(titulo)).toBe(servidor.esBloqueMantenimiento(titulo))
    }
  })
})

describe('contenidoIcs', () => {
  it('escribe el enlace https como URL', () => {
    const ics = contenidoIcs(evento({ meeting_url: 'https://meet.google.com/abc-defg-hij' }))
    expect(ics).toContain('\r\nURL:https://meet.google.com/abc-defg-hij\r\n')
  })

  it('omite el enlace que no cumple la regla (filas anteriores al CHECK de la 63)', () => {
    for (const url of ENLACES_MALOS) {
      const ics = contenidoIcs(evento({ meeting_url: url }))
      expect(ics).not.toMatch(/^URL:/m)
      expect(ics).not.toContain('javascript:')
    }
  })

  it('sin enlace no hay línea URL y el resto del evento sigue', () => {
    const ics = contenidoIcs(evento({ description: 'Orden del día; puntos, varios' }))
    expect(ics).not.toMatch(/^URL:/m)
    expect(ics).toContain('SUMMARY:Reunión de obra')
    expect(ics).toContain('DESCRIPTION:Orden del día\\; puntos\\, varios')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR')).toBe(true)
  })

  it('un CR suelto en el texto no abre una propiedad nueva', () => {
    const ics = contenidoIcs(
      evento({
        title: 'x\rURL:javascript:alert(1)',
        description: 'a\r\nURL:https://otro.test\rb\nc',
        location: 'Sala\rURL:data:text/html,x',
        meeting_url: 'https://meet.google.com/abc',
      })
    )
    // En modo m, ^ también empieza tras un CR: solo queda la línea legítima
    expect(ics.match(/^URL:.*$/gm)).toEqual(['URL:https://meet.google.com/abc'])
    expect(ics).not.toMatch(/\r(?!\n)/)
    expect(ics).toContain('SUMMARY:x\\nURL:javascript:alert(1)\r\n')
    expect(ics).toContain('DESCRIPTION:a\\nURL:https://otro.test\\nb\\nc\r\n')
  })

  // RFC 5545: el DTEND de tipo DATE es exclusivo. Con el mismo día de
  // inicio y fin, el evento dura cero días y varios clientes lo esconden
  it('un evento de todo el día termina el día siguiente al último', () => {
    expect(contenidoIcs(evento({ all_day: true }))).toContain(
      '\r\nDTSTART;VALUE=DATE:20261007\r\nDTEND;VALUE=DATE:20261008\r\n'
    )
    expect(
      contenidoIcs(evento({ all_day: true, ends_at: '2026-10-09T15:00:00.000Z' }))
    ).toContain('\r\nDTEND;VALUE=DATE:20261010\r\n')
    expect(
      contenidoIcs(
        evento({
          all_day: true,
          starts_at: '2026-12-31T14:00:00.000Z',
          ends_at: '2026-12-31T15:00:00.000Z',
        })
      )
    ).toContain('\r\nDTEND;VALUE=DATE:20270101\r\n')
  })

  // El tsconfig de src no admite rutas .mts; Vitest sí, en tiempo de ejecución
  it('las fechas de todo el día son las del feed y la invitación (netlify/lib/ics.mts)', async () => {
    const ruta = new URL('../../../netlify/lib/ics.mts', import.meta.url).href
    const servidor = (await import(/* @vite-ignore */ ruta)) as {
      dateOnly: (iso: string) => string
      nextDay: (iso: string) => string
    }
    const casos: [string, string][] = [
      ['2026-10-07T14:00:00.000Z', '2026-10-07T15:00:00.000Z'],
      ['2026-10-07T05:00:00.000Z', '2026-10-10T04:59:00.000Z'],
      ['2026-02-28T14:00:00.000Z', '2026-02-28T15:00:00.000Z'],
      // Después de las 19:00 de Bogotá ya es otro día en UTC
      ['2026-10-08T01:00:00.000Z', '2026-10-08T02:00:00.000Z'],
      ['2026-12-31T23:30:00.000Z', '2027-01-01T03:00:00.000Z'],
    ]
    for (const [inicio, fin] of casos) {
      const ics = contenidoIcs(evento({ all_day: true, starts_at: inicio, ends_at: fin }))
      expect(ics).toContain(`\r\nDTSTART;VALUE=DATE:${servidor.dateOnly(inicio)}\r\n`)
      expect(ics).toContain(`\r\nDTEND;VALUE=DATE:${servidor.nextDay(fin)}\r\n`)
    }
  })
})

describe('googleCalendarUrl', () => {
  const detalles = (ev: CalendarEvent) =>
    new URL(googleCalendarUrl(ev)).searchParams.get('details')
  const fechas = (ev: CalendarEvent) =>
    new URL(googleCalendarUrl(ev)).searchParams.get('dates')

  it('el fin de un evento de todo el día es exclusivo, como en el .ics', () => {
    expect(fechas(evento({ all_day: true }))).toBe('20261007/20261008')
    expect(fechas(evento({ all_day: true, ends_at: '2026-10-09T15:00:00.000Z' }))).toBe(
      '20261007/20261010'
    )
    expect(fechas(evento())).toBe('20261007T140000Z/20261007T150000Z')
  })

  it('el día de un evento de todo el día es la fecha civil de Bogotá', () => {
    // 20:00 del 7 de octubre en Bogotá (01:00 UTC del 8)
    const tarde = { all_day: true, starts_at: '2026-10-08T01:00:00.000Z', ends_at: '2026-10-08T02:00:00.000Z' }
    expect(fechas(evento(tarde))).toBe('20261007/20261008')
    expect(contenidoIcs(evento(tarde))).toContain('\r\nDTSTART;VALUE=DATE:20261007\r\n')
  })

  it('añade «Unirse» solo con un enlace https válido', () => {
    expect(detalles(evento({ meeting_url: 'https://meet.google.com/abc' }))).toBe(
      'Unirse: https://meet.google.com/abc'
    )
    expect(detalles(evento({ meeting_url: 'javascript:alert(1)' }))).toBeNull()
    expect(
      detalles(evento({ description: 'Agenda', meeting_url: 'http://meet.google.com/abc' }))
    ).toBe('Agenda')
  })
})

describe('eventosVisibles', () => {
  const normal = evento({ id: 'normal' })
  const mant = evento({ id: 'mant', title: 'MANT · M2 · Ventana de servidores', created_by: 'u-servicio' })
  const invitacion = (user_id: string, invited?: boolean): EventAttendee => ({
    event_id: 'mant',
    user_id,
    status: 'pending',
    ...(invited === undefined ? {} : { invited }),
  })

  it('las reuniones normales las ve todo el equipo', () => {
    expect(eventosVisibles([normal], [], 'u-cualquiera')).toEqual([normal])
  })

  it('un bloque «MANT ·» solo lo ven sus invitados', () => {
    const asistentes = [invitacion('u-admin')]
    expect(eventosVisibles([normal, mant], asistentes, 'u-admin')).toEqual([normal, mant])
    expect(eventosVisibles([normal, mant], asistentes, 'u-otro')).toEqual([normal])
  })

  it('un RSVP espontáneo no cuenta como invitación; sin la columna invited sí', () => {
    expect(eventosVisibles([mant], [invitacion('u-otro', false)], 'u-otro')).toEqual([])
    expect(eventosVisibles([mant], [invitacion('u-otro')], 'u-otro')).toEqual([mant])
  })

  it('quien lo creó lo sigue viendo; sin sesión no se ve', () => {
    expect(eventosVisibles([mant], [], 'u-servicio')).toEqual([mant])
    expect(eventosVisibles([mant], [], undefined)).toEqual([])
  })
})

describe('fetchTeamMembers', () => {
  const perfiles = [
    { id: 'u-ana', full_name: 'Ana', avatar_url: null, role: 'member' },
    { id: 'u-bot', full_name: 'Bot de prueba', avatar_url: null, role: 'member' },
    { id: 'u-dev', full_name: 'Claude Dev Bot', avatar_url: null, role: 'member' },
  ]

  function equipo(ids: { data: string[] | null; error: { code: string } | null }) {
    sb.from.mockReset().mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: perfiles, error: null }) }),
    })
    sb.rpc.mockReset().mockResolvedValue(ids)
  }

  it('quita las cuentas de servicio que da cuentas_servicio_ids', async () => {
    equipo({ data: ['u-bot', 'u-dev'], error: null })
    expect((await fetchTeamMembers()).map((m) => m.id)).toEqual(['u-ana'])
    expect(sb.rpc).toHaveBeenCalledWith('cuentas_servicio_ids')
  })

  it('sin la función (migración 71 sin aplicar) no filtra', async () => {
    equipo({ data: null, error: { code: 'PGRST202' } })
    expect((await fetchTeamMembers()).map((m) => m.id)).toEqual(['u-ana', 'u-bot', 'u-dev'])
  })

  it('el chat las conserva para nombrar al autor, sin pedir la RPC', async () => {
    equipo({ data: ['u-bot', 'u-dev'], error: null })
    expect(await fetchTeamMembers({ conServicio: true })).toHaveLength(3)
    expect(sb.rpc).not.toHaveBeenCalled()
  })
})

describe('invitadosEditables', () => {
  const equipo = [{ id: 'u-ana' }, { id: 'u-luis' }]
  const autores = [...equipo, { id: 'u-dev' }]

  it('quita los ids ocultos del selector (cuentas de servicio)', () => {
    expect(invitadosEditables(['u-ana', 'u-dev', 'u-luis'], equipo, autores)).toEqual(['u-ana', 'u-luis'])
  })

  it('un id que no está en ninguna lista se conserva', () => {
    expect(invitadosEditables(['u-ana', 'u-nuevo'], equipo, autores)).toEqual(['u-ana', 'u-nuevo'])
  })

  it('si el equipo no cargó no quita nada', () => {
    expect(invitadosEditables(['u-ana', 'u-dev'], [], autores)).toEqual(['u-ana', 'u-dev'])
  })
})

// Cadena de PostgREST falsa: registra cada llamada y resuelve con `resultado`
function cadena(resultado: unknown, llamadas: [string, unknown[]][]) {
  const proxy: Record<string, unknown> = {}
  for (const m of ['select', 'lte', 'gte', 'eq', 'in', 'order', 'update', 'delete', 'insert', 'maybeSingle']) {
    proxy[m] = (...args: unknown[]) => {
      llamadas.push([m, args])
      return proxy
    }
  }
  proxy.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok)
  return proxy
}

describe('fetchEventsBetween', () => {
  it('pide las reuniones que se solapan con el rango, no solo las que empiezan en él', async () => {
    const llamadas: [string, unknown[]][] = []
    sb.from.mockReset().mockReturnValue(cadena({ data: [], error: null }, llamadas))
    await fetchEventsBetween('2026-11-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z')
    expect(llamadas).toContainEqual(['lte', ['starts_at', '2026-11-30T23:59:59.000Z']])
    expect(llamadas).toContainEqual(['gte', ['ends_at', '2026-11-01T00:00:00.000Z']])
    expect(llamadas.some(([m, a]) => m === 'gte' && a[0] === 'starts_at')).toBe(false)
  })
})

describe('reunionDeUrl', () => {
  it('lee un uuid de ?reunion=', () => {
    const id = '3f2b8c1e-9a4d-4e2f-8b1a-0c9d7e6f5a4b'
    expect(reunionDeUrl(`?reunion=${id}`)).toBe(id)
    expect(reunionDeUrl(`?vista=mes&reunion=${id}`)).toBe(id)
  })

  it('ignora lo que no es un uuid', () => {
    expect(reunionDeUrl('')).toBeNull()
    expect(reunionDeUrl('?reunion=')).toBeNull()
    expect(reunionDeUrl('?reunion=1;drop')).toBeNull()
    expect(reunionDeUrl('?reunion=javascript:alert(1)')).toBeNull()
  })
})

describe('updateEvent', () => {
  function montar(actuales: { user_id: string; invited?: boolean }[], errorBorrado: unknown = null) {
    const orden: string[] = []
    sb.from.mockReset().mockImplementation((tabla: string) => {
      const llamadas: [string, unknown[]][] = []
      const res =
        tabla === 'calendar_events'
          ? { data: [{ id: 'ev-1' }], error: null }
          : { data: actuales.map((a) => ({ event_id: 'ev-1', status: 'pending', ...a })), error: null }
      const c = cadena(res, llamadas)
      const borrar = c.delete as (...a: unknown[]) => unknown
      c.delete = (...a: unknown[]) => {
        orden.push('borrar')
        borrar(...a)
        const fin = cadena({ error: errorBorrado }, llamadas)
        return fin
      }
      return c
    })
    return orden
  }

  const input = {
    title: 'Obra',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: '2026-11-03T14:00:00.000Z',
    ends_at: '2026-11-03T15:00:00.000Z',
    all_day: false,
    remind_minutes: 30,
  }

  it('avisa a los que salen ANTES de borrarlos y no toca los RSVP espontáneos', async () => {
    const orden = montar([
      { user_id: 'u-ana', invited: true },
      { user_id: 'u-luis', invited: true },
      { user_id: 'u-curioso', invited: false },
    ])
    const alQuitar = vi.fn(async (ids: string[]) => {
      orden.push(`avisar:${ids.join(',')}`)
    })
    await updateEvent('ev-1', input, ['u-ana'], alQuitar)
    expect(orden).toEqual(['avisar:u-luis', 'borrar'])
  })

  it('si el aviso falla, igual quita al invitado', async () => {
    const orden = montar([{ user_id: 'u-luis', invited: true }])
    await updateEvent('ev-1', input, [], async () => {
      throw new Error('SMTP caído')
    })
    expect(orden).toEqual(['borrar'])
  })

  it('un fallo al quitar invitados ya no queda en silencio', async () => {
    montar([{ user_id: 'u-luis', invited: true }], { code: '42501' })
    await expect(updateEvent('ev-1', input, [])).rejects.toThrow('no se pudo quitar a los invitados')
  })

  it('sin cambios en la lista no avisa ni borra', async () => {
    const orden = montar([{ user_id: 'u-ana', invited: true }])
    const alQuitar = vi.fn()
    await updateEvent('ev-1', input, ['u-ana'], alQuitar)
    expect(alQuitar).not.toHaveBeenCalled()
    expect(orden).toEqual([])
  })
})

describe('invitar a quien ya respondió', () => {
  // event_attendees en memoria con su clave primaria (event_id, user_id) y el
  // tope de 1000 filas por lectura de PostgREST. La RLS de la migración 13
  // solo deja a cada quien actualizar su fila: el creador no puede marcar
  // invited en la de otro, así que update y upsert con DO UPDATE fallan.
  // `fallarInvitacion`: la inserción de invitaciones (invited=true) falla.
  function base(
    inicial: EventAttendee[],
    fechas: { id: string; serie_id: string; starts_at: string }[] = [],
    { fallarInvitacion = false } = {}
  ) {
    const tabla = inicial.map((a) => ({ ...a }))
    sb.from.mockReset().mockImplementation((nombre: string) => {
      const filtros: ((f: Record<string, unknown>) => boolean)[] = []
      let op = 'select'
      let carga: Record<string, unknown>[] = []
      let sinDuplicar = false
      const q: Record<string, unknown> = {}
      const filtrar = (fn: (f: Record<string, unknown>) => boolean) => {
        filtros.push(fn)
        return q
      }
      const coincide = (f: Record<string, unknown>) => filtros.every((fn) => fn(f))
      function ejecutar() {
        if (nombre === 'calendar_events') {
          return op === 'update' ? { data: [{ id: 'ev-1' }], error: null } : { data: fechas.filter(coincide), error: null }
        }
        const filas = tabla as unknown as Record<string, unknown>[]
        if (op === 'select') return { data: filas.filter(coincide).slice(0, 1000), error: null }
        if (op === 'delete') {
          for (let i = tabla.length - 1; i >= 0; i--) if (coincide(filas[i])) tabla.splice(i, 1)
          return { error: null }
        }
        if (op === 'insert' || op === 'upsert') {
          if (fallarInvitacion && carga.some((n) => n.invited === true)) {
            return { error: { code: '57014', message: 'canceling statement due to statement timeout' } }
          }
          const existe = (n: Record<string, unknown>) =>
            tabla.some((t) => t.event_id === n.event_id && t.user_id === n.user_id)
          if (carga.some(existe)) {
            if (op === 'insert') {
              return { error: { code: '23505', message: 'duplicate key value violates unique constraint "event_attendees_pkey"' } }
            }
            if (!sinDuplicar) return { error: { code: '42501', message: 'new row violates row-level security policy' } }
          }
          tabla.push(...(carga.filter((n) => !existe(n)) as unknown as EventAttendee[]))
          return { error: null }
        }
        return { error: { code: '42501', message: 'new row violates row-level security policy' } }
      }
      Object.assign(q, {
        select: () => q,
        order: () => q,
        eq: (c: string, v: unknown) => filtrar((f) => f[c] === v),
        in: (c: string, vs: unknown[]) => filtrar((f) => vs.includes(f[c])),
        gte: (c: string, v: string) => filtrar((f) => String(f[c]) >= v),
        delete: () => ((op = 'delete'), q),
        insert: (p: Record<string, unknown>[]) => ((op = 'insert'), (carga = p), q),
        update: () => ((op = 'update'), q),
        upsert: (p: Record<string, unknown>[], o?: { ignoreDuplicates?: boolean }) => (
          (op = 'upsert'), (carga = p), (sinDuplicar = o?.ignoreDuplicates === true), q
        ),
        then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
      })
      return q
    })
    return tabla
  }

  const input = {
    title: 'Obra',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: '2026-11-03T14:00:00.000Z',
    ends_at: '2026-11-03T15:00:00.000Z',
    all_day: false,
    remind_minutes: 30,
  }

  it('reunión suelta: el guardado no choca y la persona queda invitada con su respuesta', async () => {
    const tabla = base([
      { event_id: 'ev-1', user_id: 'u-ana', status: 'pending', invited: true },
      { event_id: 'ev-1', user_id: 'u-curioso', status: 'accepted', invited: false },
    ])
    await updateEvent('ev-1', input, ['u-ana', 'u-curioso'])
    expect(tabla.filter((a) => a.user_id === 'u-curioso')).toEqual([
      { event_id: 'ev-1', user_id: 'u-curioso', status: 'accepted', invited: true },
    ])
    expect(tabla).toContainEqual({ event_id: 'ev-1', user_id: 'u-ana', status: 'pending', invited: true })
  })

  it('serie: queda invitada en todas las fechas y conserva su respuesta donde la había', async () => {
    const fechas = [
      { id: 's1', serie_id: 'serie-1', starts_at: '2026-11-03T14:00:00.000Z' },
      { id: 's2', serie_id: 'serie-1', starts_at: '2026-11-10T14:00:00.000Z' },
    ]
    const tabla = base(
      [
        { event_id: 's1', user_id: 'u-ana', status: 'accepted', invited: true },
        { event_id: 's2', user_id: 'u-curioso', status: 'declined', invited: false },
      ],
      fechas
    )
    // Reintento: las fechas ya existen, solo faltan los invitados
    await createSerie(input, [], 'semanal', ['u-ana', 'u-curioso'], 'serie-1')
    const de = (event_id: string, user_id: string) => tabla.filter((a) => a.event_id === event_id && a.user_id === user_id)
    expect(de('s1', 'u-curioso')).toEqual([{ event_id: 's1', user_id: 'u-curioso', status: 'pending', invited: true }])
    expect(de('s2', 'u-curioso')).toEqual([{ event_id: 's2', user_id: 'u-curioso', status: 'declined', invited: true }])
    // Quien ya estaba invitado no se toca
    expect(de('s1', 'u-ana')).toEqual([{ event_id: 's1', user_id: 'u-ana', status: 'accepted', invited: true }])
    expect(de('s2', 'u-ana')).toEqual([{ event_id: 's2', user_id: 'u-ana', status: 'pending', invited: true }])
  })

  it('serie de un año con 19 invitados: añadir uno más no choca aunque la lectura se corte en 1000', async () => {
    const fechas = Array.from({ length: 53 }, (_, i) => ({
      id: `s${i}`,
      serie_id: 'serie-larga',
      starts_at: new Date(Date.UTC(2026, 10, 3 + 7 * i, 14)).toISOString(),
    }))
    const equipo = Array.from({ length: 19 }, (_, i) => `u-${i}`)
    const tabla = base(
      fechas.flatMap((f) => equipo.map((user_id) => ({ event_id: f.id, user_id, status: 'accepted' as const, invited: true }))),
      fechas
    )
    expect(tabla).toHaveLength(53 * 19)
    await createSerie(input, [], 'semanal', [...equipo, 'u-nuevo'], 'serie-larga')
    expect(tabla).toHaveLength(53 * 20)
    expect(tabla.filter((a) => a.user_id === 'u-nuevo').every((a) => a.invited && a.status === 'pending')).toBe(true)
    // Las 1007 invitaciones que ya estaban siguen igual
    expect(tabla.filter((a) => a.user_id !== 'u-nuevo').every((a) => a.status === 'accepted')).toBe(true)
  })

  it('si la invitación no entra, la respuesta borrada vuelve y no se pierde', async () => {
    const tabla = base(
      [
        { event_id: 'ev-1', user_id: 'u-ana', status: 'pending', invited: true },
        { event_id: 'ev-1', user_id: 'u-curioso', status: 'declined', invited: false },
      ],
      [],
      { fallarInvitacion: true }
    )
    await expect(updateEvent('ev-1', input, ['u-ana', 'u-curioso'])).rejects.toThrow(
      'La reunión se guardó, pero no se pudo invitar a todos.'
    )
    expect(tabla.filter((a) => a.user_id === 'u-curioso')).toEqual([
      { event_id: 'ev-1', user_id: 'u-curioso', status: 'declined', invited: false },
    ])
  })
})

describe('conflictos', () => {
  const a = (event_id: string, user_id: string, extra: Partial<EventAttendee> = {}): EventAttendee => ({
    event_id,
    user_id,
    status: 'pending',
    invited: true,
    ...extra,
  })
  // 14:00-15:00 UTC
  const obra = evento({ id: 'obra', created_by: 'u-luis' })
  const abierta = evento({ id: 'abierta', created_by: 'u-otro' })
  const tarde = evento({
    id: 'tarde',
    created_by: 'u-otro',
    starts_at: '2026-10-07T15:00:00.000Z',
    ends_at: '2026-10-07T16:00:00.000Z',
  })
  const att = [a('obra', 'u-ana'), a('obra', 'u-pedro', { status: 'declined' }), a('tarde', 'u-ana')]
  const choques = (ids: string[], desde: string, hasta: string, excluir?: string) =>
    conflictos([obra, abierta, tarde], att, ids, desde, hasta, excluir).map((c) => `${c.userId}@${c.ev.id}`)

  it('invitados y creador que se solapan; las abiertas no cuentan', () => {
    expect(choques(['u-ana', 'u-luis'], '2026-10-07T14:30:00.000Z', '2026-10-07T15:30:00.000Z')).toEqual([
      'u-ana@obra',
      'u-luis@obra',
      'u-ana@tarde',
    ])
  })

  it('quien dijo «No puedo» no choca', () => {
    expect(choques(['u-pedro'], '2026-10-07T14:00:00.000Z', '2026-10-07T15:00:00.000Z')).toEqual([])
  })

  it('terminar justo cuando empieza la otra no es choque', () => {
    expect(choques(['u-ana'], '2026-10-07T13:00:00.000Z', '2026-10-07T14:00:00.000Z')).toEqual([])
  })

  it('la reunión en edición no choca consigo misma', () => {
    expect(choques(['u-luis'], '2026-10-07T14:00:00.000Z', '2026-10-07T15:00:00.000Z', 'obra')).toEqual([])
  })
})

describe('esMia', () => {
  const att: EventAttendee[] = [
    { event_id: 'privada', user_id: 'u-ana', status: 'pending', invited: true },
    { event_id: 'abierta', user_id: 'u-luis', status: 'accepted', invited: false },
  ]
  it('creada por mí, invitada o abierta; no las privadas de otros', () => {
    expect(esMia(evento({ id: 'privada', created_by: 'u-otro' }), att, 'u-ana')).toBe(true)
    expect(esMia(evento({ id: 'privada', created_by: 'u-otro' }), att, 'u-luis')).toBe(false)
    expect(esMia(evento({ id: 'privada', created_by: 'u-luis' }), att, 'u-luis')).toBe(true)
    // Un RSVP espontáneo no la vuelve privada
    expect(esMia(evento({ id: 'abierta', created_by: 'u-otro' }), att, 'u-pedro')).toBe(true)
    expect(esMia(evento({ id: 'abierta' }), att, undefined)).toBe(false)
  })
})

describe('ocurrencias', () => {
  // Hora local: lunes 2 de noviembre de 2026, 10:00 a 11:00
  const ini = new Date(2026, 10, 2, 10, 0).toISOString()
  const fin = new Date(2026, 10, 2, 11, 0).toISOString()
  const local = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  it('semanal hasta la fecha, inclusiva, con la misma hora y duración', () => {
    const r = ocurrencias(ini, fin, 'semanal', '2026-11-23')
    expect(r.map((o) => local(o.starts_at))).toEqual(['2026-11-2 10:00', '2026-11-9 10:00', '2026-11-16 10:00', '2026-11-23 10:00'])
    expect(r.every((o) => new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime() === 3600000)).toBe(true)
  })

  it('quincenal y mensual', () => {
    expect(ocurrencias(ini, fin, 'quincenal', '2026-12-01').map((o) => local(o.starts_at))).toEqual([
      '2026-11-2 10:00',
      '2026-11-16 10:00',
      '2026-11-30 10:00',
    ])
    expect(ocurrencias(ini, fin, 'mensual', '2027-02-02').map((o) => local(o.starts_at))).toEqual([
      '2026-11-2 10:00',
      '2026-12-2 10:00',
      '2027-1-2 10:00',
      '2027-2-2 10:00',
    ])
  })

  it('topes: 60 fechas y un año', () => {
    expect(ocurrencias(ini, fin, 'semanal', '2030-01-01')).toHaveLength(53)
    expect(ocurrencias(ini, fin, 'mensual', '2030-01-01')).toHaveLength(13)
    const hastaAntes = ocurrencias(ini, fin, 'semanal', '2026-11-01')
    expect(hastaAntes).toHaveLength(0)
    expect(MAX_OCURRENCIAS).toBe(60)
  })
})

describe('ocurrencias en hora de Colombia', () => {
  it('mensual el 28 a las 19:00 de Bogotá (el 29 en UTC) cae el 28 todos los meses, febrero incluido', () => {
    const r = ocurrencias('2027-01-29T00:00:00.000Z', '2027-01-29T01:00:00.000Z', 'mensual', '2027-04-30')
    expect(r.map((o) => o.starts_at)).toEqual([
      '2027-01-29T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
      '2027-03-29T00:00:00.000Z',
      '2027-04-29T00:00:00.000Z',
    ])
    expect(r.map((o) => diaBogota(o.starts_at))).toEqual([28, 28, 28, 28])
  })

  it('semanal: misma hora UTC (Colombia no cambia de horario), sin importar el navegador', () => {
    const r = ocurrencias('2027-03-01T15:00:00.000Z', '2027-03-01T16:00:00.000Z', 'semanal', '2027-03-29')
    expect(r.map((o) => o.starts_at.slice(11, 16))).toEqual(['15:00', '15:00', '15:00', '15:00', '15:00'])
  })

  it('«Hasta» es el día completo de Bogotá', () => {
    // Domingos 28 feb, 7 y 14 de marzo a las 20:00 de Bogotá: el último ya
    // es el 15 en UTC y sigue dentro de «hasta el 14»
    const r = ocurrencias('2027-03-01T01:00:00.000Z', '2027-03-01T02:00:00.000Z', 'semanal', '2027-03-14')
    expect(r.map((o) => o.starts_at)).toEqual([
      '2027-03-01T01:00:00.000Z',
      '2027-03-08T01:00:00.000Z',
      '2027-03-15T01:00:00.000Z',
    ])
  })
})

describe('mueveFechas', () => {
  const ev = evento({})
  const input = {
    title: 'Otro título',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at,
    all_day: false,
    remind_minutes: 30,
  }
  it('cambiar solo datos no mueve; hora, duración o «todo el día», sí', () => {
    expect(mueveFechas(ev, input)).toBe(false)
    expect(mueveFechas(ev, { ...input, starts_at: '2026-10-07T15:00:00.000Z', ends_at: '2026-10-07T16:00:00.000Z' })).toBe(true)
    expect(mueveFechas(ev, { ...input, ends_at: '2026-10-07T15:30:00.000Z' })).toBe(true)
    expect(mueveFechas(ev, { ...input, all_day: true })).toBe(true)
  })
})

describe('moverInicios', () => {
  // Mensual el 26 a las 10:00 de Bogotá (15:00 UTC)
  const ev = evento({
    starts_at: '2027-01-26T15:00:00.000Z',
    ends_at: '2027-01-26T16:00:00.000Z',
    serie_id: 's',
    repeticion: 'mensual',
    serie_inicio: '2027-01-26T15:00:00.000Z',
  })
  const input = {
    title: 'Comité',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: '2027-02-02T16:00:00.000Z', // al 2 del mes siguiente, a las 11:00
    ends_at: '2027-02-02T17:00:00.000Z',
    all_day: false,
    remind_minutes: null,
  }

  it('mensual: el día nuevo en el mes que le toca, por hora de pared (no se corre con febrero)', () => {
    const mover = moverInicios(ev, input)
    const r = ['2027-01-26T15:00:00.000Z', '2027-02-26T15:00:00.000Z', '2027-03-26T15:00:00.000Z'].map((o) => mover(o, o))
    expect(r.map((x) => x.original)).toEqual([
      '2027-02-02T16:00:00.000Z',
      '2027-03-02T16:00:00.000Z',
      '2027-04-02T16:00:00.000Z',
    ])
    expect(r.every((x) => x.inicio === x.original)).toBe(true)
  })

  it('una fecha movida antes con «Solo esta» conserva su diferencia con el original', () => {
    const mover = moverInicios(ev, input)
    // Esa fecha se había pasado un día más tarde
    const x = mover('2027-02-27T15:00:00.000Z', '2027-02-26T15:00:00.000Z')
    expect(x.original).toBe('2027-03-02T16:00:00.000Z')
    expect(x.inicio).toBe('2027-03-03T16:00:00.000Z')
  })

  it('editando una fecha movida antes «Solo esta» y cambiando solo la hora, la serie no se corre', () => {
    // Mensual el 10 a las 9:00; la de febrero se había pasado al 12
    const movida = evento({
      starts_at: '2027-02-12T14:00:00.000Z',
      ends_at: '2027-02-12T15:00:00.000Z',
      serie_id: 's',
      repeticion: 'mensual',
      serie_inicio: '2027-02-10T14:00:00.000Z',
    })
    const mover = moverInicios(movida, {
      ...input,
      starts_at: '2027-02-12T20:00:00.000Z', // a las 15:00
      ends_at: '2027-02-12T21:00:00.000Z',
    })
    // La editada sigue el 12 a las 15:00; marzo y abril, el 10 a las 15:00
    expect(mover('2027-02-12T14:00:00.000Z', '2027-02-10T14:00:00.000Z')).toEqual({
      inicio: '2027-02-12T20:00:00.000Z',
      original: '2027-02-10T20:00:00.000Z',
    })
    expect(mover('2027-03-10T14:00:00.000Z', '2027-03-10T14:00:00.000Z').inicio).toBe('2027-03-10T20:00:00.000Z')
    expect(mover('2027-04-10T14:00:00.000Z', '2027-04-10T14:00:00.000Z').inicio).toBe('2027-04-10T20:00:00.000Z')
  })

  it('la del 28 de enero movida al 2 de febrero no salta de mes al cambiar solo la hora', () => {
    const movida = evento({
      starts_at: '2027-02-02T14:00:00.000Z',
      ends_at: '2027-02-02T15:00:00.000Z',
      serie_id: 's',
      repeticion: 'mensual',
      serie_inicio: '2027-01-28T14:00:00.000Z',
    })
    const mover = moverInicios(movida, {
      ...input,
      starts_at: '2027-02-02T16:00:00.000Z',
      ends_at: '2027-02-02T17:00:00.000Z',
    })
    expect(mover('2027-02-02T14:00:00.000Z', '2027-01-28T14:00:00.000Z')).toEqual({
      inicio: '2027-02-02T16:00:00.000Z',
      original: '2027-01-28T16:00:00.000Z',
    })
    expect(mover('2027-02-28T14:00:00.000Z', '2027-02-28T14:00:00.000Z').inicio).toBe('2027-02-28T16:00:00.000Z')
  })

  it('semanal: el mismo desplazamiento en las dos horas', () => {
    const semanal = { ...ev, repeticion: 'semanal' as const }
    const mover = moverInicios(semanal, { ...input, starts_at: '2027-01-26T17:00:00.000Z', ends_at: '2027-01-26T18:00:00.000Z' })
    expect(mover('2027-02-02T15:00:00.000Z', '2027-02-02T15:00:00.000Z')).toEqual({
      inicio: '2027-02-02T17:00:00.000Z',
      original: '2027-02-02T17:00:00.000Z',
    })
  })
})

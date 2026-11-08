import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import type { EmailContent, SendOptions } from '../../lib/email.mts'

// Funciones de correo y calendario: escapado de los correos, destinatarios
// de los recordatorios y de las invitaciones (bloques de mantenimiento y
// cuentas de servicio incluidos), feed iCal y la puerta de los buzones. Sin
// red: createClient devuelve un cliente falso y el envío de correo, el push
// y el IMAP se sustituyen por registros.

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(() => estado.cliente),
}))

// ics: el adjunto de la invitación (lo que el calendario de cada invitado
// guarda), para revisar también lo que sale fuera del cuerpo del correo
type Correo = { para: string[]; asunto: string; html: string; texto: string; ics?: string }
type Push = { tag?: string; body: string; url?: string; userIds?: string[] }
const envios = vi.hoisted(() => ({ correos: [] as Correo[], push: [] as Push[] }))
// Cuántas llamadas a teamEmails están en curso: así las llamadas a listUsers
// de teamEmails no se confunden con la resolución de cuentas de servicio,
// pidan la página que pidan
const enTeamEmails = vi.hoisted(() => ({ activas: 0 }))

vi.mock('../../lib/email.mts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/email.mts')>()
  return {
    ...original,
    teamEmails: vi.fn(async (...args: Parameters<typeof original.teamEmails>) => {
      enTeamEmails.activas += 1
      try {
        return await original.teamEmails(...args)
      } finally {
        enTeamEmails.activas -= 1
      }
    }),
    sendEmailTo: vi.fn(async (para: string[], contenido: EmailContent, _remitente?: string, opts?: SendOptions) => {
      envios.correos.push({
        para,
        asunto: contenido.subject,
        html: contenido.html,
        texto: contenido.text,
        ics: opts?.icalEvent?.content,
      })
      return { sent: para.length }
    }),
  }
})
vi.mock('../../lib/push.mts', () => ({
  broadcastPush: vi.fn(
    async (_admin: unknown, payload: { tag?: string; body: string; url?: string }, opts?: { userIds?: string[] }) => {
      envios.push.push({ tag: payload.tag, body: payload.body, url: payload.url, userIds: opts?.userIds })
      return { sent: 1, removed: 0 }
    },
  ),
}))

import {
  CUENTAS_SERVICIO,
  destinoAviso,
  enlaceHttps,
  esBloqueMantenimiento,
  esCuentaServicio,
  sendEmailTo,
  teamEmails,
} from '../../lib/email.mts'
import { buildInvite, fold, planSerie, reglaSerie, tipoSerie, type InviteEvent } from '../../lib/ics.mts'
import recordatorios, {
  idsCuentasServicio,
  PLAZO_CORREOS_MS,
  renderReminderEmail,
  USUARIOS_POR_PAGINA,
  type EventRow,
} from '../check-event-reminders.mts'
import notificar from '../notify-event.mts'

// ── Cliente falso ───────────────────────────────────────────────────────

type Consulta = {
  tabla: string
  accion: 'select' | 'insert' | 'update'
  valores?: unknown
  filtros: Record<string, unknown>
  modo: 'lista' | 'uno'
}
type Resultado = { data?: unknown; error?: unknown }
type Usuario = { id: string; email: string; banned_until?: string }
type Perfil = {
  full_name: string | null
  user_roles: { role: string; roles: { permissions: string[] } | null }[]
}

type PaginaUsuarios = { page?: number; perPage?: number }
type Datos = {
  sesion?: Usuario
  perfil?: Perfil
  usuarios?: Usuario[]
  tablas?: (c: Consulta) => Resultado | undefined
  rpc?: Resultado
  getUserById?: (id: string) => Resultado | Promise<Resultado>
  // Sin él, listUsers devuelve todos los usuarios en una sola página.
  // deTeamEmails: la llamada viene de teamEmails (no es una resolución)
  listUsers?: (p: PaginaUsuarios, deTeamEmails: boolean) => Resultado | undefined
  // Factores de la sesión (por defecto ninguno)
  factores?: { status: string }[]
}

// Constructor de consultas encadenable y «awaitable», como el de supabase-js:
// registra tabla, acción y filtros, y el resultado lo decide `tablas`.
interface Q extends PromiseLike<Resultado> {
  select(): Q
  insert(valores: unknown): Q
  update(valores: unknown): Q
  eq(col: string, val: unknown): Q
  in(col: string, vals: readonly unknown[]): Q
  gte(col: string, val: unknown): Q
  or(filtro: string): Q
  order(): Q
  single(): Promise<Resultado>
  maybeSingle(): Promise<Resultado>
}

function clienteFalso(d: Datos = {}) {
  const consultas: Consulta[] = []
  const auditoria: Record<string, unknown>[] = []
  // Llamadas a listUsers fuera de teamEmails (la resolución de cuentas de servicio)
  const resoluciones: PaginaUsuarios[] = []

  function resolver(c: Consulta): Resultado {
    if (c.tabla === 'profiles' && c.modo === 'uno') return { data: d.perfil ?? perfilDe('member'), error: null }
    if (c.tabla === 'audit_log' && c.accion === 'insert') {
      auditoria.push(c.valores as Record<string, unknown>)
      return { error: null }
    }
    return d.tablas?.(c) ?? { data: [], error: null }
  }

  const from = (tabla: string): Q => {
    const c: Consulta = { tabla, accion: 'select', filtros: {}, modo: 'lista' }
    const fin = async (): Promise<Resultado> => {
      consultas.push(c)
      const r = resolver(c)
      return { data: r.data ?? null, error: r.error ?? null }
    }
    const q: Q = {
      select: () => q,
      insert(valores) {
        c.accion = 'insert'
        c.valores = valores
        return q
      },
      update(valores) {
        c.accion = 'update'
        c.valores = valores
        return q
      },
      eq(col, val) {
        c.filtros[col] = val
        return q
      },
      in(col, vals) {
        c.filtros[`${col} in`] = vals
        return q
      },
      gte(col, val) {
        c.filtros[`${col}>=`] = val
        return q
      },
      or(filtro) {
        c.filtros.or = filtro
        return q
      },
      order: () => q,
      single() {
        c.modo = 'uno'
        return fin()
      },
      maybeSingle() {
        c.modo = 'uno'
        return fin()
      },
      then: (ok, mal) => fin().then(ok, mal),
    }
    return q
  }

  const cliente = {
    from,
    rpc: vi.fn(async () => d.rpc ?? { data: [], error: null }),
    auth: {
      getUser: vi.fn(async () =>
        d.sesion
          ? { data: { user: { ...d.sesion, factors: d.factores ?? [] } }, error: null }
          : { data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') },
      ),
      admin: {
        listUsers: vi.fn(async (p: PaginaUsuarios = {}) => {
          const deTeamEmails = enTeamEmails.activas > 0
          if (!deTeamEmails) resoluciones.push(p)
          const r = d.listUsers?.(p, deTeamEmails) ?? { data: { users: d.usuarios ?? [] } }
          return { data: r.data ?? { users: [] }, error: r.error ?? null }
        }),
        getUserById: vi.fn(async (id: string) => {
          const r = (await d.getUserById?.(id)) ?? {
            data: { user: (d.usuarios ?? []).find((u) => u.id === id) ?? null },
            error: null,
          }
          return { data: r.data ?? { user: null }, error: r.error ?? null }
        }),
      },
    },
  }
  estado.cliente = cliente
  return { cliente: cliente as unknown as SupabaseClient, consultas, auditoria, resoluciones }
}

function perfilDe(...roles: string[]): Perfil {
  const permisos: Record<string, string[]> = { member: [], comercial: ['edit_crm'], correo: ['view_mail'] }
  return {
    full_name: 'Ana Prueba',
    user_roles: roles.map((role) => ({ role, roles: { permissions: permisos[role] ?? [] } })),
  }
}

function jwt(claims: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.firma`
}

// IDs distintos por prueba: el límite por minuto del helper es del módulo
let secuencia = 0
const nuevoId = () => `00000000-0000-4000-8000-${String(++secuencia).padStart(12, '0')}`

function post(url: string, cuerpo: unknown, sesion?: Usuario): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sesion ? { Authorization: `Bearer ${jwt({ sub: sesion.id, aal: 'aal1' })}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  })
}

const ADMINS: Usuario[] = [
  { id: nuevoId(), email: 'marketing@empresa.test' },
  { id: nuevoId(), email: 'gerencia@empresa.test' },
  { id: nuevoId(), email: 'ventas@empresa.test' },
  { id: nuevoId(), email: 'proyectos@empresa.test' },
]
const OTRO: Usuario = { id: nuevoId(), email: 'logistica@empresa.test' }
const SERVICIO: Usuario[] = CUENTAS_SERVICIO.map((email) => ({ id: nuevoId(), email }))
const EQUIPO = [...ADMINS, OTRO, ...SERVICIO]

let silencios: { mockRestore(): void }[] = []

beforeEach(() => {
  envios.correos.length = 0
  envios.push.length = 0
  vi.stubEnv('SUPABASE_URL', 'https://proyecto.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  silencios = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
  ]
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const s of silencios) s.mockRestore()
})

// ── email.mts ───────────────────────────────────────────────────────────

describe('enlaceHttps', () => {
  it('acepta un enlace https limpio', () => {
    expect(enlaceHttps('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(enlaceHttps('HTTPS://zoom.us/j/123?pwd=x')).toBe('HTTPS://zoom.us/j/123?pwd=x')
  })

  it('rechaza otros esquemas y los caracteres que rompen el atributo', () => {
    expect(enlaceHttps('javascript:alert(1)')).toBeNull()
    expect(enlaceHttps('data:text/html,<b>x</b>')).toBeNull()
    expect(enlaceHttps('http://meet.google.com/abc')).toBeNull()
    expect(enlaceHttps('https://x.test/"onmouseover="alert(1)')).toBeNull()
    expect(enlaceHttps("https://x.test/'a")).toBeNull()
    expect(enlaceHttps('https://x.test/<script>')).toBeNull()
    expect(enlaceHttps('https://x.test/a b')).toBeNull()
    expect(enlaceHttps(' https://x.test')).toBeNull()
    expect(enlaceHttps('https://')).toBeNull()
  })

  it('null, undefined o vacío no son enlace', () => {
    expect(enlaceHttps(null)).toBeNull()
    expect(enlaceHttps(undefined)).toBeNull()
    expect(enlaceHttps('')).toBeNull()
  })
})

describe('cuentas de servicio', () => {
  it('incluye las tres cuentas y no distingue mayúsculas', () => {
    expect(esCuentaServicio('claude-dev@empresa.test')).toBe(true)
    expect(esCuentaServicio('bot@empresa.test')).toBe(true)
    expect(esCuentaServicio('Claude-QA@Empresa.Test')).toBe(true)
  })

  it('un miembro no es cuenta de servicio', () => {
    expect(esCuentaServicio('marketing@empresa.test')).toBe(false)
    expect(esCuentaServicio('bot@otro.test')).toBe(false)
    expect(esCuentaServicio(null)).toBe(false)
    expect(esCuentaServicio('')).toBe(false)
  })

  it('teamEmails las excluye, también cuando están invitadas', async () => {
    const { cliente } = clienteFalso({ usuarios: EQUIPO })
    const todos = await teamEmails(cliente)
    expect(todos).toEqual([...ADMINS, OTRO].map((u) => u.email))
    const invitados = await teamEmails(cliente, [ADMINS[0].id, SERVICIO[1].id])
    expect(invitados).toEqual([ADMINS[0].email])
  })
})

describe('esBloqueMantenimiento', () => {
  it('reconoce el prefijo «MANT · »', () => {
    expect(esBloqueMantenimiento('MANT · M2 · Ventana de servidores (requiere sudo)')).toBe(true)
    expect(esBloqueMantenimiento('MANT · S18 · Reemplazo del disco del servidor principal')).toBe(true)
    expect(esBloqueMantenimiento('  MANT · SEM · Revisión semanal')).toBe(true)
  })

  it('solo el prefijo exacto del sembrador', () => {
    expect(esBloqueMantenimiento('Mant · luminarias hotel')).toBe(false)
    expect(esBloqueMantenimiento('  mant ·SEM · Revisión semanal')).toBe(false)
    expect(esBloqueMantenimiento('MANT·SEM')).toBe(false)
  })

  it('no confunde otras reuniones', () => {
    expect(esBloqueMantenimiento('Mantenimiento de la web')).toBe(false)
    expect(esBloqueMantenimiento('Reunión MANT · cliente')).toBe(false)
    expect(esBloqueMantenimiento('MANTA · algo')).toBe(false)
    expect(esBloqueMantenimiento(null)).toBe(false)
  })
})

// ── check-event-reminders ───────────────────────────────────────────────

function evento(parcial: Partial<EventRow> = {}): EventRow {
  return {
    id: nuevoId(),
    title: 'Revisión semanal',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    all_day: false,
    ...parcial,
  }
}

describe('renderReminderEmail', () => {
  const PORTAL = 'http://localhost:5190'

  it('«Ver en el calendario» abre la reunión concreta', () => {
    const ev = evento({})
    const { html, text } = renderReminderEmail(ev, PORTAL)
    expect(html).toContain(`href="${PORTAL}/calendario?reunion=${ev.id}"`)
    expect(text).toContain(`${PORTAL}/calendario?reunion=${ev.id}`)
  })

  it('escapa título, lugar y descripción en el HTML', () => {
    const ev = evento({
      title: 'Cierre <a href="https://malo.test">clic</a> "urgente" & \'ya\'',
      location: 'Sala <img src=x onerror=alert(1)>',
      description: 'Traer <script>alert(1)</script> el informe',
    })
    const { html, text, subject } = renderReminderEmail(ev, PORTAL)
    expect(html).not.toContain('<a href="https://malo.test"')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain(
      'Cierre &lt;a href=&quot;https://malo.test&quot;&gt;clic&lt;/a&gt; &quot;urgente&quot; &amp; &#39;ya&#39;',
    )
    expect(html).toContain('Lugar: Sala &lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Traer &lt;script&gt;alert(1)&lt;/script&gt; el informe')
    // El texto plano y el asunto no se interpretan como HTML: quedan igual
    expect(text).toContain(ev.title)
    expect(subject).toContain(ev.title)
  })

  it('sin botón para un meeting_url que no es https', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://x.test/"onclick="alert(1)']) {
      const { html } = renderReminderEmail(evento({ meeting_url: url }), PORTAL)
      expect(html).not.toContain('Unirse a la reunión')
      expect(html).not.toContain('javascript:')
      expect(html).not.toContain('onclick')
    }
  })

  it('con botón para un https válido', () => {
    const { html } = renderReminderEmail(evento({ meeting_url: 'https://meet.google.com/abc-defg-hij?a=1&b=2' }), PORTAL)
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij?a=1&amp;b=2"')
    expect(html).toContain('Unirse a la reunión')
  })

  it('el texto plano solo lleva «Unirse» con un https válido', () => {
    for (const url of ['javascript:alert(1)', 'http://sitio.test/sala', 'data:text/html,x', 'https://x.test/"a']) {
      const { text } = renderReminderEmail(evento({ meeting_url: url }), PORTAL)
      expect(text).not.toContain('Unirse')
      expect(text).not.toContain(url)
    }
    const { text } = renderReminderEmail(evento({ meeting_url: 'https://meet.google.com/abc-defg-hij' }), PORTAL)
    expect(text).toContain('Unirse: https://meet.google.com/abc-defg-hij')
  })
})

describe('destinoAviso', () => {
  const MANT = { title: 'MANT · M1 · Portal y sitio' }
  const REUNION = { title: 'Reunión con proveedor' }
  const invitados = ADMINS.map((u) => ({ user_id: u.id, invited: true }))

  it('un bloque de mantenimiento sin invitados no avisa a nadie', () => {
    expect(destinoAviso(MANT, [])).toEqual({ modo: 'nadie' })
    // Los RSVP espontáneos no son invitados
    expect(destinoAviso(MANT, [{ user_id: OTRO.id, invited: false }])).toEqual({ modo: 'nadie' })
  })

  it('un bloque de mantenimiento con invitados avisa solo a ellos', () => {
    expect(destinoAviso(MANT, [...invitados, { user_id: OTRO.id, invited: false }])).toEqual({
      modo: 'invitados',
      userIds: ADMINS.map((u) => u.id),
    })
  })

  it('una reunión abierta avisa al equipo y una con invitados solo a ellos', () => {
    expect(destinoAviso(REUNION, [])).toEqual({ modo: 'equipo' })
    expect(destinoAviso(REUNION, [{ user_id: OTRO.id, invited: false }])).toEqual({ modo: 'equipo' })
    // Bases sin la columna invited: toda fila cuenta como invitación
    expect(destinoAviso(REUNION, [{ user_id: OTRO.id }])).toEqual({ modo: 'invitados', userIds: [OTRO.id] })
  })
})

type Asistentes = Record<string, { user_id: string; invited?: boolean }[]>

// Corrida de recordatorios con perfiles = EQUIPO. Registra cada inserción en
// la campana (una por evento, en orden) y las llamadas a listUsers que son
// la resolución de cuentas de servicio (las de teamEmails no cuentan).
function montarCorrida(eventos: EventRow[], asistentes: Asistentes = {}, extra: Partial<Datos> = {}) {
  const inserciones: { user_id: string; body: string }[][] = []
  const falso = clienteFalso({
    usuarios: EQUIPO,
    rpc: { data: eventos, error: null },
    tablas: (c) => {
      if (c.tabla === 'event_attendees') return { data: asistentes[c.filtros.event_id as string] ?? [] }
      if (c.tabla === 'profiles') return { data: EQUIPO.map((u) => ({ id: u.id })) }
      if (c.tabla === 'user_notifications' && c.accion === 'insert') {
        inserciones.push(c.valores as { user_id: string; body: string }[])
        return { error: null }
      }
      return undefined
    },
    ...extra,
  })
  const campana = (ev: EventRow) =>
    inserciones.flat().filter((a) => a.body.includes(ev.title)).map((a) => a.user_id)
  return { ...falso, inserciones, campana }
}

describe('recordatorios programados', () => {
  it('bloques de mantenimiento: sin invitados no avisa; con invitados solo a ellos', async () => {
    const mantSin = evento({ title: 'MANT · SEM · Revisión semanal' })
    const mantRsvp = evento({ title: 'MANT · M3 · Bases de datos, integraciones y costos' })
    const mantCon = evento({ title: 'MANT · M2 · Ventana de servidores (requiere sudo)' })
    const abierta = evento({ title: 'Almuerzo del equipo' })
    const asistentes: Record<string, { user_id: string; invited?: boolean }[]> = {
      [mantSin.id]: [],
      [mantRsvp.id]: [{ user_id: OTRO.id, invited: false }],
      [mantCon.id]: ADMINS.map((u) => ({ user_id: u.id, invited: true })),
      [abierta.id]: [],
    }
    const avisos: { user_id: string; body: string }[] = []
    clienteFalso({
      usuarios: EQUIPO,
      rpc: { data: [mantSin, mantRsvp, mantCon, abierta], error: null },
      tablas: (c) => {
        if (c.tabla === 'event_attendees') return { data: asistentes[c.filtros.event_id as string] }
        if (c.tabla === 'profiles') return { data: EQUIPO.map((u) => ({ id: u.id })) }
        if (c.tabla === 'user_notifications' && c.accion === 'insert') {
          avisos.push(...(c.valores as { user_id: string; body: string }[]))
          return { error: null }
        }
        return undefined
      },
    })

    const res = await recordatorios()
    const cuerpo = (await res.json()) as { reminded: number; sinAviso: number }
    expect(cuerpo.reminded).toBe(4)
    expect(cuerpo.sinAviso).toBe(2)

    // Sin invitados: ni campana, ni push, ni correo, y queda un registro
    for (const ev of [mantSin, mantRsvp]) {
      expect(avisos.some((a) => a.body.includes(ev.title))).toBe(false)
      expect(envios.push.some((p) => p.tag === `evento-${ev.id}`)).toBe(false)
      expect(envios.correos.some((c) => c.asunto.includes(ev.title))).toBe(false)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sin invitados'), { id: ev.id })
    }

    // Con invitados: exactamente los cuatro, nunca el equipo entero
    const ids = ADMINS.map((u) => u.id)
    expect(avisos.filter((a) => a.body.includes(mantCon.title)).map((a) => a.user_id)).toEqual(ids)
    expect(envios.push.find((p) => p.tag === `evento-${mantCon.id}`)?.userIds).toEqual(ids)
    expect(envios.correos.find((c) => c.asunto.includes(mantCon.title))?.para).toEqual(ADMINS.map((u) => u.email))

    // La reunión abierta sigue avisando a todo el equipo, sin cuentas de servicio
    expect(avisos.filter((a) => a.body.includes(abierta.title)).map((a) => a.user_id)).toEqual(
      [...ADMINS, OTRO].map((u) => u.id),
    )
    // El push va a la misma lista ya filtrada, nunca «a todos»
    expect(envios.push.find((p) => p.tag === `evento-${abierta.id}`)?.userIds).toEqual(
      [...ADMINS, OTRO].map((u) => u.id),
    )
    expect(envios.correos.find((c) => c.asunto.includes(abierta.title))?.para).toEqual(
      [...ADMINS, OTRO].map((u) => u.email),
    )
  })

  it('si no se leen los invitados no avisa a nadie y libera el reclamo para reintentar', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const mant = evento({ title: 'MANT · M2 · Ventana de servidores (requiere sudo)' })
      const privada = evento({ title: 'Negociación con proveedor', location: 'Sala 2' })
      const abierta = evento({ title: 'Almuerzo del equipo' })
      const fallan = new Set([mant.id, privada.id])
      const avisos: { body: string }[] = []
      const { consultas } = clienteFalso({
        usuarios: EQUIPO,
        rpc: { data: [mant, privada, abierta], error: null },
        tablas: (c) => {
          if (c.tabla === 'event_attendees') {
            return fallan.has(c.filtros.event_id as string)
              ? { error: { code: '57014', message: 'canceling statement due to statement timeout' } }
              : { data: [] }
          }
          if (c.tabla === 'profiles') return { data: EQUIPO.map((u) => ({ id: u.id })) }
          if (c.tabla === 'user_notifications' && c.accion === 'insert') {
            avisos.push(...(c.valores as { body: string }[]))
            return { error: null }
          }
          return undefined
        },
      })

      const cuerpo = (await (await recordatorios()).json()) as { sinAviso: number; aReintentar: number }
      expect(cuerpo.aReintentar).toBe(2)
      expect(cuerpo.sinAviso).toBe(0)

      for (const ev of [mant, privada]) {
        // Ni campana, ni push, ni correo: nada llega al equipo
        expect(avisos.some((a) => a.body.includes(ev.title))).toBe(false)
        expect(envios.push.some((p) => p.tag === `evento-${ev.id}`)).toBe(false)
        expect(envios.correos.some((c) => c.asunto.includes(ev.title))).toBe(false)
        // El reclamo vuelve a quedar pendiente para la corrida siguiente
        const libera = consultas.find(
          (c) => c.tabla === 'calendar_events' && c.accion === 'update' && c.filtros.id === ev.id,
        )
        expect(libera?.valores).toEqual({ reminded_at: null })
        // El registro es de error, no el de «sin invitados»
        expect(errores).toHaveBeenCalledWith(expect.stringContaining('invitados no disponibles'), {
          id: ev.id,
          codigo: '57014',
        })
      }
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('sin invitados'), expect.anything())

      // El resto de la corrida sigue: la reunión abierta avisa al equipo
      expect(avisos.filter((a) => a.body.includes(abierta.title))).toHaveLength(ADMINS.length + 1)
      expect(consultas.some((c) => c.accion === 'update' && c.filtros.id === abierta.id)).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })

  it('el correo del recordatorio sale escapado', async () => {
    const ev = evento({ title: '<b>Reunión</b>', meeting_url: 'javascript:alert(1)' })
    clienteFalso({
      usuarios: EQUIPO,
      rpc: { data: [ev], error: null },
      tablas: (c) => (c.tabla === 'event_attendees' ? { data: [{ user_id: OTRO.id, invited: true }] } : undefined),
    })
    await recordatorios()
    expect(envios.correos).toHaveLength(1)
    expect(envios.correos[0].para).toEqual([OTRO.email])
    expect(envios.correos[0].html).toContain('&lt;b&gt;Reunión&lt;/b&gt;')
    expect(envios.correos[0].html).not.toContain('Unirse a la reunión')
    expect(envios.correos[0].texto).not.toContain('Unirse')
    expect(envios.correos[0].texto).not.toContain('javascript:')
  })

  it('la campana de una reunión abierta no llega a las cuentas de servicio; una resolución por corrida', async () => {
    const abierta = evento({ title: 'Almuerzo del equipo' })
    const privada = evento({ title: 'Negociación con proveedor' })
    const otraAbierta = evento({ title: 'Capacitación de producto' })
    const c = montarCorrida([abierta, privada, otraAbierta], {
      [privada.id]: [{ user_id: OTRO.id, invited: true }],
    })
    await recordatorios()

    const miembros = [...ADMINS, OTRO].map((u) => u.id)
    expect(c.campana(abierta)).toEqual(miembros)
    expect(c.campana(otraAbierta)).toEqual(miembros)
    for (const s of SERVICIO) expect(c.inserciones.flat().some((a) => a.user_id === s.id)).toBe(false)
    // Con invitados la campana es la lista de invitados, sin resolver nada
    expect(c.campana(privada)).toEqual([OTRO.id])
    // Dos reuniones abiertas, una sola consulta a Auth
    expect(c.resoluciones).toHaveLength(1)
  })

  it('pagina la lista de usuarios hasta encontrar las cuentas de servicio', async () => {
    const relleno = Array.from({ length: USUARIOS_POR_PAGINA }, (_, i) => ({
      id: `relleno-${i}`,
      email: `persona${i}@otro.test`,
    }))
    const todos: Usuario[] = [...relleno, ...EQUIPO]
    const abierta = evento({ title: 'Almuerzo del equipo' })
    const c = montarCorrida([abierta], {}, {
      listUsers: ({ page = 1, perPage = 50 }) => ({
        data: { users: todos.slice((page - 1) * perPage, page * perPage) },
      }),
    })
    await recordatorios()
    // Las cuentas de servicio están en la segunda página
    expect(c.resoluciones.map((p) => p.page)).toEqual([1, 2])
    expect(c.campana(abierta)).toEqual([...ADMINS, OTRO].map((u) => u.id))
    expect(await idsCuentasServicio(c.cliente)).toEqual(new Set(SERVICIO.map((u) => u.id)))
  })

  it('si Auth se cuelga, la resolución vence a tiempo y devuelve null', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { cliente } = clienteFalso({ usuarios: EQUIPO })
      vi.mocked(cliente.auth.admin.listUsers).mockImplementation(() => new Promise(() => {}))
      expect(await idsCuentasServicio(cliente, 20)).toBeNull()
      expect(errores).toHaveBeenCalledWith(expect.stringContaining('cuentas de servicio no disponibles'), {
        motivo: 'plazo de Auth vencido',
      })
    } finally {
      errores.mockRestore()
    }
  })

  it('si Auth se cuelga solo en los correos, los demás eventos reciben campana y push', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const primera = evento({ title: 'Almuerzo del equipo' })
      const segunda = evento({ title: 'Revisión de obra' })
      const c = montarCorrida([primera, segunda])
      const lecturaOriginal = vi.mocked(c.cliente.auth.admin.listUsers).getMockImplementation()!
      // La resolución de cuentas de servicio responde; teamEmails se cuelga
      vi.mocked(c.cliente.auth.admin.listUsers).mockImplementation((p) =>
        enTeamEmails.activas > 0 ? new Promise(() => {}) : lecturaOriginal(p),
      )

      const llamadasPrevias = vi.mocked(teamEmails).mock.calls.length
      let cuerpo: Record<string, number> | undefined
      const corrida = recordatorios().then(async (r) => {
        cuerpo = (await r.json()) as Record<string, number>
      })
      await vi.advanceTimersByTimeAsync(PLAZO_CORREOS_MS)
      await corrida

      const miembros = [...ADMINS, OTRO].map((u) => u.id)
      for (const ev of [primera, segunda]) {
        expect(c.campana(ev)).toEqual(miembros)
        expect(envios.push.find((p) => p.tag === `evento-${ev.id}`)?.userIds).toEqual(miembros)
      }
      expect(envios.correos).toHaveLength(0)
      expect(cuerpo).toMatchObject({ reminded: 2, email: 0 })
      // Un solo plazo vencido por corrida: la segunda no vuelve a esperar a Auth
      expect(vi.mocked(teamEmails).mock.calls.length - llamadasPrevias).toBe(1)
      expect(errores).toHaveBeenCalledWith(expect.stringContaining('correos del equipo no disponibles'), {
        id: primera.id,
        motivo: 'plazo de Auth vencido',
      })
    } finally {
      // El teamEmails colgado nunca termina: su contador no baja solo
      enTeamEmails.activas = 0
      vi.useRealTimers()
      errores.mockRestore()
    }
  })

  it('si no se resuelven las cuentas de servicio, los avisos salen igual y sin excluirlas', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const fallo of ['error', 'excepción'] as const) {
        envios.correos.length = 0
        envios.push.length = 0
        errores.mockClear()
        const mant = evento({ title: 'MANT · M2 · Ventana de servidores (requiere sudo)' })
        const abierta = evento({ title: 'Almuerzo del equipo' })
        const c = montarCorrida([mant, abierta], { [mant.id]: ADMINS.map((u) => ({ user_id: u.id, invited: true })) }, {
          // Solo falla la resolución; teamEmails sigue leyendo su página
          listUsers: (_p, deTeamEmails) => {
            if (deTeamEmails) return undefined
            if (fallo === 'excepción') throw new TypeError('fetch failed')
            return { data: { users: [] }, error: new AuthRetryableFetchError('fetch failed', 0) }
          },
        })

        const cuerpo = (await (await recordatorios()).json()) as Record<string, number>
        expect(cuerpo).toMatchObject({ reminded: 2, sinAviso: 0, aReintentar: 0 })
        // El MANT con invitados no depende de la resolución
        const ids = ADMINS.map((u) => u.id)
        expect(c.campana(mant)).toEqual(ids)
        expect(envios.push.find((p) => p.tag === `evento-${mant.id}`)?.userIds).toEqual(ids)
        expect(envios.correos.find((m) => m.asunto.includes(mant.title))?.para).toEqual(ADMINS.map((u) => u.email))
        // La reunión abierta avisa a todos los perfiles, sin la exclusión
        expect(c.campana(abierta)).toEqual(EQUIPO.map((u) => u.id))
        expect(envios.push.some((p) => p.tag === `evento-${abierta.id}`)).toBe(true)
        expect(envios.correos.find((m) => m.asunto.includes(abierta.title))?.para).toEqual(
          [...ADMINS, OTRO].map((u) => u.email),
        )
        expect(errores).toHaveBeenCalledWith(expect.stringContaining('cuentas de servicio no disponibles'), {
          motivo: 'fetch failed',
        })
        expect(c.resoluciones).toHaveLength(1)
      }
    } finally {
      errores.mockRestore()
    }
  })
})

// ── notify-event ────────────────────────────────────────────────────────

describe('aviso de reunión (notify-event)', () => {
  const URL_FN = 'http://localhost/api/notify-event'
  const CREADOR: Usuario = { id: nuevoId(), email: 'ventas2@empresa.test' }
  // Un autor nuevo por llamada: el límite por minuto del helper es por usuario
  const nuevoAutor = (): Usuario => {
    const id = nuevoId()
    return { id, email: `autor-${id.slice(-6)}@empresa.test` }
  }

  type Opciones = {
    title?: string
    creador?: Usuario
    asistentes?: { user_id: string; invited?: boolean }[] | 'error'
    // Reunión periódica: columnas de la 82 y las filas de la serie
    extra?: Record<string, unknown>
    filasSerie?: Record<string, unknown>[]
  }

  // Cliente falso del último montar (para leer la auditoría)
  let cf: ReturnType<typeof clienteFalso>

  function montar(sesion: Usuario, perfil: Perfil, meeting_url: string | null = null, o: Opciones = {}) {
    const creador = o.creador ?? CREADOR
    const ev = {
      id: nuevoId(),
      title: o.title ?? 'Visita <i>obra</i>',
      description: null,
      location: null,
      meeting_url,
      starts_at: '2026-10-20T15:00:00Z',
      ends_at: '2026-10-20T16:00:00Z',
      all_day: false,
      created_by: creador.id,
      created_at: '2026-09-29T12:00:00Z',
      updated_at: '2026-09-29T12:00:00Z',
      ...o.extra,
    }
    const usuarios = [...EQUIPO, CREADOR]
    if (!usuarios.some((u) => u.id === creador.id)) usuarios.push(creador)
    vi.stubEnv('SMTP_USER', 'marketing@empresa.test')
    cf = clienteFalso({
      sesion,
      perfil,
      usuarios,
      tablas: (c) => {
        if (c.tabla === 'calendar_events') return { data: c.modo === 'lista' ? (o.filasSerie ?? []).map((f) => ({ ...ev, serie_inicio: null, ...f })) : ev }
        if (c.tabla === 'event_attendees') {
          if (o.asistentes === 'error') {
            return { error: { code: '57014', message: 'canceling statement due to statement timeout' } }
          }
          return { data: o.asistentes ?? [OTRO, SERVICIO[1]].map((u) => ({ user_id: u.id, invited: true })) }
        }
        return undefined
      },
    })
    return ev
  }

  it('el creador avisa a los invitados, sin cuentas de servicio y sin botón inseguro', async () => {
    const ev = montar(CREADOR, perfilDe('comercial'), 'javascript:alert(1)')
    const res = await notificar(post(URL_FN, { eventId: ev.id }, CREADOR))
    expect(res.status).toBe(200)
    expect(envios.correos).toHaveLength(1)
    // El convocante primero, luego los invitados; bot queda fuera
    expect(envios.correos[0].para).toEqual([CREADOR.email, OTRO.email])
    expect(envios.correos[0].html).toContain('Visita &lt;i&gt;obra&lt;/i&gt;')
    expect(envios.correos[0].html).not.toContain('Unirse a la reunión')
  })

  it('con un https válido sí hay botón', async () => {
    const ev = montar(CREADOR, perfilDe('comercial'), 'https://meet.google.com/abc-defg-hij')
    await notificar(post(URL_FN, { eventId: ev.id }, CREADOR))
    expect(envios.correos[0].html).toContain('href="https://meet.google.com/abc-defg-hij"')
  })

  it('quien no creó la reunión ni es admin: 403 y nada se envía', async () => {
    const sesion = { id: nuevoId(), email: 'otro@empresa.test' }
    const ev = montar(sesion, perfilDe('comercial'))
    const res = await notificar(post(URL_FN, { eventId: ev.id }, sesion))
    expect(res.status).toBe(403)
    expect(envios.correos).toHaveLength(0)
    expect(envios.push).toHaveLength(0)
  })

  it('la reunión ajena deja «[seguridad] denegado» y codigo sin_permiso, sin correos en el log', async () => {
    const sesion = { id: nuevoId(), email: 'otro@empresa.test' }
    const ev = montar(sesion, perfilDe('comercial'))
    const res = await notificar(post(URL_FN, { eventId: ev.id }, sesion))
    expect(res.status).toBe(403)
    expect(((await res.json()) as { codigo?: string }).codigo).toBe('sin_permiso')
    expect(console.warn).toHaveBeenCalledWith('[seguridad] denegado', {
      codigo: 'sin_permiso',
      userId: sesion.id,
      accion: 'notify-event',
    })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('otro@empresa')
  })

  it('un admin puede avisar aunque no sea el creador', async () => {
    const sesion = { id: nuevoId(), email: 'admin2@empresa.test' }
    const ev = montar(sesion, perfilDe('admin'))
    expect((await notificar(post(URL_FN, { eventId: ev.id }, sesion))).status).toBe(200)
  })

  it('sin sesión: 401 del helper', async () => {
    montar(CREADOR, perfilDe('comercial'))
    const res = await notificar(post(URL_FN, { eventId: nuevoId() }))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { codigo?: string }).codigo).toBe('no_autenticado')
  })

  it('si no se leen los invitados: 503 con código y nadie recibe nada', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const title of ['Negociación con proveedor', 'MANT · M2 · Ventana de servidores (requiere sudo)']) {
        const autor = nuevoAutor()
        const ev = montar(autor, perfilDe('comercial'), null, { title, creador: autor, asistentes: 'error' })
        const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
        expect(res.status).toBe(503)
        const cuerpo = (await res.json()) as { error?: string; codigo?: string }
        expect(cuerpo.codigo).toBe('invitados_no_disponibles')
        expect(cuerpo.error).toContain('no se envió ningún aviso')
        expect(errores).toHaveBeenCalledWith(expect.stringContaining('invitados no disponibles'), {
          id: ev.id,
          codigo: '57014',
        })
      }
      // Ni invitación ni push, tampoco a quien convoca
      expect(envios.correos).toHaveLength(0)
      expect(envios.push).toHaveLength(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('un MANT sin invitados no avisa a nadie, ni a quien convoca', async () => {
    const casos = [
      { asistentes: [] },
      // Un RSVP espontáneo no es un invitado
      { asistentes: [{ user_id: OTRO.id, invited: false }] },
      { asistentes: [], cancel: true },
    ]
    for (const caso of casos) {
      const autor = nuevoAutor()
      const ev = montar(autor, perfilDe('comercial'), 'https://meet.google.com/abc-defg-hij', {
        title: 'MANT · SEM · Revisión semanal',
        creador: autor,
        asistentes: caso.asistentes,
      })
      const res = await notificar(post(URL_FN, { eventId: ev.id, ...(caso.cancel ? { cancel: true } : {}) }, autor))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ recipients: 0, push: { sent: 0 }, email: { sent: 0 } })
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sin invitados'), { id: ev.id })
    }
    expect(envios.correos).toHaveLength(0)
    expect(envios.push).toHaveLength(0)
  })

  it('un MANT con invitados avisa solo a ellos, sin sumar a quien convoca', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, {
      title: 'MANT · M1 · Portal y sitio',
      creador: autor,
      asistentes: [...ADMINS.map((u) => ({ user_id: u.id, invited: true })), { user_id: OTRO.id, invited: false }],
    })
    const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { recipients: number }).recipients).toBe(ADMINS.length)
    expect(envios.correos).toHaveLength(1)
    expect(envios.correos[0].para).toEqual(ADMINS.map((u) => u.email))
    expect(envios.push).toEqual([expect.objectContaining({ userIds: ADMINS.map((u) => u.id) })])
  })

  it('el texto plano solo lleva «Unirse» con un https válido', async () => {
    for (const url of ['javascript:alert(1)', 'http://sitio.test/sala', 'data:text/html,x']) {
      envios.correos.length = 0
      const autor = nuevoAutor()
      const ev = montar(autor, perfilDe('comercial'), url, { creador: autor })
      await notificar(post(URL_FN, { eventId: ev.id }, autor))
      expect(envios.correos).toHaveLength(1)
      expect(envios.correos[0].texto).not.toContain('Unirse')
      expect(envios.correos[0].texto).not.toContain(url)
    }
    envios.correos.length = 0
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), 'https://meet.google.com/abc-defg-hij', { creador: autor })
    await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(envios.correos[0].texto).toContain('Unirse: https://meet.google.com/abc-defg-hij')
  })

  it('la invitación ICS adjunta solo lleva el enlace si es https, igual que el feed', async () => {
    // Las líneas plegadas (RFC 5545) se despliegan antes de mirar
    const lineas = (ics: string | undefined) => (ics ?? '').replace(/\r\n /g, '').split('\r\n')
    const inseguros = [
      { url: 'javascript:alert(1)', marca: 'alert(1)' },
      { url: 'http://sitio.test/sala', marca: 'sitio.test' },
      { url: 'data:text/html,x', marca: 'text/html' },
    ]
    for (const { url, marca } of inseguros) {
      // También al cancelar: el CANCEL actualiza el evento ya guardado
      for (const cancel of [false, true]) {
        envios.correos.length = 0
        const autor = nuevoAutor()
        const ev = montar(autor, perfilDe('comercial'), url, { creador: autor })
        await notificar(post(URL_FN, { eventId: ev.id, cancel }, autor))
        expect(envios.correos).toHaveLength(1)
        const ics = lineas(envios.correos[0].ics)
        expect(ics).toContain('BEGIN:VEVENT')
        expect(ics.some((l) => l.startsWith('URL:'))).toBe(false)
        expect(ics.join('\n')).not.toContain('Unirse')
        expect(ics.join('\n')).not.toContain(marca)
      }
    }
    envios.correos.length = 0
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), 'https://meet.google.com/abc-defg-hij', { creador: autor })
    await notificar(post(URL_FN, { eventId: ev.id }, autor))
    const ics = lineas(envios.correos[0].ics)
    expect(ics).toContain('DESCRIPTION:Unirse: https://meet.google.com/abc-defg-hij')
    expect(ics).toContain('URL:https://meet.google.com/abc-defg-hij')
  })

  it('una reunión abierta manda el push al equipo sin cuentas de servicio', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor, asistentes: [] })
    expect((await notificar(post(URL_FN, { eventId: ev.id }, autor))).status).toBe(200)
    expect(envios.push).toHaveLength(1)
    const ids = envios.push[0].userIds ?? []
    expect(ids).toEqual(expect.arrayContaining([...ADMINS, OTRO, autor].map((u) => u.id)))
    for (const s of SERVICIO) expect(ids).not.toContain(s.id)
  })

  it('si la lista del equipo queda vacía no llama al push (vacío sería «a todos»)', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor, asistentes: [] })
    // Auth solo devuelve cuentas de servicio
    const cliente = estado.cliente as SupabaseClient
    vi.mocked(cliente.auth.admin.listUsers).mockResolvedValue({
      data: { users: SERVICIO },
      error: null,
    } as never)
    const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ recipients: 0, push: { sent: 0 } })
    expect(envios.push).toHaveLength(0)
  })

  it('si falla la lectura del evento: 500 genérico, sin el mensaje de la base', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const autor = nuevoAutor()
      vi.stubEnv('SMTP_USER', 'marketing@empresa.test')
      clienteFalso({
        sesion: autor,
        perfil: perfilDe('comercial'),
        usuarios: EQUIPO,
        tablas: (c) =>
          c.tabla === 'calendar_events'
            ? { error: { code: '42P01', message: 'relation "calendar_events" does not exist' } }
            : undefined,
      })
      const res = await notificar(post(URL_FN, { eventId: nuevoId() }, autor))
      expect(res.status).toBe(500)
      const texto = await res.text()
      expect(texto).not.toContain('relation')
      expect(JSON.parse(texto)).toEqual({ error: 'No se pudo leer el evento' })
      expect(errores).toHaveBeenCalledWith(expect.stringContaining('no se pudo leer el evento'), { codigo: '42P01' })
    } finally {
      errores.mockRestore()
    }
  })

  it('el límite por hora del miembro corta antes de avisar', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor })
    const cliente = estado.cliente as SupabaseClient
    vi.mocked(cliente.rpc).mockResolvedValue({ data: true, error: null } as never)
    const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(res.status).toBe(429)
    expect(cliente.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_clave: 'notify-event:' + autor.id,
      p_ventana_seg: 3600,
      p_max: 20,
    })
    expect(envios.correos).toHaveLength(0)
    expect(envios.push).toHaveLength(0)
  })

  it('con factor verificado y sesión aal1: 401 mfa_requerida y nada se envía', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor })
    const cliente = estado.cliente as SupabaseClient
    vi.mocked(cliente.auth.getUser).mockResolvedValue({
      data: { user: { ...autor, factors: [{ status: 'verified' }] } },
      error: null,
    } as never)
    const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { codigo?: string }).codigo).toBe('mfa_requerida')
    expect(envios.correos).toHaveLength(0)
    expect(envios.push).toHaveLength(0)
  })

  it('un nombre con «:» o «;» no rompe los parámetros CN del ICS', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, { ...perfilDe('comercial'), full_name: 'Ana; ROLE=CHAIR:mailto:x@malo.test "jefa"' }, null, {
      creador: autor,
    })
    await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(envios.correos).toHaveLength(1)
    const lineas = (envios.correos[0].ics ?? '').replace(/\r\n /g, '').split('\r\n')
    expect(lineas).toContain(
      'ORGANIZER;CN="Ana; ROLE=CHAIR:mailto:x@malo.test jefa — Portal del equipo":mailto:marketing@empresa.test',
    )
  })

  it('la invitación ICS escapa un CR suelto del título, como el feed', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor, title: 'Visita\robra' })
    await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(envios.correos).toHaveLength(1)
    const lineas = (envios.correos[0].ics ?? '').replace(/\r\n /g, '').split('\r\n')
    expect(lineas).toContain('SUMMARY:Visita\\nobra')
    expect(lineas.some((l) => /[\r\n]/.test(l))).toBe(false)
  })

  it('cancelación parcial (soloA): solo a los pedidos que de verdad están invitados', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, {
      creador: autor,
      asistentes: [
        { user_id: OTRO.id, invited: true },
        { user_id: ADMINS[0].id, invited: false },
      ],
    })
    // ADMINS[0] solo tiene un RSVP espontáneo y ADMINS[1] no figura: fuera
    const res = await notificar(
      post(URL_FN, { eventId: ev.id, cancel: true, soloA: [OTRO.id, ADMINS[0].id, ADMINS[1].id] }, autor),
    )
    expect(res.status).toBe(200)
    expect(envios.correos).toHaveLength(1)
    // Sin el convocante: para él la reunión sigue en pie
    expect(envios.correos[0].para).toEqual([OTRO.email])
    expect(envios.correos[0].ics).toContain('METHOD:CANCEL')
    expect(envios.push).toEqual([expect.objectContaining({ userIds: [OTRO.id] })])
  })

  it('soloA sin coincidencias no avisa a nadie (nunca cae a todo el equipo)', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor, asistentes: [] })
    const res = await notificar(post(URL_FN, { eventId: ev.id, cancel: true, soloA: [OTRO.id] }, autor))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ recipients: 0 })
    expect(envios.correos).toHaveLength(0)
    expect(envios.push).toHaveLength(0)
  })

  it('soloA sin cancel: 400', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor })
    const res = await notificar(post(URL_FN, { eventId: ev.id, soloA: [OTRO.id] }, autor))
    expect(res.status).toBe(400)
    expect(envios.correos).toHaveLength(0)
  })

  it('el correo y el push abren la reunión concreta', async () => {
    const autor = nuevoAutor()
    const ev = montar(autor, perfilDe('comercial'), null, { creador: autor })
    await notificar(post(URL_FN, { eventId: ev.id }, autor))
    expect(envios.correos[0].html).toContain(`/calendario?reunion=${ev.id}"`)
    expect(envios.correos[0].texto).toContain(`/calendario?reunion=${ev.id}`)
    expect(envios.push[0]).toEqual(expect.objectContaining({ url: `/calendario?reunion=${ev.id}` }))
  })

  describe('reuniones periódicas', () => {
    const SERIE = '7d0f6a52-3c1e-4b8e-9f0a-2b6c5d4e3f21'
    const lineas = (ics: string | undefined) => (ics ?? '').replace(/\r\n /g, '').split('\r\n')
    // Tres lunes seguidos a las 10:00 de Bogotá; se avisa desde la segunda
    const filas = ['2026-11-02', '2026-11-09', '2026-11-16'].map((d, i) => ({
      id: `fila-${i}`,
      starts_at: `${d}T15:00:00Z`,
      ends_at: `${d}T16:00:00Z`,
    }))
    const serie = (autor: Usuario, extra: Record<string, unknown> = {}) =>
      montar(autor, perfilDe('comercial'), null, {
        creador: autor,
        extra: {
          serie_id: SERIE,
          repeticion: 'semanal',
          starts_at: filas[1].starts_at,
          ends_at: filas[1].ends_at,
          serie_inicio: filas[1].starts_at,
          ...extra,
        },
        filasSerie: filas,
      })

    it('con serie: una sola invitación con la regla, desde la primera fecha hasta la última', async () => {
      const autor = nuevoAutor()
      const ev = serie(autor)
      expect((await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))).status).toBe(200)
      expect(envios.correos).toHaveLength(1)
      const ics = lineas(envios.correos[0].ics)
      expect(ics).toContain(`UID:serie-${SERIE}@portal.invalid`)
      expect(ics).toContain('BEGIN:VTIMEZONE')
      expect(ics).toContain('DTSTART;TZID=America/Bogota:20261102T100000')
      expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261116T150000Z')
      expect(ics.some((l) => l.startsWith('RECURRENCE-ID'))).toBe(false)
      expect(envios.correos[0].html).toContain('Frecuencia: cada semana, hasta el 16 de noviembre de 2026')
      expect(envios.correos[0].texto).toContain('\ncada semana, hasta el 16 de noviembre de 2026')
    })

    it('sin serie: solo esa fecha, con el UID de la serie y su inicio original', async () => {
      const autor = nuevoAutor()
      // La ocurrencia se movió una hora; RECURRENCE-ID sigue siendo la original
      const ev = serie(autor, { starts_at: '2026-11-09T16:00:00Z', ends_at: '2026-11-09T17:00:00Z' })
      await notificar(post(URL_FN, { eventId: ev.id, cancel: true }, autor))
      const ics = lineas(envios.correos[0].ics)
      expect(ics).toContain('METHOD:CANCEL')
      expect(ics).toContain(`UID:serie-${SERIE}@portal.invalid`)
      expect(ics).toContain('RECURRENCE-ID;TZID=America/Bogota:20261109T100000')
      expect(ics).toContain('DTSTART;TZID=America/Bogota:20261109T110000')
      expect(ics.some((l) => l.startsWith('RRULE'))).toBe(false)
    })

    it('SEQUENCE crece con cada reenvío de la serie', async () => {
      const autor = nuevoAutor()
      const ev = serie(autor)
      const seq = () => Number(lineas(envios.correos.at(-1)?.ics).find((l) => l.startsWith('SEQUENCE:'))?.slice(9))
      vi.useFakeTimers({ now: new Date('2026-11-01T12:00:00Z'), toFake: ['Date'] })
      try {
        await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))
        const primero = seq()
        vi.setSystemTime(new Date('2026-11-01T12:05:00Z'))
        await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))
        expect(seq()).toBeGreaterThan(primero)
      } finally {
        vi.useRealTimers()
      }
    })

    it('la serie sale de los inicios originales: EXDATE para la borrada y VEVENT para la movida', async () => {
      const autor = nuevoAutor()
      // Del 2 al 23: el 9 se borró y la PRIMERA (2) se movió al martes 3
      const filasReales = [
        { id: 'a', starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T16:00:00Z', serie_inicio: '2026-11-02T15:00:00Z', title: 'Comité (martes)' },
        { id: 'c', starts_at: '2026-11-16T15:00:00Z', ends_at: '2026-11-16T16:00:00Z', serie_inicio: '2026-11-16T15:00:00Z', title: 'Comité' },
        { id: 'd', starts_at: '2026-11-23T15:00:00Z', ends_at: '2026-11-23T16:00:00Z', serie_inicio: '2026-11-23T15:00:00Z', title: 'Comité' },
      ].map((f) => ({ ...f, all_day: false, description: null, location: null, meeting_url: null, created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z' }))
      const ev = montar(autor, perfilDe('comercial'), null, {
        creador: autor,
        title: 'Comité',
        extra: {
          serie_id: SERIE,
          repeticion: 'semanal',
          starts_at: filasReales[1].starts_at,
          ends_at: filasReales[1].ends_at,
          serie_inicio: filasReales[1].serie_inicio,
        },
        filasSerie: filasReales,
      })
      await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))
      const ics = lineas(envios.correos[0].ics)
      // El lunes original sigue mandando: la regla no se corre al martes
      expect(ics).toContain('DTSTART;TZID=America/Bogota:20261102T100000')
      expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261123T150000Z')
      expect(ics).toContain('EXDATE;TZID=America/Bogota:20261109T100000')
      // La movida: mismo UID, RECURRENCE-ID original y su hora real
      const vevents = ics.filter((l) => l === 'BEGIN:VEVENT').length
      expect(vevents).toBe(2)
      expect(ics).toContain('RECURRENCE-ID;TZID=America/Bogota:20261102T100000')
      expect(ics).toContain('DTSTART;TZID=America/Bogota:20261103T100000')
      expect(ics).toContain('SUMMARY:Comité (martes)')
      expect(ics.filter((l) => l === `UID:serie-${SERIE}@portal.invalid`)).toHaveLength(2)
    })

    it('el correo muestra la fecha que avisa con su cambio; el .ics, el maestro', async () => {
      const autor = nuevoAutor()
      // Cuatro lunes: las dos últimas pasaron a «Sala B» (empate: manda «Sala A»)
      const lugares = ['Sala A', 'Sala A', 'Sala B', 'Sala B']
      const filasLugar = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map((d, i) => ({
        id: `l${i}`,
        starts_at: `${d}T15:00:00Z`,
        ends_at: `${d}T16:00:00Z`,
        location: lugares[i],
      }))
      // Avisa la tercera fecha, una de las que cambiaron
      const ev = montar(autor, perfilDe('comercial'), null, {
        creador: autor,
        extra: {
          serie_id: SERIE,
          repeticion: 'semanal',
          starts_at: filasLugar[2].starts_at,
          ends_at: filasLugar[2].ends_at,
          serie_inicio: filasLugar[2].starts_at,
          location: 'Sala B',
        },
        filasSerie: filasLugar,
      })
      await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))
      expect(envios.correos[0].texto).toContain('Sala B')
      expect(envios.correos[0].texto).not.toContain('Sala A')
      const ics = lineas(envios.correos[0].ics)
      // Maestro con «Sala A» y las dos de «Sala B» como excepción
      expect(ics.filter((l) => l === 'LOCATION:Sala A')).toHaveLength(1)
      expect(ics.filter((l) => l === 'LOCATION:Sala B')).toHaveLength(2)
    })

    it('quitar invitados desde una fecha con fechas antes: la serie les llega con su nuevo final', async () => {
      const autor = nuevoAutor()
      // Se quita desde la segunda fecha (9 de noviembre)
      const ev = serie(autor)
      const res = await notificar(post(URL_FN, { eventId: ev.id, cancel: true, soloA: [OTRO.id], serie: true }, autor))
      expect(res.status).toBe(200)
      expect(envios.correos).toHaveLength(1)
      expect(envios.correos[0].para).toEqual([OTRO.email])
      expect(envios.correos[0].asunto).toMatch(/^Cancelada desde el 9 de noviembre de 2026: /)
      const ics = lineas(envios.correos[0].ics)
      // Actualización de la serie, no cancelación: la fecha anterior sigue
      expect(ics).toContain('METHOD:REQUEST')
      expect(ics).toContain('DTSTART;TZID=America/Bogota:20261102T100000')
      expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261102T150000Z')
      expect(ics).not.toContain('STATUS:CANCELLED')
      expect(envios.push).toEqual([expect.objectContaining({ userIds: [OTRO.id] })])
    })

    it('quitar invitados desde la primera fecha: se les cancela la serie entera', async () => {
      const autor = nuevoAutor()
      const ev = serie(autor, { starts_at: filas[0].starts_at, ends_at: filas[0].ends_at, serie_inicio: filas[0].starts_at })
      await notificar(post(URL_FN, { eventId: ev.id, cancel: true, soloA: [OTRO.id], serie: true }, autor))
      expect(envios.correos[0].asunto).toMatch(/^Cancelada: /)
      const ics = lineas(envios.correos[0].ics)
      expect(ics).toContain('METHOD:CANCEL')
      expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261116T150000Z')
      expect(ics).toContain('STATUS:CANCELLED')
    })

    it('si no se lee la serie: 500 y nada se envía', async () => {
      const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const autor = nuevoAutor()
        const ev = montar(autor, perfilDe('comercial'), null, {
          creador: autor,
          extra: { serie_id: SERIE, repeticion: 'mensual' },
          filasSerie: [],
        })
        expect((await notificar(post(URL_FN, { eventId: ev.id, serie: true }, autor))).status).toBe(500)
        expect(envios.correos).toHaveLength(0)
      } finally {
        errores.mockRestore()
      }
    })
  })

  it('cada aviso queda en la auditoría con origen servidor, cifras y sin correos', async () => {
    const ev = montar(CREADOR, perfilDe('comercial'))
    await notificar(post(URL_FN, { eventId: ev.id }, CREADOR))
    expect(cf.auditoria).toEqual([
      expect.objectContaining({
        user_id: CREADOR.id,
        action: 'reunion.avisar',
        detail: '2 destinatarios · push 1 · correo 2',
        entity: 'calendar_events',
        entity_id: ev.id,
        origen: 'servidor',
      }),
    ])
    const autor = nuevoAutor()
    const otro = montar(autor, perfilDe('comercial'), null, { creador: autor })
    await notificar(post(URL_FN, { eventId: otro.id, cancel: true }, autor))
    expect(cf.auditoria).toEqual([expect.objectContaining({ action: 'reunion.cancelar_aviso', entity_id: otro.id })])
    expect(String(cf.auditoria[0].detail)).not.toContain('@')
  })

  it('si el SMTP rechaza, el error es genérico con código y el log no lleva el mensaje', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const autor = nuevoAutor()
      const ev = montar(autor, perfilDe('comercial'), null, { creador: autor })
      vi.mocked(sendEmailTo).mockRejectedValueOnce(
        Object.assign(new Error('Invalid login: 535 marketing@empresa.test rechazado'), { code: 'EAUTH' }),
      )
      const res = await notificar(post(URL_FN, { eventId: ev.id }, autor))
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as { email: Record<string, unknown> }
      expect(cuerpo.email).toEqual({ sent: 0, error: 'falló el servidor de correo', codigo: 'smtp' })
      expect(errores).toHaveBeenCalledWith('notify-event: correo', { nombre: 'Error', codigo: 'EAUTH' })
      expect(JSON.stringify(errores.mock.calls)).not.toContain('Invalid login')
    } finally {
      errores.mockRestore()
    }
  })
})

describe('buildInvite (netlify/lib/ics.mts)', () => {
  const base: InviteEvent = {
    id: 'ev-1',
    title: 'Reunión',
    description: null,
    location: null,
    meeting_url: null,
    starts_at: '2026-10-20T15:00:00Z',
    ends_at: '2026-10-20T16:00:00Z',
    all_day: false,
    created_at: '2026-09-29T12:00:00Z',
    updated_at: '2026-09-29T12:00:00Z',
  }
  const lineas = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n')

  it('CN entre comillas, sin comillas ni saltos dentro, en ORGANIZER y ATTENDEE', () => {
    const ics = lineas(
      buildInvite(base, { email: 'org@empresa.test', name: 'Org:a;b' }, [
        { email: 'ana@empresa.test', name: 'Ana "la jefa"; ROLE=CHAIR:mailto:x@malo.test\r\nX' },
        { email: 'luis@empresa.test' },
      ]),
    )
    expect(ics).toContain('ORGANIZER;CN="Org:a;b":mailto:org@empresa.test')
    expect(ics).toContain('ATTENDEE;RSVP=TRUE;CN="Ana la jefa; ROLE=CHAIR:mailto:x@malo.testX":mailto:ana@empresa.test')
    expect(ics).toContain('ATTENDEE;RSVP=TRUE:mailto:luis@empresa.test')
  })

  it('solo escribe el enlace de la reunión si es https', () => {
    for (const url of ['javascript:alert(1)', 'http://sitio.test/sala', 'https://a.test/x y']) {
      const ics = lineas(buildInvite({ ...base, meeting_url: url }, { email: 'o@l.test', name: 'O' }, []))
      expect(ics.some((l) => l.startsWith('URL:'))).toBe(false)
      expect(ics.join('\n')).not.toContain('Unirse')
    }
    const ics = lineas(buildInvite({ ...base, meeting_url: 'https://meet.google.com/abc' }, { email: 'o@l.test', name: 'O' }, []))
    expect(ics).toContain('URL:https://meet.google.com/abc')
  })

  it('serie: RRULE o RECURRENCE-ID, con fecha sola en las de todo el día', () => {
    const org = { email: 'o@l.test', name: 'O' }
    const diaCompleto = { ...base, all_day: true, starts_at: '2026-11-02T05:00:00Z', ends_at: '2026-11-03T04:59:00Z' }
    const regla = lineas(
      buildInvite(diaCompleto, org, [], { uid: 'serie-x@portal.invalid', rrule: reglaSerie('mensual', '2027-02-02T05:00:00Z', true) }),
    )
    expect(regla).toContain('RRULE:FREQ=MONTHLY;UNTIL=20270202')
    expect(regla).toContain('UID:serie-x@portal.invalid')
    const una = lineas(buildInvite(diaCompleto, org, [], { recurrenceId: '2026-11-02T05:00:00Z', sequence: 7 }))
    expect(una).toContain('RECURRENCE-ID;VALUE=DATE:20261102')
    expect(una).toContain('SEQUENCE:7')
    expect(reglaSerie('quincenal', '2026-12-14T15:00:00Z', false)).toBe('FREQ=WEEKLY;INTERVAL=2;UNTIL=20261214T150000Z')
  })

  it('pliega por octetos UTF-8 (75 como mucho) sin partir caracteres ni pares sustitutos', () => {
    const linea = `SUMMARY:${'ñ'.repeat(50)}${'😀'.repeat(20)}${'a'.repeat(100)}`
    const plegada = fold(linea)
    const fisicas = plegada.split('\r\n')
    expect(fisicas.length).toBeGreaterThan(1)
    for (const l of fisicas) {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75)
      // Sin sustitutos sueltos: la línea pasa por UTF-8 sin cambiar
      expect(Buffer.from(l, 'utf8').toString('utf8')).toBe(l)
    }
    expect(fisicas.slice(1).every((l) => l.startsWith(' '))).toBe(true)
    expect(plegada.replace(/\r\n /g, '')).toBe(linea)
  })

  it('una línea de 75 octetos no se pliega; la de 76 sí, con la continuación en 75', () => {
    expect(fold('X'.repeat(75))).toBe('X'.repeat(75))
    expect(fold('X'.repeat(76)).split('\r\n')).toEqual(['X'.repeat(75), ' X'])
    expect(fold('X'.repeat(150)).split('\r\n').map((l) => l.length)).toEqual([75, 75, 2])
  })

  describe('planSerie', () => {
    // Ocho lunes a las 10:00 de Bogotá
    const fila = (i: number, cambios: Partial<InviteEvent & { serie_inicio: string }> = {}) => {
      const d = new Date(Date.UTC(2026, 10, 2 + 7 * i, 15))
      return {
        ...base,
        id: `f${i}`,
        title: 'Comité',
        location: 'Sala A',
        starts_at: d.toISOString(),
        ends_at: new Date(d.getTime() + 3600_000).toISOString(),
        serie_inicio: d.toISOString(),
        ...cambios,
      }
    }

    it('«Esta y las siguientes» solo con lugar desde la 5.ª: las 1-4 no cambian en el calendario del invitado', () => {
      const filas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => fila(i, i >= 4 ? { location: 'Sala B' } : {}))
      const plan = planSerie(filas, 'semanal')
      // Empate 4 a 4: manda la fecha más temprana
      expect(plan.maestro.location).toBe('Sala A')
      expect(plan.excepciones.map((x) => x.ev.id)).toEqual(['f4', 'f5', 'f6', 'f7'])
      expect(plan.excepciones.every((x) => x.ev.location === 'Sala B')).toBe(true)
    })

    it('una fecha cambiada «Solo esta» sin mover la hora sale como excepción y no contagia al maestro', () => {
      const filas = [0, 1, 2, 3].map((i) => fila(i, i === 2 ? { location: 'Showroom', title: 'Comité con cliente' } : {}))
      const plan = planSerie(filas, 'semanal')
      expect(plan.maestro).toMatchObject({ title: 'Comité', location: 'Sala A', starts_at: filas[0].starts_at })
      expect(plan.excepciones.map((x) => [x.ev.id, x.recurrenceId])).toEqual([['f2', filas[2].serie_inicio]])
      expect(plan.exdates).toEqual([])
    })

    it('el tipo de la serie no cambia aunque la mayoría de fechas pase a «Todo el día»', () => {
      // 2 de 3 fechas con hora pasan a todo el día (empiezan a las 8:00: movidas)
      const filas = [0, 1, 2].map((i) =>
        fila(i, i > 0 ? { all_day: true, starts_at: new Date(Date.UTC(2026, 10, 2 + 7 * i, 13)).toISOString() } : {}),
      )
      const plan = planSerie(filas, 'semanal')
      expect(plan.allDay).toBe(false)
      expect(plan.maestro.all_day).toBe(false)
      expect(plan.excepciones.map((x) => x.ev.id)).toEqual(['f1', 'f2'])
    })

    it('RECURRENCE-ID con el tipo de la serie aunque la fecha pase a «Todo el día»', () => {
      const filas = [0, 1, 2].map((i) => fila(i, i === 1 ? { all_day: true } : {}))
      const plan = planSerie(filas, 'semanal')
      expect(plan.allDay).toBe(false)
      const ics = lineas(
        buildInvite(plan.maestro, { email: 'o@l.test', name: 'O' }, [], {
          uid: 'serie-x',
          rrule: reglaSerie('semanal', plan.ultimo, plan.allDay),
          excepciones: plan.excepciones,
          zona: true,
          recurrenceAllDay: plan.allDay,
        }),
      )
      expect(ics).toContain('RECURRENCE-ID;TZID=America/Bogota:20261109T100000')
      expect(ics).toContain('DTSTART;VALUE=DATE:20261109')
      expect(ics.filter((l) => l === 'BEGIN:VTIMEZONE')).toHaveLength(1)
    })

    // Lunes a las 8:00 de Bogotá, la hora a la que empieza «Todo el día»
    const ocho = (i: number) => Date.UTC(2026, 10, 2 + 7 * i, 13)
    const iso = (t: number) => new Date(t).toISOString()
    const DIA = 15 * 3600_000 + 59 * 60_000

    it('serie a las 8:00 con fechas pasadas a «Todo el día» sin moverlas: sigue con hora aunque sean mayoría', () => {
      const filas = [0, 1, 2].map((i) =>
        fila(i, {
          all_day: i > 0,
          starts_at: iso(ocho(i)),
          ends_at: iso(ocho(i) + (i > 0 ? DIA : 3600_000)),
          serie_inicio: iso(ocho(i)),
        }),
      )
      expect(tipoSerie(filas)).toBe(false)
      const plan = planSerie(filas, 'semanal')
      expect(plan.allDay).toBe(false)
      expect(plan.maestro.all_day).toBe(false)
      expect(plan.excepciones.map((x) => x.ev.id)).toEqual(['f1', 'f2'])
    })

    it('serie de todo el día: una fecha suelta con hora no cambia el tipo', () => {
      const filas = [0, 1, 2].map((i) =>
        fila(i, {
          all_day: true,
          starts_at: iso(ocho(i)),
          ends_at: iso(ocho(i) + DIA),
          serie_inicio: iso(ocho(i)),
          // La segunda pasa a las 10:00-11:00
          ...(i === 1 ? { all_day: false, starts_at: iso(ocho(i) + 2 * 3600_000), ends_at: iso(ocho(i) + 3 * 3600_000) } : {}),
        }),
      )
      expect(tipoSerie(filas)).toBe(true)
      const plan = planSerie(filas, 'semanal')
      expect(plan.maestro.all_day).toBe(true)
      expect(reglaSerie('semanal', plan.ultimo, plan.allDay)).toBe('FREQ=WEEKLY;INTERVAL=1;UNTIL=20261116')
      expect(plan.excepciones.map((x) => x.ev.id)).toEqual(['f1'])
    })

    it('límite conocido: en una serie de todo el día, una fecha suelta con hora a las 8:00 la vuelve con hora', () => {
      // Sin columna con el tipo de la serie (1.11.31), una fecha que empieza
      // a las 8:00 no se distingue de una serie con hora a esa hora en la que
      // otras fechas pasaron a «Todo el día». Se elige «con hora».
      const filas = [0, 1, 2].map((i) =>
        fila(i, {
          all_day: true,
          starts_at: iso(ocho(i)),
          ends_at: iso(ocho(i) + DIA),
          serie_inicio: iso(ocho(i)),
          // La segunda pasa a 8:00-9:00 con hora: no se mueve
          ...(i === 1 ? { all_day: false, ends_at: iso(ocho(i) + 3600_000) } : {}),
        }),
      )
      expect(tipoSerie(filas)).toBe(false)
      const plan = planSerie(filas, 'semanal')
      expect(plan.allDay).toBe(false)
      expect(plan.maestro.all_day).toBe(false)
    })

    it('con el tipo de la serie entera, una parte sin fechas de ese tipo no falla', () => {
      const plan = planSerie([fila(0, { all_day: true })], 'semanal', false)
      expect(plan.allDay).toBe(false)
      expect(plan.maestro.all_day).toBe(false)
    })
  })
})

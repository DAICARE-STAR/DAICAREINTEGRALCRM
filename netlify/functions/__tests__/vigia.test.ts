import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Funciones que vigilan o avisan al equipo: push-notify (avisos del Radar) y
// revision-seguridad. check-tender-alerts y sync-connectors llegan con el
// módulo licitaciones (docs/origen.md). El helper de autorización y push.mts tienen su propia
// batería (netlify/lib/__tests__); aquí se sustituyen para comprobar QUÉ
// exige cada función, a quién avisa y que nada se envíe ni se ejecute
// cuando el requisito falla.

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(() => estado.cliente),
}))

vi.mock('../../lib/autorizacion.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/autorizacion.mts')>()),
  autenticar: vi.fn(),
  exigir: vi.fn(async () => null),
  limiteBase: vi.fn(async () => null),
  auditar: vi.fn(async () => {}),
}))

vi.mock('../../lib/email.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/email.mts')>()),
  emailConfigured: vi.fn(() => true),
  broadcastEmail: vi.fn(async () => ({ sent: 4 })),
  sendEmailTo: vi.fn(async (r: string[]) => ({ sent: r.length })),
  teamEmails: vi.fn(async () => [] as string[]),
}))

// Destinatarios del Radar (AU-DEC-04): quien ve Licitaciones, más los admins
const VEN_RADAR = vi.hoisted(() => ['u-ana', 'u-admin'])
vi.mock('../../lib/push.mts', () => ({
  pushConfigured: vi.fn(() => true),
  broadcastPush: vi.fn(async () => ({ sent: 2, removed: 0 })),
  idsQueVenApp: vi.fn(async (): Promise<string[] | null> => VEN_RADAR),
}))


import { auditar, autenticar, exigir, limiteBase, type ContextoAuth, type FalloAuth } from '../../lib/autorizacion.mts'
import { broadcastEmail, sendEmailTo, teamEmails } from '../../lib/email.mts'
import { broadcastPush, idsQueVenApp } from '../../lib/push.mts'
import pushNotify from '../push-notify.mts'
import revisionSeguridad, {
  UMBRAL_LEADS_24H,
  UMBRAL_REVELACIONES_24H,
  config as configRevision,
  hallazgosDe,
  renderRevision,
  revelacionesPorUsuario,
  type ResumenSeguridad,
} from '../revision-seguridad.mts'

// ── Utilidades ──────────────────────────────────────────────────────────

const FALLO_401: FalloAuth = { status: 401, error: 'Sesión inválida', codigo: 'sesion_invalida' }
const FALLO_403: FalloAuth = { status: 403, error: 'Tu rol no tiene acceso a esta app.', codigo: 'sin_permiso' }
const FALLO_429: FalloAuth = { status: 429, error: 'Demasiadas solicitudes', codigo: 'tasa' }

function ctxDe(admin: unknown, parcial: Partial<ContextoAuth> = {}): ContextoAuth {
  return {
    admin: admin as SupabaseClient,
    userId: 'u-ana',
    email: 'ana@empresa.test',
    nombre: 'Ana',
    roles: ['comercial'],
    permisos: ['app_licitaciones'],
    esAdmin: false,
    aal: 'aal1',
    tieneFactor: false,
    ...parcial,
  }
}

function post(ruta: string, token?: string): Request {
  return new Request(`https://portal.test${ruta}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

// Cliente mínimo de push-notify: solo lee tender_notifications
function clienteNotificaciones(filas: unknown[]) {
  return {
    from: vi.fn(() => ({
      select: () => ({ gte: async () => ({ data: filas, error: null }) }),
    })),
  }
}

const RECIENTE = { title: 'Luminarias para colegio', country: 'Colombia', deadline: '2026-10-20', budget_usd: 1000 }

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://proyecto.supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-service-role')
  vi.stubEnv('URL', 'https://portal.test')
  vi.stubEnv('SYNC_INTERNAL_TOKEN', 'token-interno-dedicado')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// ── push-notify ─────────────────────────────────────────────────────────

describe('push-notify', () => {
  it('solo acepta POST', async () => {
    const res = await pushNotify(new Request('https://portal.test/api/push-notify'))
    expect(res.status).toBe(405)
    expect(autenticar).not.toHaveBeenCalled()
  })

  it('sin sesión válida responde el fallo del helper y no avisa', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ fallo: FALLO_401 })
    const res = await pushNotify(post('/api/push-notify', 'basura'))
    expect(res.status).toBe(401)
    expect(broadcastPush).not.toHaveBeenCalled()
    expect(broadcastEmail).not.toHaveBeenCalled()
  })

  it('exige ver Licitaciones: sin la app responde 403 sin gastar el cupo global', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([RECIENTE])) })
    vi.mocked(exigir).mockResolvedValueOnce(FALLO_403)
    const res = await pushNotify(post('/api/push-notify', 'jwt'))
    expect(res.status).toBe(403)
    expect(vi.mocked(exigir).mock.calls[0]?.[1]).toEqual({ modulo: 'licitaciones', apps: ['licitaciones'] })
    expect(limiteBase).not.toHaveBeenCalled()
    expect(broadcastPush).not.toHaveBeenCalled()
    expect(broadcastEmail).not.toHaveBeenCalled()
  })

  it('aplica el límite global compartido (6 cada 10 minutos)', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([RECIENTE])) })
    vi.mocked(limiteBase).mockResolvedValueOnce(FALLO_429)
    const res = await pushNotify(post('/api/push-notify', 'jwt'))
    expect(res.status).toBe(429)
    const [, clave, ventana, max] = vi.mocked(limiteBase).mock.calls[0] ?? []
    expect([clave, ventana, max]).toEqual(['push-notify:global', 600, 6])
    expect(broadcastPush).not.toHaveBeenCalled()
  })

  it('con permiso avisa, compone el texto en el servidor y audita los destinatarios', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([RECIENTE])) })
    const res = await pushNotify(post('/api/push-notify', 'jwt'))
    expect(res.status).toBe(200)
    expect(vi.mocked(autenticar).mock.calls[0]?.[0]).toBe('jwt')
    expect(vi.mocked(broadcastPush).mock.calls[0]?.[1]).toMatchObject({
      body: 'Nueva coincidencia: Luminarias para colegio',
      url: '/licitaciones',
    })
    expect(vi.mocked(auditar).mock.calls[0]?.[1]).toMatchObject({
      userId: 'u-ana',
      action: 'licitacion.avisar_equipo',
      detail: '1 coincidencia(s) · push a 2 · correo a 4',
    })
  })

  it('avisa solo a quien ve Licitaciones, más los admins (push y correo)', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([RECIENTE])) })
    await pushNotify(post('/api/push-notify', 'jwt'))
    expect(vi.mocked(idsQueVenApp).mock.calls[0]?.[1]).toBe('licitaciones')
    expect(vi.mocked(broadcastPush).mock.calls[0]?.[2]).toEqual({ userIds: VEN_RADAR })
    expect(vi.mocked(broadcastEmail).mock.calls[0]?.[2]).toEqual(VEN_RADAR)
  })

  it('sin destinatarios legibles responde 500, no avisa y no gasta el cupo global', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([RECIENTE])) })
    vi.mocked(idsQueVenApp).mockResolvedValueOnce(null)
    const res = await pushNotify(post('/api/push-notify', 'jwt'))
    expect(res.status).toBe(500)
    expect(limiteBase).not.toHaveBeenCalled()
    expect(broadcastPush).not.toHaveBeenCalled()
    expect(broadcastEmail).not.toHaveBeenCalled()
    expect(auditar).not.toHaveBeenCalled()
  })

  it('sin notificaciones recientes no avisa ni audita', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([])) })
    const res = await pushNotify(post('/api/push-notify', 'jwt'))
    expect(await res.json()).toMatchObject({ sent: 0 })
    expect(broadcastPush).not.toHaveBeenCalled()
    expect(auditar).not.toHaveBeenCalled()
  })

  it('una llamada sin novedades no gasta el cupo global del equipo', async () => {
    vi.mocked(autenticar).mockResolvedValueOnce({ ctx: ctxDe(clienteNotificaciones([])) })
    await pushNotify(post('/api/push-notify', 'jwt'))
    expect(limiteBase).not.toHaveBeenCalled()
  })
})

// ── revision-seguridad: parte pura ──────────────────────────────────────

const LIMPIO: ResumenSeguridad = {
  generado_at: '2026-09-30T12:00:00Z',
  admins: ['admin@empresa.test'],
  definer_ejecutables_anon: [],
  tablas_sin_rls: [],
  tablas_sin_exigir_mfa: [],
  storage_exigir_mfa: true,
  cambios_24h: {},
  leads_24h: 2,
}

describe('hallazgosDe', () => {
  it('un resumen limpio no genera avisos', () => {
    expect(hallazgosDe(LIMPIO)).toEqual([])
  })

  it('tolera claves ausentes o con tipos inesperados', () => {
    expect(hallazgosDe({})).toEqual([])
    expect(hallazgosDe({ tablas_sin_rls: 'x' as unknown as string[], leads_24h: '99' as unknown as number })).toEqual([])
  })

  it('detecta funciones definer ejecutables por anon', () => {
    const h = hallazgosDe({ ...LIMPIO, definer_ejecutables_anon: ['push_notification(uuid,uuid,text)'] })
    expect(h).toEqual([
      { titulo: 'Funciones security definer ejecutables por anon', items: ['push_notification(uuid,uuid,text)'] },
    ])
  })

  it('detecta tablas sin RLS y sin exigir_mfa, incluido el storage', () => {
    const h = hallazgosDe({ ...LIMPIO, tablas_sin_rls: ['leads'], tablas_sin_exigir_mfa: ['nueva'], storage_exigir_mfa: false })
    expect(h.map((x) => x.titulo)).toEqual(['Tablas sin RLS', 'Tablas sin la política exigir_mfa'])
    expect(h[1]?.items).toEqual(['nueva', 'storage.objects'])
  })

  it('lista los cambios de 24 h con nombre legible y la acción original', () => {
    const h = hallazgosDe({ ...LIMPIO, cambios_24h: { 'user_roles.insert': 1, 'roles.update': 2, 'connectors.delete': 0 } })
    expect(h).toEqual([
      {
        titulo: 'Cambios en las últimas 24 h',
        items: ['Roles · cambio (roles.update): 2', 'Asignaciones de rol · alta (user_roles.insert): 1'],
      },
    ])
  })

  it('revelar una clave de la bóveda (migración 69) no es un cambio que avise', () => {
    expect(hallazgosDe({ ...LIMPIO, cambios_24h: { 'credencial.revelar': 12 } })).toEqual([])
    const h = hallazgosDe({ ...LIMPIO, cambios_24h: { 'credencial.revelar': 3, 'portal_credentials.update': 1 } })
    expect(h[0]?.items).toEqual(['Bóveda de credenciales · cambio (portal_credentials.update): 1'])
  })

  it('guardar un secreto de la bóveda avisa aunque auditar_cambio no deje fila (rotación en Vault)', () => {
    expect(hallazgosDe({ ...LIMPIO, cambios_24h: { 'credencial.guardar': 1 } })).toEqual([
      {
        titulo: 'Cambios en las últimas 24 h',
        items: ['Bóveda de credenciales · secreto guardado o quitado (credencial.guardar): 1'],
      },
    ])
    const h = hallazgosDe({
      ...LIMPIO,
      cambios_24h: { 'credencial.revelar': 5, 'portal_credentials.update': 1, 'credencial.guardar': 2 },
    })
    expect(h[0]?.items).toEqual([
      'Bóveda de credenciales · secreto guardado o quitado (credencial.guardar): 2',
      'Bóveda de credenciales · cambio (portal_credentials.update): 1',
    ])
  })

  it('una cuenta de servicio con rol admin es un hallazgo', () => {
    expect(hallazgosDe({ ...LIMPIO, admins: ['admin@empresa.test', 'Claude-Dev@empresa.test'] })).toEqual([
      { titulo: 'Cuentas de servicio con rol admin', items: ['Claude-Dev@empresa.test'] },
    ])
  })

  it('las claves reveladas por una misma persona avisan desde el umbral (AU-DEC-04)', () => {
    expect(UMBRAL_REVELACIONES_24H).toBe(20)
    expect(hallazgosDe(LIMPIO, [{ usuario: 'ana@empresa.test', n: 19 }])).toEqual([])
    expect(
      hallazgosDe(LIMPIO, [
        { usuario: 'ana@empresa.test', n: 20 },
        { usuario: 'luis@empresa.test', n: 3 },
        { usuario: 'eva@empresa.test', n: 45 },
      ]),
    ).toEqual([
      {
        titulo: 'Claves reveladas en 24 h por una misma persona',
        items: ['eva@empresa.test: 45 (el umbral es 20)', 'ana@empresa.test: 20 (el umbral es 20)'],
      },
    ])
  })

  it('los leads solo avisan desde el umbral', () => {
    expect(hallazgosDe({ ...LIMPIO, leads_24h: UMBRAL_LEADS_24H - 1 })).toEqual([])
    expect(hallazgosDe({ ...LIMPIO, leads_24h: UMBRAL_LEADS_24H })[0]?.titulo).toBe('Leads del sitio en las últimas 24 h')
  })
})

describe('renderRevision', () => {
  it('escapa todo lo que viene de la base', () => {
    const malicioso = '<img src=x onerror=alert(1)>'
    const c = renderRevision([{ titulo: 'Tablas sin RLS', items: [malicioso] }], { ...LIMPIO, admins: [malicioso] }, 'https://portal.test')
    expect(c.html).not.toContain(malicioso)
    expect(c.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(c.html).toContain('href="https://portal.test/admin"')
    expect(c.subject).toBe('Revisión de seguridad: 1 punto para revisar')
    expect(c.text).toContain('  • <img src=x onerror=alert(1)>')
  })

  it('las claves reveladas van como contexto', () => {
    const hallazgo = [{ titulo: 'Tablas sin RLS', items: ['leads'] }]
    const con = renderRevision(hallazgo, { ...LIMPIO, cambios_24h: { 'credencial.revelar': 7 } }, 'https://portal.test')
    expect(con.text).toContain('Claves reveladas en 24 h: 7')
    expect(renderRevision(hallazgo, LIMPIO, 'https://portal.test').text).not.toContain('Claves reveladas')
  })
})

// ── revision-seguridad: función programada ──────────────────────────────

type OpcionesRevision = {
  rpc: { data: unknown; error: { code?: string; message: string } | null }
  admins?: string[]
  usuarios?: { id: string; email: string }[]
  // Filas de audit_log ('credencial.revelar') que devuelve cada página
  revelaciones?: { user_id: string | null }[]
  errorAuditoria?: { code: string }
}

// Consulta de audit_log encadenable: registra filtros y rango
function consultaAuditoria(o: OpcionesRevision, registro: Record<string, unknown>[]) {
  const filtros: Record<string, unknown> = {}
  const q = {
    select: (columnas: string) => ((filtros.select = columnas), q),
    eq: (col: string, val: unknown) => ((filtros[col] = val), q),
    gt: (col: string, val: unknown) => ((filtros[`${col}>`] = val), q),
    order: (col: string) => ((filtros.order = col), q),
    range: async (desde: number, hasta: number) => {
      registro.push({ ...filtros, desde, hasta })
      if (o.errorAuditoria) return { data: null, error: o.errorAuditoria }
      return { data: (o.revelaciones ?? []).slice(desde, hasta + 1), error: null }
    },
  }
  return q
}

function clienteRevision(o: OpcionesRevision) {
  const avisos: unknown[] = []
  const auditoria: Record<string, unknown>[] = []
  const cliente = {
    rpc: vi.fn(async (nombre: string) => (nombre === 'modulos_consumo' ? { data: { miembros: 1 }, error: null } : o.rpc)),
    from: vi.fn((tabla: string) => {
      if (tabla === 'audit_log') return consultaAuditoria(o, auditoria)
      if (tabla === 'modulos_instalacion') {
        return { select: async () => ({ data: [{ slug: 'nucleo', activo: true, limites: { miembros: 10 } }], error: null }) }
      }
      if (tabla === 'user_roles') {
        return { select: () => ({ eq: async () => ({ data: (o.admins ?? []).map((user_id) => ({ user_id })), error: null }) }) }
      }
      if (tabla === 'user_notifications') {
        return {
          insert: async (filas: unknown[]) => {
            avisos.push(...filas)
            return { error: null }
          },
        }
      }
      throw new Error('tabla inesperada: ' + tabla)
    }),
    auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: o.usuarios ?? [] }, error: null })) } },
  }
  estado.cliente = cliente
  return { cliente, avisos, auditoria }
}

describe('revision-seguridad', () => {
  it('corre a diario a las 12:00 UTC', () => {
    expect(configRevision.schedule).toBe('0 12 * * *')
  })

  it('sin la migración 64 falla suave: no avisa a nadie', async () => {
    const { avisos } = clienteRevision({ rpc: { data: null, error: { code: 'PGRST202', message: 'no existe' } } })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ omitida: 'falta la migración 64' })
    expect(String(aviso.mock.calls[0]?.[0])).toContain('migración 64')
    expect(sendEmailTo).not.toHaveBeenCalled()
    expect(avisos).toEqual([])
  })

  it('otro error de la base responde 500 sin avisar', async () => {
    clienteRevision({ rpc: { data: null, error: { code: '57014', message: 'timeout' } } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(res.status).toBe(500)
    expect(sendEmailTo).not.toHaveBeenCalled()
  })

  it('sin novedades no envía nada', async () => {
    const { avisos } = clienteRevision({ rpc: { data: LIMPIO, error: null }, admins: ['u-admin'] })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(await res.json()).toEqual({ hallazgos: 0 })
    expect(sendEmailTo).not.toHaveBeenCalled()
    expect(teamEmails).not.toHaveBeenCalled()
    expect(avisos).toEqual([])
  })

  it('con hallazgos avisa solo a los administradores, sin cuentas de servicio', async () => {
    const { avisos } = clienteRevision({
      rpc: { data: { ...LIMPIO, tablas_sin_rls: ['leads'] }, error: null },
      admins: ['u-admin', 'u-dev'],
      usuarios: [
        { id: 'u-admin', email: 'admin@empresa.test' },
        { id: 'u-dev', email: 'claude-dev@empresa.test' },
        { id: 'u-ana', email: 'ana@empresa.test' },
      ],
    })
    // teamEmails es quien excluye las cuentas de servicio
    vi.mocked(teamEmails).mockResolvedValueOnce(['admin@empresa.test'])
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await revisionSeguridad()
    expect(await res.json()).toEqual({ hallazgos: 1, enPortal: 1, email: 1 })
    expect(vi.mocked(teamEmails).mock.calls[0]?.[1]).toEqual(['u-admin', 'u-dev'])

    const [destinatarios, contenido, remitente] = vi.mocked(sendEmailTo).mock.calls[0] ?? []
    expect(destinatarios).toEqual(['admin@empresa.test'])
    expect(remitente).toBe('Seguridad — TailorSuite')
    expect(contenido?.subject).toBe('Revisión de seguridad: 1 punto para revisar')

    expect(avisos).toEqual([
      {
        user_id: 'u-admin',
        kind: 'sistema',
        title: 'Revisión de seguridad: 1 punto para revisar',
        body: 'Tablas sin RLS (1)',
        link: '/admin',
      },
    ])
  })

  it('el correo va a los administradores en el To, sin copia al buzón compartido', async () => {
    clienteRevision({
      rpc: { data: { ...LIMPIO, tablas_sin_rls: ['leads'] }, error: null },
      admins: ['u-admin'],
      usuarios: [{ id: 'u-admin', email: 'admin@empresa.test' }],
    })
    vi.mocked(teamEmails).mockResolvedValueOnce(['admin@empresa.test'])
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await revisionSeguridad()
    expect(vi.mocked(sendEmailTo).mock.calls[0]?.[3]).toEqual({ visibleTo: true })
  })

  it('cuenta las claves reveladas por persona en audit_log, paginando, y avisa desde el umbral', async () => {
    const filas = [
      ...Array.from({ length: 1500 }, () => ({ user_id: 'u-ana' })),
      ...Array.from({ length: 5 }, () => ({ user_id: 'u-luis' })),
    ]
    const { cliente, auditoria } = clienteRevision({
      rpc: { data: LIMPIO, error: null },
      revelaciones: filas,
      usuarios: [{ id: 'u-ana', email: 'ana@empresa.test' }],
    })
    const ahora = new Date('2026-10-04T12:00:00Z')
    const r = await revelacionesPorUsuario(cliente as unknown as SupabaseClient, ahora)
    expect(r).toEqual([
      { usuario: 'ana@empresa.test', n: 1500 },
      { usuario: 'u-luis', n: 5 },
    ])
    expect(auditoria).toEqual([
      { select: 'user_id', action: 'credencial.revelar', origen: 'base', 'created_at>': '2026-10-03T12:00:00.000Z', order: 'id', desde: 0, hasta: 999 },
      { select: 'user_id', action: 'credencial.revelar', origen: 'base', 'created_at>': '2026-10-03T12:00:00.000Z', order: 'id', desde: 1000, hasta: 1999 },
    ])
  })

  it('una revelación masiva avisa aunque el resumen esté limpio', async () => {
    const { avisos } = clienteRevision({
      rpc: { data: LIMPIO, error: null },
      admins: ['u-admin'],
      usuarios: [
        { id: 'u-admin', email: 'admin@empresa.test' },
        { id: 'u-ana', email: 'ana@empresa.test' },
      ],
      revelaciones: Array.from({ length: UMBRAL_REVELACIONES_24H }, () => ({ user_id: 'u-ana' })),
    })
    vi.mocked(teamEmails).mockResolvedValueOnce(['admin@empresa.test'])
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(await res.json()).toEqual({ hallazgos: 1, enPortal: 1, email: 1 })
    expect(vi.mocked(sendEmailTo).mock.calls[0]?.[1]?.text).toContain('ana@empresa.test: 20 (el umbral es 20)')
    expect(avisos).toHaveLength(1)
  })

  it('si no se puede leer audit_log, la revisión sigue con el resto', async () => {
    const { avisos } = clienteRevision({ rpc: { data: LIMPIO, error: null }, errorAuditoria: { code: '42501' } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(await res.json()).toEqual({ hallazgos: 0 })
    expect(avisos).toEqual([])
    expect(error).toHaveBeenCalledWith(expect.stringContaining('claves reveladas'), { codigo: '42501' })
  })

  it('con hallazgos y ningún aviso entregado responde 500 y lo registra', async () => {
    const { avisos } = clienteRevision({ rpc: { data: { ...LIMPIO, tablas_sin_rls: ['leads'] }, error: null } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await revisionSeguridad()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ hallazgos: 1, enPortal: 0, email: 0 })
    expect(avisos).toEqual([])
    expect(error.mock.calls.some((c) => String(c[0]).startsWith('revision-seguridad'))).toBe(true)
  })
})

// ── Higiene de logs: ni cuerpos de terceros ni objetos de error ─────────

// seguridad.md: en el log no van cuerpos de correo ni de HubSpot o Google,
// ni objetos de error de IMAP o SMTP. Se usa resumenError o categoriaError
// (netlify/lib/errores.mts). Se lee el código como texto, como la CSP.
describe('higiene de logs', () => {
  const carpeta = (ruta: string) => fileURLToPath(new URL(`../../../${ruta}/`, import.meta.url))
  const fuentes = ['netlify/functions', 'netlify/lib'].flatMap((dir) =>
    readdirSync(carpeta(dir))
      .filter((f) => /\.m?ts$/.test(f))
      .map((f) => ({ ruta: `${dir}/${f}`, texto: readFileSync(carpeta(dir) + f, 'utf8') })),
  )
  const lineasCon = (patron: RegExp) =>
    fuentes.flatMap(({ ruta, texto }) =>
      texto.split(/\r?\n/).flatMap((l, i) => (patron.test(l) ? [`${ruta}:${i + 1}: ${l.trim()}`] : [])),
    )

  it('lee las funciones y la librería', () => {
    expect(fuentes.map((f) => f.ruta)).toEqual(
      expect.arrayContaining(['netlify/functions/push-notify.mts', 'netlify/lib/errores.mts']),
    )
  })

  it('ningún console.* recibe el objeto de error crudo', () => {
    expect(lineasCon(/console\.(error|warn|log)\([^\n]*,\s*(err|error|e)\)/)).toEqual([])
  })

  it('ningún console.* lleva el cuerpo de una respuesta ni responseText', () => {
    expect(lineasCon(/console\.[a-z]+\([^\n]*\.text\(\)/)).toEqual([])
    expect(lineasCon(/console\.[a-z]+\([^\n]*responseText/)).toEqual([])
  })

  it('todo 403 propio deja «[seguridad] denegado» en el log', () => {
    const sinPrefijo = fuentes.flatMap(({ ruta, texto }) => {
      const lineas = texto.split(/\r?\n/)
      return lineas.flatMap((l, i) => {
        if (!/status: 403|json\(403/.test(l)) return []
        const ventana = lineas.slice(Math.max(0, i - 12), i + 2).join('\n')
        return /\[seguridad\] denegado|denegado\(/.test(ventana) ? [] : [`${ruta}:${i + 1}: ${l.trim()}`]
      })
    })
    expect(sinPrefijo).toEqual([])
  })
})

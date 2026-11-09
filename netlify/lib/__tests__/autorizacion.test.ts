import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'

// createClient se sustituye para probar los caminos que crean su propio
// cliente service role (mail-auth y limiteBase sin contexto).
const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(() => estado.cliente),
}))

import { PERMISOS_SOLO_ADMIN as SOLO_ADMIN_SHELL } from '../../../src/types.ts'
import {
  PERMISOS_SOLO_ADMIN,
  auditar,
  autenticar,
  cumpleRequisitos,
  decodificarClaims,
  evaluarMfa,
  exigir,
  limiteBase,
  limiteMemoria,
  puedeVerApp,
  respuesta,
  respuestaV1,
  tokenDeCabecera,
  type ContextoAuth,
} from '../autorizacion.mts'
import { reiniciarCacheModulos } from '../modulos-instalacion.mts'

// ── Utilidades ──────────────────────────────────────────────────────────

function jwt(claims: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.firma`
}

// IDs distintos por prueba: el límite en memoria es del módulo
let secuencia = 0
const nuevoId = () => `00000000-0000-4000-8000-${String(++secuencia).padStart(12, '0')}`

type Perfil = {
  full_name?: string | null
  user_roles?: { role: string; roles: { permissions?: string[] | null } | null }[] | null
}

type OpcionesFalso = {
  usuario?: { id: string; email?: string; factors?: { status: string }[] } | null
  getUser?: () => Promise<unknown>
  perfil?: Perfil | null
  errorPerfil?: { code: string; message: string }
  modulos?: { slug: string; activo: boolean; limites?: Record<string, unknown> }[]
  errorModulos?: boolean
  rpc?: { data: unknown; error: unknown } | Error
  errorInsert?: { code: string } | Error
}

const PERFIL_BASE: Perfil = {
  full_name: 'Ana Prueba',
  user_roles: [
    { role: 'comercial', roles: { permissions: ['edit_crm', 'app_licitaciones'] } },
    { role: 'proyectos', roles: { permissions: ['edit_projects', 'edit_crm'] } },
  ],
}

function clienteFalso(o: OpcionesFalso = {}) {
  const inserts: unknown[] = []
  // Argumentos de select() y eq() por tabla, para afirmar qué se leyó
  const selects: [string, string][] = []
  const eqs: [string, string, unknown][] = []
  const getUser = vi.fn<() => Promise<unknown>>(
    o.getUser ??
      (async () =>
        o.usuario
          ? { data: { user: o.usuario }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } }),
  )
  const from = vi.fn((tabla: string) => {
    if (tabla === 'profiles') {
      return {
        select: (columnas: string) => {
          selects.push([tabla, columnas])
          return {
            eq: (columna: string, valor: unknown) => {
              eqs.push([tabla, columna, valor])
              return {
                single: async () => {
                  if (o.errorPerfil) return { data: null, error: o.errorPerfil }
                  if (o.perfil === null) {
                    return { data: null, error: { code: 'PGRST116', message: 'sin filas' } }
                  }
                  return { data: o.perfil ?? PERFIL_BASE, error: null }
                },
              }
            },
          }
        },
      }
    }
    if (tabla === 'modulos_instalacion') {
      return {
        select: async (columnas: string) => {
          selects.push([tabla, columnas])
          return o.errorModulos
            ? { data: null, error: { code: 'XX000', message: 'caída' } }
            : { data: o.modulos ?? [], error: null }
        },
      }
    }
    if (tabla === 'audit_log') {
      return {
        insert: async (fila: unknown) => {
          if (o.errorInsert instanceof Error) throw o.errorInsert
          inserts.push(fila)
          return { error: o.errorInsert ?? null }
        },
      }
    }
    throw new Error('tabla inesperada: ' + tabla)
  })
  const rpc = vi.fn(async (_nombre: string, _args: unknown) => {
    if (o.rpc instanceof Error) throw o.rpc
    return o.rpc ?? { data: false, error: null }
  })
  const cliente = { auth: { getUser }, from, rpc } as unknown as SupabaseClient
  return { cliente, getUser, from, rpc, inserts, selects, eqs }
}

function ctxDe(cliente: SupabaseClient, parcial: Partial<ContextoAuth> = {}): ContextoAuth {
  return {
    admin: cliente,
    userId: nuevoId(),
    email: 'ana@empresa.test',
    nombre: 'Ana Prueba',
    roles: ['comercial'],
    permisos: ['edit_crm', 'app_licitaciones'],
    esAdmin: false,
    aal: 'aal1',
    tieneFactor: false,
    ...parcial,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ── Parte pura ──────────────────────────────────────────────────────────

// La sincronía con permisos_solo_admin() del SQL la vigila
// src/lib/__tests__/permisos.test.ts; aquí, la de las dos copias en TS.
describe('PERMISOS_SOLO_ADMIN', () => {
  it('es la misma lista que src/types.ts', () => {
    expect([...PERMISOS_SOLO_ADMIN]).toEqual([...SOLO_ADMIN_SHELL])
  })
})

describe('tokenDeCabecera', () => {
  it('quita el prefijo Bearer sin importar mayúsculas ni espacios', () => {
    expect(tokenDeCabecera('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(tokenDeCabecera('bearer   abc')).toBe('abc')
  })

  it('sin cabecera o con Bearer vacío no hay token', () => {
    expect(tokenDeCabecera(null)).toBeNull()
    expect(tokenDeCabecera(undefined)).toBeNull()
    expect(tokenDeCabecera('Bearer ')).toBeNull()
  })
})

describe('decodificarClaims', () => {
  it('lee el payload de un token válido', () => {
    const claims = decodificarClaims(jwt({ sub: 'u1', aal: 'aal2' }))
    expect(claims).toEqual({ sub: 'u1', aal: 'aal2' })
  })

  it('un token con 2 segmentos no es un JWT', () => {
    expect(decodificarClaims('abc.def')).toBeNull()
  })

  it('base64 o JSON inválido devuelve null sin lanzar', () => {
    expect(decodificarClaims('abc.@@@!!!.firma')).toBeNull()
    expect(decodificarClaims('abc..firma')).toBeNull()
  })

  it('un payload que no es objeto no cuenta como claims', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    expect(decodificarClaims(`h.${b64([1, 2])}.f`)).toBeNull()
    expect(decodificarClaims(`h.${b64(42)}.f`)).toBeNull()
    expect(decodificarClaims(`h.${b64(null)}.f`)).toBeNull()
  })
})

describe('evaluarMfa (matriz 2×2)', () => {
  // [tieneFactor, aal, resultado esperado]
  const casos: [boolean, 'aal1' | 'aal2', 'pasa' | 'mfa_requerida'][] = [
    [false, 'aal1', 'pasa'],
    [false, 'aal2', 'pasa'],
    [true, 'aal1', 'mfa_requerida'],
    [true, 'aal2', 'pasa'],
  ]
  it.each(casos)('factor=%s, %s → %s', (tieneFactor, aal, esperado) => {
    const r = evaluarMfa({ tieneFactor, aal })
    if (esperado === 'pasa') expect(r).toBeNull()
    else expect(r).toMatchObject({ status: 401, codigo: 'mfa_requerida' })
  })
})

describe('puedeVerApp (regla v2: módulo activo y app_<slug>)', () => {
  const activos = ['nucleo', 'licitaciones', 'ia']

  it('módulo activo: lo ve quien tiene app_<slug> y el admin', () => {
    expect(puedeVerApp(activos, 'licitaciones', ['x'], ['app_licitaciones'])).toBe(true)
    expect(puedeVerApp(activos, 'licitaciones', ['x'], ['edit_crm'])).toBe(false)
    expect(puedeVerApp(activos, 'licitaciones', ['admin'], [])).toBe(true)
    expect(puedeVerApp(activos, 'licitaciones', null, null)).toBe(false)
  })

  it('un módulo sin app_<slug> (ia) lo ve cualquier miembro', () => {
    expect(puedeVerApp(activos, 'ia', [], [])).toBe(true)
  })

  it('inactivo, planeado o desconocido: nadie, ni el admin', () => {
    expect(puedeVerApp(activos, 'directorio', ['admin'], ['app_directorio'])).toBe(false)
    expect(puedeVerApp([...activos, 'inventario'], 'inventario', ['admin'], [])).toBe(false)
    expect(puedeVerApp(activos, 'fantasma', ['admin'], ['app_fantasma'])).toBe(false)
  })
})

describe('cumpleRequisitos', () => {
  const miembro = { roles: ['comercial'], permisos: ['edit_crm', 'app_licitaciones'], esAdmin: false }
  const activos = ['nucleo', 'directorio', 'licitaciones']

  it('sin requisitos basta estar autenticado', () => {
    expect(cumpleRequisitos(miembro, {})).toBe(true)
    expect(cumpleRequisitos(miembro, { permiso: [], apps: [] })).toBe(true)
  })

  it('permiso simple', () => {
    expect(cumpleRequisitos(miembro, { permiso: 'edit_crm' })).toBe(true)
    expect(cumpleRequisitos(miembro, { permiso: 'view_billing' })).toBe(false)
  })

  it('lista de permisos: basta uno', () => {
    expect(cumpleRequisitos(miembro, { permiso: ['view_billing', 'edit_crm'] })).toBe(true)
    expect(cumpleRequisitos(miembro, { permiso: ['view_billing', 'manage_blog'] })).toBe(false)
  })

  it('apps: basta ver una', () => {
    expect(cumpleRequisitos(miembro, { apps: ['directorio', 'licitaciones'] }, activos)).toBe(true)
    expect(cumpleRequisitos(miembro, { apps: ['directorio'] }, activos)).toBe(false)
  })

  it('permiso y apps juntos se exigen ambos', () => {
    expect(cumpleRequisitos(miembro, { permiso: 'edit_crm', apps: ['directorio'] }, activos)).toBe(false)
    expect(cumpleRequisitos(miembro, { permiso: 'edit_crm', apps: ['licitaciones'] }, activos)).toBe(true)
    expect(cumpleRequisitos(miembro, { permiso: 'view_billing', apps: ['licitaciones'] }, activos)).toBe(false)
  })

  it('soloAdmin rechaza a quien no es admin', () => {
    expect(cumpleRequisitos({ ...miembro, permisos: ['manage_roles'] }, { soloAdmin: true })).toBe(false)
  })

  it('el admin pasa todo', () => {
    const admin = { roles: ['admin'], permisos: [], esAdmin: true }
    expect(cumpleRequisitos(admin, { soloAdmin: true, permiso: 'x', apps: ['fantasma'] }, [])).toBe(true)
  })
})

describe('limiteMemoria', () => {
  it('cuenta dentro de la ventana y reinicia al vencer', () => {
    vi.useFakeTimers()
    const memoria = new Map<string, { count: number; reset: number }>()
    expect(limiteMemoria('k', 2, 1000, memoria)).toBe(false)
    expect(limiteMemoria('k', 2, 1000, memoria)).toBe(false)
    expect(limiteMemoria('k', 2, 1000, memoria)).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(limiteMemoria('k', 2, 1000, memoria)).toBe(false)
  })

  it('las claves son independientes', () => {
    const memoria = new Map<string, { count: number; reset: number }>()
    expect(limiteMemoria('a', 1, 60_000, memoria)).toBe(false)
    expect(limiteMemoria('a', 1, 60_000, memoria)).toBe(true)
    expect(limiteMemoria('b', 1, 60_000, memoria)).toBe(false)
  })

  it('purga las ventanas vencidas cuando el mapa pasa de 500', () => {
    vi.useFakeTimers()
    const memoria = new Map<string, { count: number; reset: number }>()
    limiteMemoria('viva', 5, 10_000, memoria)
    for (let i = 0; i < 501; i++) limiteMemoria('vieja-' + i, 5, 1000, memoria)
    expect(memoria.size).toBe(502)
    vi.advanceTimersByTime(2000)
    limiteMemoria('nueva', 5, 1000, memoria)
    expect(memoria.size).toBe(2)
    expect(memoria.has('viva')).toBe(true)
    expect(memoria.has('nueva')).toBe(true)
  })
})

describe('respuesta y respuestaV1', () => {
  const fallo = { status: 401, error: 'Sesión inválida', codigo: 'sesion_invalida' as const }

  it('v2 devuelve un Response JSON con el código', async () => {
    const r = respuesta(fallo)
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'Sesión inválida', codigo: 'sesion_invalida' })
  })

  it('v1 devuelve la forma del Handler', () => {
    const r = respuestaV1(fallo)
    expect(r.statusCode).toBe(401)
    expect(r.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(r.body)).toEqual({ error: 'Sesión inválida', codigo: 'sesion_invalida' })
  })
})

// ── autenticar con cliente falso ────────────────────────────────────────

describe('autenticar', () => {
  it('sin token → 401 no_autenticado, sin llamar a Auth', async () => {
    const f = clienteFalso()
    const r = await autenticar(null, { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 401, codigo: 'no_autenticado', error: 'No autenticado' })
    expect(f.getUser).not.toHaveBeenCalled()
  })

  it('un token que no es JWT → 401 sesion_invalida, sin llamar a Auth', async () => {
    const f = clienteFalso()
    const r = await autenticar('no-es-un-jwt', { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 401, codigo: 'sesion_invalida' })
    expect(f.getUser).not.toHaveBeenCalled()
  })

  it('getUser con error → 401 sesion_invalida', async () => {
    const f = clienteFalso({ usuario: null })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 401, codigo: 'sesion_invalida', error: 'Sesión inválida' })
  })

  it('sin perfil → 403', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId() }, perfil: null })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 403, error: 'Usuario sin perfil en el portal' })
  })

  it('fallo de la consulta de perfil → 500, no 403', async () => {
    const f = clienteFalso({
      usuario: { id: nuevoId() },
      errorPerfil: { code: '57014', message: 'timeout' },
    })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 500, codigo: 'error_base' })
  })

  it('con factor verificado y aal1 → 401 mfa_requerida, sin leer el perfil', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId(), factors: [{ status: 'verified' }] } })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 401, codigo: 'mfa_requerida' })
    expect(f.from).not.toHaveBeenCalled()
  })

  it('con factor verificado y sin claim aal se trata como aal1', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId(), factors: [{ status: 'verified' }] } })
    const r = await autenticar(jwt({ sub: 'x' }), { cliente: f.cliente })
    expect(r.fallo?.codigo).toBe('mfa_requerida')
  })

  it('con factor verificado y aal2 pasa', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId(), factors: [{ status: 'verified' }] } })
    const r = await autenticar(jwt({ aal: 'aal2' }), { cliente: f.cliente })
    expect(r.fallo).toBeUndefined()
    expect(r.ctx).toMatchObject({ aal: 'aal2', tieneFactor: true })
  })

  it('un factor sin verificar no exige MFA', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId(), factors: [{ status: 'unverified' }] } })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.ctx).toMatchObject({ aal: 'aal1', tieneFactor: false })
  })

  it('arma el contexto: roles, unión de permisos sin duplicados, nombre y correo', async () => {
    const id = nuevoId()
    const f = clienteFalso({ usuario: { id, email: 'ana@empresa.test' } })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    if (r.fallo) throw new Error('no debía fallar')
    expect(r.ctx.userId).toBe(id)
    expect(r.ctx.email).toBe('ana@empresa.test')
    expect(r.ctx.nombre).toBe('Ana Prueba')
    expect(r.ctx.roles).toEqual(['comercial', 'proyectos'])
    expect([...r.ctx.permisos].sort()).toEqual(['app_licitaciones', 'edit_crm', 'edit_projects'])
    expect(r.ctx.esAdmin).toBe(false)
    expect(r.ctx.admin).toBe(f.cliente)
    // Lee el perfil del usuario que validó Auth, con roles y permisos
    expect(f.selects).toEqual([['profiles', 'full_name, user_roles ( role, roles ( permissions ) )']])
    expect(f.eqs).toEqual([['profiles', 'id', id]])
  })

  it('esAdmin sale del rol admin', async () => {
    const f = clienteFalso({
      usuario: { id: nuevoId() },
      perfil: { full_name: null, user_roles: [{ role: 'admin', roles: { permissions: [] } }] },
    })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.ctx).toMatchObject({ esAdmin: true, nombre: null })
  })

  it('supera maxPorMinuto → 429 tasa', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId() } })
    const token = jwt({ aal: 'aal1' })
    expect((await autenticar(token, { cliente: f.cliente, maxPorMinuto: 2 })).ctx).toBeDefined()
    expect((await autenticar(token, { cliente: f.cliente, maxPorMinuto: 2 })).ctx).toBeDefined()
    const r = await autenticar(token, { cliente: f.cliente, maxPorMinuto: 2 })
    expect(r.fallo).toMatchObject({ status: 429, codigo: 'tasa' })
  })

  it('Auth colgado: reintenta una vez y responde 503 auth_lento', async () => {
    vi.useFakeTimers()
    const f = clienteFalso({ getUser: () => new Promise(() => {}) })
    const p = autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    await vi.advanceTimersByTimeAsync(12_000)
    const r = await p
    expect(r.fallo).toMatchObject({ status: 503, codigo: 'auth_lento' })
    expect(f.getUser).toHaveBeenCalledTimes(2)
  })

  it('Auth colgado una sola vez: el reintento pasa', async () => {
    vi.useFakeTimers()
    const f = clienteFalso({ usuario: { id: nuevoId() } })
    f.getUser.mockImplementationOnce(() => new Promise(() => {}))
    const p = autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    await vi.advanceTimersByTimeAsync(6_000)
    const r = await p
    expect(r.ctx).toBeDefined()
    expect(f.getUser).toHaveBeenCalledTimes(2)
  })

  // auth-js no lanza ante la red ni ante un 5xx: los devuelve como error
  it('Auth sin red (error devuelto, no lanzado): reintenta y responde 503 auth_lento', async () => {
    const f = clienteFalso({
      getUser: async () => ({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) }),
    })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 503, codigo: 'auth_lento' })
    expect(f.getUser).toHaveBeenCalledTimes(2)
  })

  it('Auth responde 503 una sola vez: el reintento pasa', async () => {
    const f = clienteFalso({ usuario: { id: nuevoId() } })
    f.getUser.mockImplementationOnce(async () => ({
      data: { user: null },
      error: new AuthApiError('Service Unavailable', 503, undefined),
    }))
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.ctx).toBeDefined()
    expect(f.getUser).toHaveBeenCalledTimes(2)
  })

  it('un 4xx de Auth (sesión cerrada) → 401 sesion_invalida sin reintento', async () => {
    const f = clienteFalso({
      getUser: async () => ({
        data: { user: null },
        error: new AuthApiError('Session from session_id claim in JWT does not exist', 403, 'session_not_found'),
      }),
    })
    const r = await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente })
    expect(r.fallo).toMatchObject({ status: 401, codigo: 'sesion_invalida' })
    expect(f.getUser).toHaveBeenCalledTimes(1)
  })

  it('sin cliente ni variables de entorno → 500 config', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const r = await autenticar(jwt({ aal: 'aal1' }))
    expect(r.fallo).toMatchObject({ status: 500, codigo: 'config' })
  })

  it('registra la denegación sin datos personales', async () => {
    const id = nuevoId()
    const f = clienteFalso({
      usuario: { id, email: 'ana@empresa.test', factors: [{ status: 'verified' }] },
    })
    await autenticar(jwt({ aal: 'aal1' }), { cliente: f.cliente, accion: 'list-contacts' })
    expect(console.warn).toHaveBeenCalledWith('[seguridad] denegado', {
      codigo: 'mfa_requerida',
      userId: id,
      accion: 'list-contacts',
    })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('ana@')
  })
})

// ── exigir ──────────────────────────────────────────────────────────────

describe('exigir', () => {
  beforeEach(() => reiniciarCacheModulos())

  const modulos = [
    { slug: 'nucleo', activo: true },
    { slug: 'directorio', activo: true },
    { slug: 'licitaciones', activo: true },
    { slug: 'calendario', activo: false },
  ]

  it('sin requisitos pasa y no lee los módulos', async () => {
    const f = clienteFalso({ modulos })
    expect(await exigir(ctxDe(f.cliente), {})).toBeNull()
    expect(f.from).not.toHaveBeenCalled()
  })

  it('permiso faltante → 403 sin_permiso', async () => {
    const f = clienteFalso()
    const r = await exigir(ctxDe(f.cliente), { permiso: 'view_billing' }, 'list-invoices')
    expect(r).toMatchObject({ status: 403, codigo: 'sin_permiso' })
  })

  it('soloAdmin → 403 sin leer los módulos', async () => {
    const f = clienteFalso({ modulos })
    const r = await exigir(ctxDe(f.cliente), { soloAdmin: true, apps: ['licitaciones'] })
    expect(r).toMatchObject({ status: 403, codigo: 'sin_permiso' })
    expect(f.from).not.toHaveBeenCalled()
  })

  it('apps: lee modulos_instalacion y aplica puedeVerApp', async () => {
    const f = clienteFalso({ modulos })
    expect(await exigir(ctxDe(f.cliente), { apps: ['directorio', 'licitaciones'] })).toBeNull()
    expect(f.selects).toEqual([['modulos_instalacion', 'slug, activo, limites']])
    const r = await exigir(ctxDe(f.cliente), { apps: ['directorio'] })
    expect(r).toMatchObject({ status: 403, codigo: 'sin_permiso' })
  })

  it('los módulos se cachean 60 s', async () => {
    vi.useFakeTimers({ now: Date.UTC(2020, 0, 1) })
    const f = clienteFalso({ modulos })
    await exigir(ctxDe(f.cliente), { apps: ['licitaciones'] })
    await exigir(ctxDe(f.cliente), { apps: ['licitaciones'] })
    expect(f.from).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(61_000)
    await exigir(ctxDe(f.cliente), { apps: ['licitaciones'] })
    expect(f.from).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('el admin no necesita leer los módulos para apps', async () => {
    const f = clienteFalso({ modulos })
    const ctx = ctxDe(f.cliente, { roles: ['admin'], esAdmin: true, permisos: [] })
    expect(await exigir(ctx, { apps: ['fantasma'], permiso: 'view_billing' })).toBeNull()
    expect(f.from).not.toHaveBeenCalled()
  })

  it('si no se pueden leer los módulos se deniega (500), nunca se abre', async () => {
    const f = clienteFalso({ errorModulos: true })
    const r = await exigir(ctxDe(f.cliente), { apps: ['licitaciones'] })
    expect(r).toMatchObject({ status: 500, codigo: 'error_base' })
  })
})

describe('exigir con modulo', () => {
  beforeEach(() => reiniciarCacheModulos())
  const modulos = [
    { slug: 'nucleo', activo: true },
    { slug: 'licitaciones', activo: true },
    { slug: 'calendario', activo: false },
  ]

  it('módulo activo pasa al resto de requisitos', async () => {
    const f = clienteFalso({ modulos })
    expect(await exigir(ctxDe(f.cliente), { modulo: 'licitaciones' })).toBeNull()
    expect(await exigir(ctxDe(f.cliente), { modulo: 'nucleo' })).toBeNull()
    const r = await exigir(ctxDe(f.cliente), { modulo: 'licitaciones', permiso: 'view_billing' })
    expect(r).toMatchObject({ status: 403, codigo: 'sin_permiso' })
  })

  it('módulo inactivo o sin fila → 403 modulo_inactivo', async () => {
    const f = clienteFalso({ modulos })
    expect(await exigir(ctxDe(f.cliente), { modulo: 'calendario' })).toMatchObject({ status: 403, codigo: 'modulo_inactivo' })
    expect(await exigir(ctxDe(f.cliente), { modulo: 'chat' })).toMatchObject({ status: 403, codigo: 'modulo_inactivo' })
  })

  it('lectura fallida → 500 error_base', async () => {
    const f = clienteFalso({ errorModulos: true })
    expect(await exigir(ctxDe(f.cliente), { modulo: 'licitaciones' })).toMatchObject({ status: 500, codigo: 'error_base' })
  })

  it('el admin con el módulo inactivo también queda denegado', async () => {
    const f = clienteFalso({ modulos })
    const ctx = ctxDe(f.cliente, { roles: ['admin'], esAdmin: true, permisos: [] })
    expect(await exigir(ctx, { modulo: 'calendario' })).toMatchObject({ status: 403, codigo: 'modulo_inactivo' })
    expect(await exigir(ctx, { modulo: 'calendario', soloAdmin: true })).toMatchObject({ codigo: 'modulo_inactivo' })
  })
})

// ── limiteBase y auditar ────────────────────────────────────────────────

describe('limiteBase', () => {
  it('rate_limit_hit true → 429 tasa, con los argumentos de la RPC', async () => {
    const f = clienteFalso({ rpc: { data: true, error: null } })
    const r = await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20)
    expect(r).toMatchObject({ status: 429, codigo: 'tasa' })
    expect(f.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_clave: 'ia:u1', p_ventana_seg: 3600, p_max: 20 })
  })

  it('rate_limit_hit false → no limita', async () => {
    const f = clienteFalso({ rpc: { data: false, error: null } })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20)).toBeNull()
  })

  it('si la RPC no existe todavía (migración 64 sin aplicar) no limita', async () => {
    const f = clienteFalso({ rpc: { data: null, error: { code: 'PGRST202', message: 'no existe' } } })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20)).toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it('si la RPC lanza no limita', async () => {
    const f = clienteFalso({ rpc: new Error('red') })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20)).toBeNull()
  })

  it('sin contexto usa un cliente service role propio', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://supabase.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
    const f = clienteFalso({ rpc: { data: true, error: null } })
    estado.cliente = f.cliente
    const r = await limiteBase(null, 'push-notify:global', 600, 6)
    expect(r).toMatchObject({ status: 429 })
    expect(f.rpc).toHaveBeenCalledTimes(1)
  })

  it('sin contexto ni variables no limita', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(await limiteBase(null, 'ia:global', 86400, 300)).toBeNull()
  })
})

describe('limiteBase cerrado (cupo de IA)', () => {
  const cerrado = { cerrado: true }

  it('rate_limit_hit true → 429 tasa', async () => {
    const f = clienteFalso({ rpc: { data: true, error: null } })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20, cerrado)).toMatchObject({
      status: 429,
      codigo: 'tasa',
    })
  })

  it('rate_limit_hit false → no limita', async () => {
    const f = clienteFalso({ rpc: { data: false, error: null } })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20, cerrado)).toBeNull()
  })

  it('sin la migración 64 (PGRST202 o 42883) → 501 config', async () => {
    for (const code of ['PGRST202', '42883']) {
      const f = clienteFalso({ rpc: { data: null, error: { code, message: 'no existe' } } })
      expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20, cerrado)).toMatchObject({
        status: 501,
        codigo: 'config',
        error: 'Falta la migración 64',
      })
    }
  })

  it('error genérico de la RPC → 503 error_base', async () => {
    const f = clienteFalso({ rpc: { data: null, error: { code: '57014', message: 'tiempo' } } })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20, cerrado)).toMatchObject({
      status: 503,
      codigo: 'error_base',
    })
  })

  it('la RPC lanza → 503 error_base', async () => {
    const f = clienteFalso({ rpc: new Error('red') })
    expect(await limiteBase(ctxDe(f.cliente), 'ia:u1', 3600, 20, cerrado)).toMatchObject({
      status: 503,
      codigo: 'error_base',
    })
  })

  it('sin cliente → 503 error_base', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(await limiteBase(null, 'ia:global', 86400, 300, cerrado)).toMatchObject({
      status: 503,
      codigo: 'error_base',
    })
  })
})

describe('auditar', () => {
  it('inserta con origen servidor y valores por defecto', async () => {
    const f = clienteFalso()
    await auditar(f.cliente, { userId: 'u1', action: 'correo.equipo.leer' })
    expect(f.inserts).toEqual([
      {
        user_id: 'u1',
        user_email: '',
        action: 'correo.equipo.leer',
        detail: '',
        entity: '',
        entity_id: '',
        origen: 'servidor',
      },
    ])
  })

  it('un error de la base no lanza', async () => {
    const f = clienteFalso({ errorInsert: { code: 'PGRST204' } })
    await expect(auditar(f.cliente, { userId: null, action: 'x' })).resolves.toBeUndefined()
  })

  it('una excepción no lanza', async () => {
    const f = clienteFalso({ errorInsert: new Error('red') })
    await expect(auditar(f.cliente, { userId: null, action: 'x' })).resolves.toBeUndefined()
  })
})

// mail-auth.authenticate llega con el módulo correo (docs/origen.md)

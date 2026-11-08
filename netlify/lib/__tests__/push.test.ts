import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// push.mts: a quién llega un aviso (SEG-U9/02, RG-13). Una lista vacía no
// avisa a nadie, las cuentas de servicio nunca reciben push y los avisos de
// una app van a quien la ve, más los admins (AU-DEC-04). Sin red: web-push
// se sustituye y el cliente de Supabase es falso.

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})) },
}))

import webpush from 'web-push'
import { broadcastPush, idsQueVenApp } from '../push.mts'

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
type Miembro = { id: string; user_roles: { role: string; roles: { permissions: string[] } | null }[] }

type Datos = {
  subs?: Sub[]
  usuarios?: { id: string; email: string; banned_until?: string }[]
  authCaido?: boolean
  authColgado?: boolean
  apps?: { slug: string; roles: string[] | null; active?: boolean }[]
  miembros?: Miembro[]
  errorApps?: boolean
  errorMiembros?: boolean
}

function cliente(d: Datos) {
  const pedidos: string[][] = []
  const borrados: string[] = []
  const filtrosApps: [string, unknown][] = []
  const admin = {
    from: vi.fn((tabla: string) => {
      if (tabla === 'push_subscriptions') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              pedidos.push(ids)
              return { data: (d.subs ?? []).filter((s) => ids.includes(s.user_id)), error: null }
            },
          }),
          delete: () => ({
            in: async (_col: string, ids: string[]) => {
              borrados.push(...ids)
              return { error: null }
            },
          }),
        }
      }
      if (tabla === 'portal_apps') {
        return {
          select: () => ({
            // Filtra de verdad: una app desactivada solo sale si se omite el eq
            eq: async (col: string, valor: unknown) => {
              filtrosApps.push([col, valor])
              if (d.errorApps) return { data: null, error: { code: '42P01' } }
              const filas = (d.apps ?? []).filter((a) => ({ active: true, ...a } as Record<string, unknown>)[col] === valor)
              return { data: filas, error: null }
            },
          }),
        }
      }
      return {
        select: async () =>
          d.errorMiembros ? { data: null, error: { code: '42501' } } : { data: d.miembros ?? [], error: null },
      }
    }),
    auth: {
      admin: {
        listUsers: vi.fn(() =>
          d.authColgado
            ? new Promise<never>(() => {})
            : Promise.resolve(
                d.authCaido
                  ? { data: null, error: new Error('Auth no responde') }
                  : { data: { users: d.usuarios ?? [] }, error: null },
              ),
        ),
      },
    },
  }
  return {
    admin: admin as unknown as SupabaseClient,
    pedidos,
    borrados,
    filtrosApps,
    from: admin.from,
    listUsers: admin.auth.admin.listUsers,
  }
}

const sub = (id: string, user_id: string): Sub => ({ id, user_id, endpoint: `https://push.test/${id}`, p256dh: 'p', auth: 'a' })
const AVISO = { title: 'Radar de Licitaciones', body: 'Nueva coincidencia', url: '/apps/licitaciones' }
const USUARIOS = [
  { id: 'u-ana', email: 'ana@empresa.test' },
  { id: 'u-dev', email: 'claude-dev@empresa.test' },
  { id: 'u-qa', email: 'Claude-QA@Empresa.Test' },
]

beforeEach(() => {
  vi.stubEnv('VAPID_PUBLIC_KEY', 'publica')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'privada')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('broadcastPush', () => {
  it('una lista vacía no avisa a nadie (ni consulta suscripciones)', async () => {
    const c = cliente({ subs: [sub('s1', 'u-ana')], usuarios: USUARIOS })
    expect(await broadcastPush(c.admin, AVISO, { userIds: [] })).toEqual({ sent: 0, removed: 0 })
    expect(c.from).not.toHaveBeenCalled()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sin VAPID no hace nada', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const c = cliente({ subs: [sub('s1', 'u-ana')], usuarios: USUARIOS })
    expect(await broadcastPush(c.admin, AVISO, { userIds: ['u-ana'] })).toEqual({ sent: 0, removed: 0 })
    expect(c.from).not.toHaveBeenCalled()
  })

  it('solo pide las suscripciones de esos miembros y nunca avisa a las cuentas de servicio', async () => {
    const c = cliente({
      subs: [sub('s1', 'u-ana'), sub('s2', 'u-dev'), sub('s3', 'u-qa'), sub('s4', 'u-otro')],
      usuarios: USUARIOS,
    })
    const r = await broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-dev', 'u-qa'] })
    expect(c.pedidos).toEqual([['u-ana', 'u-dev', 'u-qa']])
    expect(r).toEqual({ sent: 1, removed: 0 })
    const endpoints = vi.mocked(webpush.sendNotification).mock.calls.map(([s]) => s.endpoint)
    expect(endpoints).toEqual(['https://push.test/s1'])
  })

  it('sin suscripciones no consulta Auth', async () => {
    const c = cliente({ subs: [], usuarios: USUARIOS })
    expect(await broadcastPush(c.admin, AVISO, { userIds: ['u-ana'] })).toEqual({ sent: 0, removed: 0 })
    expect(c.listUsers).not.toHaveBeenCalled()
  })

  it('si Auth falla, el aviso sale sin la exclusión y lo registra', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ subs: [sub('s1', 'u-ana'), sub('s2', 'u-dev')], authCaido: true })
    const r = await broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-dev'] })
    expect(r.sent).toBe(2)
    expect(String(error.mock.calls[0]?.[0])).toContain('cuentas de servicio y suspendidos no disponibles')
  })

  it('si Auth no responde, corta a los 5 s, avisa sin la exclusión y no vuelve a preguntar en 60 s', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ subs: [sub('s1', 'u-ana'), sub('s2', 'u-dev')], authColgado: true })
    const primero = broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-dev'] })
    await vi.advanceTimersByTimeAsync(5000)
    expect((await primero).sent).toBe(2)
    expect(error.mock.calls[0]?.[1]).toEqual({ motivo: 'plazo de Auth vencido' })

    // Dentro de la ventana el fallo queda memorizado: el aviso sale al instante
    expect((await broadcastPush(c.admin, AVISO, { userIds: ['u-ana'] })).sent).toBe(1)
    expect(c.listUsers).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    const tercero = broadcastPush(c.admin, AVISO, { userIds: ['u-ana'] })
    await vi.advanceTimersByTimeAsync(5000)
    await tercero
    expect(c.listUsers).toHaveBeenCalledTimes(2)
  })

  it('lee Auth una sola vez por cliente aunque se avise varias veces (un push por lead o por evento)', async () => {
    const c = cliente({ subs: [sub('s1', 'u-ana'), sub('s2', 'u-dev')], usuarios: USUARIOS })
    for (let i = 0; i < 3; i++) {
      expect((await broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-dev'] })).sent).toBe(1)
    }
    expect(c.listUsers).toHaveBeenCalledTimes(1)
  })

  it('nunca avisa a un miembro suspendido (banned_until futuro)', async () => {
    const c = cliente({
      subs: [sub('s1', 'u-ana'), sub('s2', 'u-susp'), sub('s3', 'u-antes')],
      usuarios: [
        ...USUARIOS,
        { id: 'u-susp', email: 'susp@empresa.test', banned_until: '2999-01-01T00:00:00Z' },
        { id: 'u-antes', email: 'antes@empresa.test', banned_until: '2001-01-01T00:00:00Z' },
      ],
    })
    expect((await broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-susp', 'u-antes'] })).sent).toBe(2)
    const endpoints = vi.mocked(webpush.sendNotification).mock.calls.map(([s]) => s.endpoint)
    expect(endpoints).toEqual(['https://push.test/s1', 'https://push.test/s3'])
  })

  it('borra las suscripciones muertas (404/410)', async () => {
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockResolvedValueOnce({} as never)
    const c = cliente({ subs: [sub('s1', 'u-ana'), sub('s2', 'u-luis')], usuarios: USUARIOS })
    const r = await broadcastPush(c.admin, AVISO, { userIds: ['u-ana', 'u-luis'] })
    expect(r).toEqual({ sent: 1, removed: 1 })
    expect(c.borrados).toEqual(['s1'])
  })
})

describe('idsQueVenApp (AU-DEC-04)', () => {
  const miembro = (id: string, ...roles: [string, string[]][]): Miembro => ({
    id,
    user_roles: roles.map(([role, permissions]) => ({ role, roles: { permissions } })),
  })
  const MIEMBROS = [
    miembro('u-comercial', ['comercial', []]),
    miembro('u-permiso', ['proyectos', ['app_licitaciones']]),
    miembro('u-sin', ['proyectos', ['edit_crm']]),
    miembro('u-admin', ['admin', []]),
    { id: 'u-sin-roles', user_roles: [] },
  ]

  it('quien ve la app por rol o por permiso app_*, más los admins', async () => {
    const c = cliente({ apps: [{ slug: 'licitaciones', roles: ['comercial', 'app_licitaciones'] }], miembros: MIEMBROS })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toEqual(['u-comercial', 'u-permiso', 'u-admin'])
    expect(c.filtrosApps).toEqual([['active', true]])
  })

  it('app desactivada (active false): solo los admins', async () => {
    const c = cliente({ apps: [{ slug: 'licitaciones', roles: [], active: false }], miembros: MIEMBROS })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toEqual(['u-admin'])
  })

  it('sin las cuentas de servicio ni los suspendidos, y broadcastPush reutiliza esa lectura de Auth', async () => {
    const c = cliente({
      apps: [{ slug: 'licitaciones', roles: [] }],
      miembros: [...MIEMBROS, miembro('u-dev', ['admin', []]), miembro('u-susp', ['comercial', []])],
      usuarios: [...USUARIOS, { id: 'u-susp', email: 'susp@empresa.test', banned_until: '2999-01-01T00:00:00Z' }],
      subs: [sub('s1', 'u-admin')],
    })
    const ids = await idsQueVenApp(c.admin, 'licitaciones')
    expect(ids).toEqual(MIEMBROS.map((m) => m.id))
    await broadcastPush(c.admin, AVISO, { userIds: ids ?? [] })
    expect(c.listUsers).toHaveBeenCalledTimes(1)
  })

  it('si Auth falla, los destinatarios salen sin esa exclusión (no se bloquea el aviso)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ apps: [{ slug: 'licitaciones', roles: [] }], miembros: MIEMBROS, authCaido: true })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toEqual(MIEMBROS.map((m) => m.id))
  })

  it('app sin roles: la ve todo el equipo', async () => {
    const c = cliente({ apps: [{ slug: 'licitaciones', roles: [] }], miembros: MIEMBROS })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toEqual(MIEMBROS.map((m) => m.id))
  })

  it('app inactiva o inexistente: solo los admins', async () => {
    const c = cliente({ apps: [{ slug: 'otra', roles: [] }], miembros: MIEMBROS })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toEqual(['u-admin'])
  })

  it('si no puede leer las apps devuelve null (quien llama no avisa)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ errorApps: true, miembros: MIEMBROS })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toBeNull()
  })

  it('si no puede leer los miembros devuelve null y registra el código', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ apps: [{ slug: 'licitaciones', roles: [] }], errorMiembros: true })
    expect(await idsQueVenApp(c.admin, 'licitaciones')).toBeNull()
    expect(error.mock.calls[0]?.[1]).toEqual({ app: 'licitaciones', codigo: '42501' })
  })
})

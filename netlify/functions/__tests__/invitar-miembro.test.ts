import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// invitar-miembro (N-7) con un cliente falso: el orden fijo y que nada llegue
// a Auth cuando un paso previo falla.

vi.mock('../../lib/autorizacion.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/autorizacion.mts')>()),
  autenticar: vi.fn(),
  limiteBase: vi.fn(async () => null),
  auditar: vi.fn(async () => {}),
}))

import { auditar, autenticar, type ContextoAuth } from '../../lib/autorizacion.mts'
import invitar, { rolesEscalan } from '../invitar-miembro.mts'

type Opciones = { limite?: number | null; miembros?: number; roles?: { name: string; permissions: string[] }[] }

function falso(o: Opciones = {}) {
  const invite = vi.fn(async () => ({ data: { user: { id: 'u-nuevo' } }, error: null }))
  const inserts: unknown[] = []
  const from = vi.fn((tabla: string) => {
    if (tabla === 'roles') {
      return { select: () => ({ in: async (_c: string, nombres: string[]) => ({ data: (o.roles ?? []).filter((r) => nombres.includes(r.name)), error: null }) }) }
    }
    if (tabla === 'profiles') {
      return {
        select: () => ({ eq: async () => ({ count: o.miembros ?? 3, error: null }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }
    }
    if (tabla === 'user_roles') {
      return { insert: async (f: unknown) => (inserts.push(f), { error: null }) }
    }
    throw new Error('tabla inesperada: ' + tabla)
  })
  const rpc = vi.fn(async () => ({ data: o.limite === undefined ? 10 : o.limite, error: null }))
  const admin = { from, rpc, auth: { admin: { inviteUserByEmail: invite } } } as unknown as SupabaseClient
  return { admin, invite, inserts }
}

function ctx(admin: SupabaseClient, parcial: Partial<ContextoAuth> = {}): ContextoAuth {
  return {
    admin,
    userId: 'u-gestor',
    email: 'gestor@empresa.test',
    nombre: 'Gestor',
    roles: ['gestor'],
    permisos: ['manage_members'],
    esAdmin: false,
    aal: 'aal1',
    tieneFactor: false,
    ...parcial,
  }
}

const pedir = (cuerpo: unknown) =>
  invitar(new Request('http://x/api/invitar-miembro', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(cuerpo) }))

const BASE = { correo: 'nueva@empresa.test', nombre: 'Nueva Persona', roles: [] as string[] }

beforeEach(() => {
  vi.stubEnv('URL', 'https://portal.test')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(auditar).mockClear()
})

describe('invitar-miembro', () => {
  it('sin manage_members → 403 sin llamar a Auth', async () => {
    const f = falso()
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin, { permisos: [] }) })
    expect((await pedir(BASE)).status).toBe(403)
    expect(f.invite).not.toHaveBeenCalled()
  })

  it('límite alcanzado → 409 limite_miembros con uso y límite, sin Auth', async () => {
    const f = falso({ limite: 2, miembros: 2 })
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    const res = await pedir(BASE)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: 'limite_miembros', uso: 2, limite: 2 })
    expect(f.invite).not.toHaveBeenCalled()
  })

  it('un gestor no da un rol con permisos solo-admin → 403', async () => {
    const f = falso({ roles: [{ name: 'jefe', permissions: ['manage_roles'] }] })
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    expect((await pedir({ ...BASE, roles: ['jefe'] })).status).toBe(403)
    expect(f.invite).not.toHaveBeenCalled()
    expect(rolesEscalan([{ name: 'admin', permissions: [] }, { name: 'ventas', permissions: ['edit_crm'] }])).toEqual(['admin'])
  })

  it('correo inválido o campo extra → 400', async () => {
    const f = falso()
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    expect((await pedir({ ...BASE, correo: 'no-es-correo' })).status).toBe(400)
    expect((await pedir({ ...BASE, rol: 'admin' })).status).toBe(400)
    expect(f.invite).not.toHaveBeenCalled()
  })

  it('sin URL del sitio → 501 que dice qué falta', async () => {
    vi.stubEnv('URL', '')
    const f = falso()
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    const res = await pedir(BASE)
    expect(res.status).toBe(501)
    expect(((await res.json()) as { error: string }).error).toContain('URL')
  })

  it('éxito: invita con redirectTo, asigna roles y audita miembro.invitar', async () => {
    const f = falso({ roles: [{ name: 'ventas', permissions: ['edit_crm'] }] })
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    const res = await pedir({ ...BASE, roles: ['ventas'] })
    expect(res.status).toBe(200)
    expect(f.invite).toHaveBeenCalledWith('nueva@empresa.test', { redirectTo: 'https://portal.test', data: { full_name: 'Nueva Persona' } })
    expect(f.inserts).toEqual([[{ user_id: 'u-nuevo', role: 'ventas' }]])
    expect(vi.mocked(auditar).mock.calls[0]?.[1]).toMatchObject({ action: 'miembro.invitar', entityId: 'u-nuevo' })
  })

  it('sin límite (null) invita aunque haya muchos miembros', async () => {
    const f = falso({ limite: null, miembros: 500 })
    vi.mocked(autenticar).mockResolvedValue({ ctx: ctx(f.admin) })
    expect((await pedir(BASE)).status).toBe(200)
  })
})

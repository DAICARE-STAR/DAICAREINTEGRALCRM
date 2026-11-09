import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MODULOS, moduloDeAccion } from '../../../src/lib/modulos.ts'
import { ACCIONES, REQUISITOS, bodySchema, componer, limiteIA } from '../connector-proxy.mts'
import { estadoConectores } from '../../lib/modulos/nucleo.mts'
import type { FilaModulo } from '../../lib/modulos-instalacion.mts'

// connector-proxy compuesto (N-6): una entrada de REQUISITOS por acción,
// cada acción pertenece a un módulo del registro, el cuerpo rechaza campos
// desconocidos y el cupo de IA usa los límites del módulo ia y falla cerrado.

afterEach(() => vi.restoreAllMocks())

describe('composición de acciones', () => {
  it('una entrada de REQUISITOS por acción, con el módulo del registro', () => {
    expect(Object.keys(REQUISITOS).sort()).toEqual(Object.keys(ACCIONES).sort())
    for (const [nombre, req] of Object.entries(REQUISITOS)) {
      expect(req.modulo).toBe(moduloDeAccion(nombre))
      expect(MODULOS.some((m) => m.slug === req.modulo && m.acciones.includes(nombre))).toBe(true)
    }
  })

  it('el núcleo aporta list-members e instalacion-estado-conectores (solo admin)', () => {
    expect(REQUISITOS['list-members']).toEqual({ modulo: 'nucleo' })
    expect(REQUISITOS['instalacion-estado-conectores']).toEqual({ modulo: 'nucleo', soloAdmin: true })
  })

  it('una acción que el registro no declara no carga', () => {
    const accion = ACCIONES['list-members']!
    expect(() => componer([{ 'accion-fantasma': accion }])).toThrow(/no figura en el registro/)
    expect(() => componer([{ 'list-members': accion }, { 'list-members': accion }])).toThrow(/repetida/)
  })
})

describe('bodySchema', () => {
  it('acepta una acción conocida, con o sin datos', () => {
    expect(bodySchema.safeParse({ action: 'list-members' }).success).toBe(true)
    expect(bodySchema.safeParse({ action: 'list-members', datos: {} }).success).toBe(true)
  })

  it('rechaza campos desconocidos y acciones fuera del enum', () => {
    expect(bodySchema.safeParse({ action: 'list-members', connector: 'portal' }).success).toBe(false)
    expect(bodySchema.safeParse({ action: 'create-event' }).success).toBe(false)
  })

  it('los datos de cada acción son .strict()', () => {
    for (const a of Object.values(ACCIONES)) {
      expect(a.datos.safeParse({ extra: 1 }).success).toBe(false)
    }
  })
})

describe('limiteIA', () => {
  const ia = (limites: Record<string, unknown>): FilaModulo[] => [{ slug: 'ia', activo: true, limites }]
  const ctx = (rpc: () => Promise<unknown>) => ({
    userId: 'u1',
    admin: { rpc: vi.fn(rpc) } as unknown as SupabaseClient,
  })

  it('usa ia_hora_miembro e ia_dia_equipo del módulo ia', async () => {
    const c = ctx(async () => ({ data: false, error: null }))
    expect(await limiteIA(c, ia({ ia_hora_miembro: 20, ia_dia_equipo: 300 }))).toBeNull()
    expect(vi.mocked(c.admin.rpc).mock.calls).toEqual([
      ['rate_limit_hit', { p_clave: 'ia:u1', p_ventana_seg: 3600, p_max: 20 }],
      ['rate_limit_hit', { p_clave: 'ia:equipo', p_ventana_seg: 86_400, p_max: 300 }],
    ])
  })

  it('cupo agotado → 429', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = ctx(async () => ({ data: true, error: null }))
    expect(await limiteIA(c, ia({ ia_hora_miembro: 20 }))).toMatchObject({ status: 429, codigo: 'tasa' })
  })

  it('falla cerrado con la RPC caída', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = ctx(async () => ({ data: null, error: { code: 'XX000' } }))
    expect(await limiteIA(c, ia({ ia_hora_miembro: 20 }))).toMatchObject({ status: 503, codigo: 'error_base' })
    const lanza = ctx(async () => {
      throw new Error('red')
    })
    expect(await limiteIA(lanza, ia({ ia_hora_miembro: 20 }))).toMatchObject({ status: 503 })
  })

  it('sin límite declarado no consulta la RPC', async () => {
    const c = ctx(async () => ({ data: true, error: null }))
    expect(await limiteIA(c, ia({}))).toBeNull()
    expect(c.admin.rpc).not.toHaveBeenCalled()
  })
})

describe('estadoConectores', () => {
  it('solo los conectores de módulos activos; correo según SMTP', () => {
    const filas: FilaModulo[] = [{ slug: 'nucleo', activo: true, limites: {} }]
    expect(estadoConectores(filas, true)).toEqual({ correo: 'configurado' })
    expect(estadoConectores(filas, false)).toEqual({ correo: 'sin_configurar' })
  })
})

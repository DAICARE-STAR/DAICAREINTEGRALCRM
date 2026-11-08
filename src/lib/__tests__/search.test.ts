import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchMembers } from '../search'

// Cliente de Supabase falso: profiles con ilike y la RPC de cuentas de servicio
const sb = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: sb }))

describe('searchMembers', () => {
  const perfiles = [
    { id: 'u-ana', full_name: 'Ana' },
    { id: 'u-dev', full_name: 'Claude Dev Bot' },
    { id: 'u-bot', full_name: 'Bot de prueba' },
  ]
  let limite: number | undefined

  beforeEach(() => {
    limite = undefined
    const q = {
      select: () => q,
      ilike: () => q,
      order: () => q,
      limit: (n: number) => {
        limite = n
        return Promise.resolve({ data: perfiles, error: null })
      },
    }
    sb.from.mockReset().mockReturnValue(q)
    sb.rpc.mockReset()
  })

  it('quita las cuentas de servicio que da cuentas_servicio_ids', async () => {
    sb.rpc.mockResolvedValue({ data: ['u-dev', 'u-bot'], error: null })
    expect((await searchMembers('a')).map((m) => m.id)).toEqual(['u-ana'])
    expect(sb.rpc).toHaveBeenCalledWith('cuentas_servicio_ids')
    // Pide filas de más para que el filtro no deje el grupo corto
    expect(limite).toBe(8)
  })

  it('sin la función (migración 71 sin aplicar) no filtra ni rompe', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    expect(await searchMembers('a')).toHaveLength(3)
    sb.rpc.mockRejectedValue(new Error('red'))
    expect(await searchMembers('a')).toHaveLength(3)
  })

  it('devuelve como mucho 5', async () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({ id: `u-${i}`, full_name: `Persona ${i}` }))
    perfiles.splice(0, perfiles.length, ...muchos)
    sb.rpc.mockResolvedValue({ data: [], error: null })
    expect(await searchMembers('persona')).toHaveLength(5)
  })
})

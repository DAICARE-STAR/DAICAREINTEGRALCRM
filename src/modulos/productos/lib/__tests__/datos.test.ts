import { beforeEach, describe, expect, it, vi } from 'vitest'
import { leerConversiones } from '../datos'

// Cliente de Supabase falso que corta cada respuesta en 1000 filas, como max_rows
const sb = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: sb }))

describe('leerConversiones', () => {
  const filas = Array.from({ length: 2500 }, (_, i) => ({ producto_id: `p${String(Math.floor(i / 6)).padStart(4, '0')}`, unidad: `u${i % 6}`, factor: '2' }))
  let rangos: [number, number][]

  beforeEach(() => {
    rangos = []
    const q = {
      select: () => q,
      in: () => q,
      order: () => q,
      range: (desde: number, hasta: number) => {
        rangos.push([desde, hasta])
        return Promise.resolve({ data: filas.slice(desde, Math.min(hasta + 1, desde + 1000)), error: null })
      },
    }
    sb.from.mockReset().mockReturnValue(q)
  })

  it('pide páginas de 1000 hasta recibir menos y no pierde filas', async () => {
    expect(await leerConversiones(['p0000'])).toEqual(filas)
    expect(rangos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('sin ids no consulta', async () => {
    expect(await leerConversiones([])).toEqual([])
    expect(sb.from).not.toHaveBeenCalled()
  })
})

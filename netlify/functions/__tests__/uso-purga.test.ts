import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// La purga programada debe llamar a uso_purgar sin p_dias: con un número
// fijo, coalesce(p_dias, ...) de 07-widgets-uso.sql nunca llega a
// nucleo.retencion_uso_dias.
const rpc = vi.fn(async () => ({ data: 3, error: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))

describe('uso-purga', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'prueba'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.restoreAllMocks()
  })

  it('llama a uso_purgar sin argumentos para que rija la retención de la instalación', async () => {
    const { default: purgar } = await import('../uso-purga.mts')
    const res = await purgar()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]).toEqual(['uso_purgar'])
    expect(await res.json()).toEqual({ borradas: 3 })
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Programadas que respetan los módulos (N-6): con su módulo inactivo se
// saltan lo de ese módulo y lo registran; sin poder leer los módulos, fallan
// cerrado. Y el hallazgo de consumo > 80 % de revision-seguridad.

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(() => estado.cliente),
}))

import { reiniciarCacheModulos } from '../../lib/modulos-instalacion.mts'
import recordatorios from '../check-event-reminders.mts'
import { consumoAlto, hallazgosDe } from '../revision-seguridad.mts'

function cliente(modulos: unknown[] | null) {
  const rpc = vi.fn(async () => ({ data: [], error: null }))
  estado.cliente = {
    from: vi.fn((tabla: string) => {
      if (tabla !== 'modulos_instalacion') throw new Error('tabla inesperada: ' + tabla)
      return {
        select: async () => (modulos ? { data: modulos, error: null } : { data: null, error: { code: 'XX000' } }),
      }
    }),
    rpc,
  }
  return { rpc }
}

beforeEach(() => {
  reiniciarCacheModulos()
  vi.stubEnv('SUPABASE_URL', 'https://base.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('check-event-reminders y el módulo calendario', () => {
  it('inactivo: no reclama recordatorios y lo registra', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { rpc } = cliente([{ slug: 'calendario', activo: false, limites: {} }])
    const res = await recordatorios()
    expect(await res.json()).toEqual({ omitida: 'modulo_inactivo' })
    expect(rpc).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('calendario inactivo'))
  })

  it('sin leer los módulos: 500 y sin reclamar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rpc } = cliente(null)
    const res = await recordatorios()
    expect(res.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('activo: reclama', async () => {
    const { rpc } = cliente([{ slug: 'calendario', activo: true, limites: {} }])
    expect(await (await recordatorios()).json()).toEqual({ reminded: 0 })
    expect(rpc).toHaveBeenCalledWith('claim_due_event_reminders')
  })
})

describe('las programadas exportan schedule y consultan los módulos', () => {
  const dir = fileURLToPath(new URL('..', import.meta.url))
  const programadas = readdirSync(dir).filter((f) => f.endsWith('.mts') && /schedule:/.test(readFileSync(dir + f, 'utf8')))
  it.each(programadas)('%s', (f) => {
    const src = readFileSync(dir + f, 'utf8')
    expect(src).toMatch(/export const config = \{\s*schedule:/)
    // uso-purga es del núcleo (siempre activo): su retención la decide uso_purgar
    if (f !== 'uso-purga.mts') expect(src).toContain('leerModulos')
  })
})

describe('consumo > 80 %', () => {
  it('consumoAlto avisa por encima del umbral, no en él', () => {
    expect(consumoAlto([{ modulo: 'nucleo', clave: 'miembros', uso: 9, limite: 10 }])).toEqual(['nucleo.miembros: 9 de 10'])
    expect(consumoAlto([{ modulo: 'nucleo', clave: 'miembros', uso: 8, limite: 10 }])).toEqual([])
  })

  it('hallazgosDe incluye el hallazgo de consumo', () => {
    const h = hallazgosDe({}, [], [{ modulo: 'nucleo', clave: 'miembros', uso: 10, limite: 10 }])
    expect(h).toEqual([{ titulo: 'Consumo por encima del 80 % del límite', items: ['nucleo.miembros: 10 de 10'] }])
  })
})

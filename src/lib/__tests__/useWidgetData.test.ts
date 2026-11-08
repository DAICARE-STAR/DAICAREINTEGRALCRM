import { afterEach, describe, expect, it, vi } from 'vitest'
import { conTiempoLimite, debeRefrescar, INTERVALO_REFRESCO_MS } from '../useWidgetData'

// Solo la lógica pura del hook: vitest corre sin DOM (vitest.config.ts)
afterEach(() => {
  vi.useRealTimers()
})

describe('conTiempoLimite', () => {
  it('devuelve el valor si llega a tiempo', async () => {
    await expect(conTiempoLimite(Promise.resolve(5), 1000)).resolves.toBe(5)
  })

  it('un error da null, nunca un skeleton eterno', async () => {
    await expect(conTiempoLimite(Promise.reject(new Error('red')), 1000)).resolves.toBeNull()
  })

  it('al vencer da null e ignora el valor tardío', async () => {
    vi.useFakeTimers()
    let soltar: (v: number) => void = () => {}
    const lenta = new Promise<number>((r) => {
      soltar = r
    })
    const r = conTiempoLimite(lenta, 1000)
    vi.advanceTimersByTime(1000)
    await expect(r).resolves.toBeNull()
    soltar(7)
    await expect(r).resolves.toBeNull()
  })
})

describe('debeRefrescar', () => {
  it('nunca antes de la primera carga', () => {
    expect(debeRefrescar(null, 1_000_000)).toBe(false)
  })

  it('solo pasado el mínimo', () => {
    expect(debeRefrescar(0, INTERVALO_REFRESCO_MS - 1)).toBe(false)
    expect(debeRefrescar(0, INTERVALO_REFRESCO_MS)).toBe(true)
    expect(debeRefrescar(1000, 1500, 400)).toBe(true)
  })
})

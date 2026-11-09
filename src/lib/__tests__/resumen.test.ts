import { describe, expect, it } from 'vitest'
import { alternarFiltro, contextoDestacado, cuentasVisibles, partirFiltro, sumanTotal, valoresDestacado } from '../resumen'

// Casos de resumen.js de team-portal (no tiene pruebas propias: se derivan de su contrato).
describe('resumen', () => {
  it('destacado: valor, montos apilados o raya', () => {
    expect(valoresDestacado({ label: 'Total', valor: '12' })).toEqual(['12'])
    expect(valoresDestacado({ label: 'Total', montos: ['USD $ 1', 'COP $ 2'], valor: 'x' })).toEqual(['USD $ 1', 'COP $ 2'])
    expect(valoresDestacado({ label: 'Total', valor: null })).toEqual(['—'])
    expect(contextoDestacado({ label: 'T', contexto: ['a', null, false, '', 'b'] })).toEqual(['a', 'b'])
  })

  it('contadores en cero se omiten y los demás suman el total', () => {
    const cuentas = [
      { n: 3, label: 'Abiertas' },
      { n: 0, label: 'Vencidas' },
      { n: 2, label: 'Cerradas' },
    ]
    expect(cuentasVisibles(cuentas).map((c) => c.label)).toEqual(['Abiertas', 'Cerradas'])
    expect(sumanTotal(cuentas, 5)).toBe(true)
    expect(sumanTotal(cuentas, 6)).toBe(false)
  })

  it('filtro de contador: aplica o suelta', () => {
    expect(partirFiltro('fEstado|abierta')).toEqual({ id: 'fEstado', valor: 'abierta' })
    expect(partirFiltro('sinbarra')).toBeNull()
    expect(alternarFiltro('', 'abierta')).toBe('abierta')
    expect(alternarFiltro('abierta', 'abierta')).toBe('')
  })
})

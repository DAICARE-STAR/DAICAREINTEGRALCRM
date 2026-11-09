import { describe, expect, it } from 'vitest'
import { contarActivos, etiquetaMas, limpiar, nombreDesdeOpcionNeutra, repartir, textoContador } from '../filtros'

// Casos de filterbar.test.ts y filterbar.js de team-portal.
describe('filtros', () => {
  const controles = [
    { id: 'fMarca', valor: '', def: '' },
    { id: 'fEstado', valor: 'pendientes', def: 'pendientes' },
    { id: 'fa-cct', valor: '3000', def: '' },
  ]

  it('activo es distinto de su valor por defecto', () => {
    expect(contarActivos(controles)).toBe(1)
  })

  it('contador en singular y plural', () => {
    expect(textoContador(0)).toBe('0 filtros')
    expect(textoContador(1)).toBe('1 filtro')
    expect(textoContador(2)).toBe('2 filtros')
  })

  it('Limpiar vuelve al valor por defecto', () => {
    expect(contarActivos(limpiar(controles))).toBe(0)
  })

  it('cinco visibles como máximo y el resto en Más filtros', () => {
    const { visibles, mas } = repartir([1, 2, 3, 4, 5, 6, 7])
    expect(visibles).toEqual([1, 2, 3, 4, 5])
    expect(mas).toEqual([6, 7])
    expect(etiquetaMas(0)).toBe('Más filtros')
    expect(etiquetaMas(2)).toBe('Más filtros · 2')
  })

  it('nombre desde la opción neutra; un valor no nombra', () => {
    expect(nombreDesdeOpcionNeutra('Marca: todas')).toBe('Marca')
    expect(nombreDesdeOpcionNeutra('Estado: Todos ')).toBe('Estado')
    expect(nombreDesdeOpcionNeutra('Activos')).toBeNull()
  })
})

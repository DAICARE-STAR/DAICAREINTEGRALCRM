import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO, etapasOrdenadas, leerAjustes, nombreEtapa, validarAjustes } from '../catalogos'

describe('catalogos', () => {
  it('los ajustes por defecto son válidos', () => {
    expect(validarAjustes(AJUSTES_POR_DEFECTO)).toEqual([])
    expect(AJUSTES_POR_DEFECTO.etapas.map(e => e.clave)).toEqual(['solicitud', 'valoracion', 'propuesta', 'activo', 'cerrado', 'no_continuo'])
  })

  it('leerAjustes nunca lanza y cae al defecto', () => {
    for (const v of [null, undefined, 3, 'x', [], { crm: 5 }, { crm: { etapas: 'no' } }]) {
      expect(leerAjustes(v)).toEqual(AJUSTES_POR_DEFECTO)
    }
  })

  it('leerAjustes cae campo por campo', () => {
    const a = leerAjustes({ crm: { origenes: ['feria', 'web'], etapas: [{ clave: 'x', nombre: 'X', orden: 1 }], relaciones: [1] } })
    expect(a.origenes).toEqual(['feria', 'web'])
    expect(a.etapas).toEqual(AJUSTES_POR_DEFECTO.etapas)
    expect(a.relaciones).toEqual(AJUSTES_POR_DEFECTO.relaciones)
  })

  it('leerAjustes acepta etapas válidas', () => {
    const a = leerAjustes({ crm: { etapas: [{ clave: 'nueva', nombre: 'Nueva', orden: 2 }, { clave: 'fin', nombre: 'Fin', orden: 1, cierre: 'ganada' }] } })
    expect(etapasOrdenadas(a).map(e => e.clave)).toEqual(['fin', 'nueva'])
    expect(a.etapas[0].cierre).toBeNull()
  })

  it('validarAjustes detecta duplicados, órdenes repetidos y claves malas', () => {
    const errores = validarAjustes({
      ...AJUSTES_POR_DEFECTO,
      etapas: [
        { clave: 'uno', nombre: 'Uno', orden: 1, cierre: null },
        { clave: 'uno', nombre: 'Otra', orden: 1, cierre: null },
        { clave: 'Mal', nombre: 'Mal', orden: 3, cierre: null },
      ],
    })
    expect(errores.some(e => e.includes('duplicada'))).toBe(true)
    expect(errores.some(e => e.includes('Orden'))).toBe(true)
    expect(errores.some(e => e.includes('Mal'))).toBe(true)
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, etapas: [] })).toContain('No hay etapas')
  })

  it('nombreEtapa devuelve la clave si no existe', () => {
    expect(nombreEtapa(AJUSTES_POR_DEFECTO, 'no_continuo')).toBe('No continuó')
    expect(nombreEtapa(AJUSTES_POR_DEFECTO, 'otra')).toBe('otra')
  })
})

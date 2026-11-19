import { describe, expect, it } from 'vitest'
import { escribirConversiones, leerConversiones, textoConversion, validarFactor } from '../conversiones'
import type { Unidad } from '../tipos'

const u = (clave: string, nombre: string, simbolo: string | null = null): Unidad => ({ clave, nombre, simbolo, decimales: 0, sistema: false, archivado_en: null })
const UNIDADES = [u('und', 'Unidad'), u('caja', 'Caja'), u('kg', 'Kilogramo', 'kg'), u('g', 'Gramo')]
const resolver = (v: string) => UNIDADES.find((x) => x.clave === v.trim().toLowerCase() || x.nombre.toLowerCase() === v.trim().toLowerCase())?.clave ?? null

describe('factor de conversión (regla de productos_conversiones, caso 19.7)', () => {
  it('admite 1 o más y el inverso exacto de un entero', () => {
    for (const f of ['1', '12', '0.001', '0.5', '0.25', '0.000001', '2.5', '999999999999']) expect(validarFactor(f), f).toBeNull()
  })

  it('rechaza cero, inexactos, más de 6 decimales y negativos', () => {
    expect(validarFactor('0')).toMatch(/mayor que cero/)
    expect(validarFactor('0.083333')).toMatch(/no es exacto/)
    expect(validarFactor('0.3')).toMatch(/no es exacto/)
    expect(validarFactor('0.0000001')).toMatch(/6 decimales/)
    expect(validarFactor('-2')).toMatch(/mayor que cero/)
    expect(validarFactor('1234567890123')).toMatch(/demasiado grande/)
  })
})

describe('celda de unidades alternas', () => {
  it('lee «caja=12 | g=0,001» con coma decimal', () => {
    expect(leerConversiones('caja=12 | g=0,001', ',', resolver)).toEqual({
      conversiones: [{ unidad: 'caja', factor: '12' }, { unidad: 'g', factor: '0.001' }],
      errores: [],
    })
  })

  it('reporta formato, unidad desconocida, factor inexacto y repetidas', () => {
    const r = leerConversiones('caja | bolsa=3 | g=0,3 | Caja=2 | caja=4', ',', resolver)
    expect(r.conversiones).toEqual([{ unidad: 'caja', factor: '2' }])
    expect(r.errores).toEqual([
      'Unidad alterna sin el formato unidad=factor: caja',
      'Unidad desconocida: bolsa',
      'g: Ese factor no es exacto: usa como unidad base la unidad menor.',
      'Unidad alterna repetida: caja',
    ])
  })

  it('escribe la celda ordenada y con coma decimal: ida y vuelta', () => {
    const texto = escribirConversiones([{ unidad: 'g', factor: '0.001000' }, { unidad: 'caja', factor: 12 }])
    expect(texto).toBe('caja=12 | g=0,001')
    expect(leerConversiones(texto, ',', resolver).conversiones).toEqual([{ unidad: 'caja', factor: '12' }, { unidad: 'g', factor: '0.001' }])
  })

  it('textoConversion: «1 caja = 12 und», con el símbolo si lo hay', () => {
    expect(textoConversion('caja', 12, 'und', UNIDADES)).toBe('1 caja = 12 und')
    expect(textoConversion('g', '0.001', 'kg', UNIDADES)).toBe('1 g = 0,001 kg')
    expect(textoConversion('caja', '1500', 'und')).toBe('1 caja = 1.500 und')
  })
})

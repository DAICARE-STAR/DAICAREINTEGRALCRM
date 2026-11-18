import { describe, expect, it } from 'vitest'
import { esCodigoMoneda, fmtDinero, fmtImporte, fmtNumero, validarImporte } from '../moneda'

// Formato de dinero del shell (las apps estáticas no viajan al producto)
describe('fmtDinero', () => {
  it('pone código, símbolo e importe con miles con punto', () => {
    expect(fmtDinero(1234, 'USD')).toBe('USD $ 1.234')
    expect(fmtDinero(27299940, 'EUR')).toBe('EUR € 27.299.940')
    expect(fmtDinero(50000000, 'COP')).toBe('COP $ 50.000.000')
  })

  it('sin divisa usa USD y redondea sin decimales', () => {
    expect(fmtDinero(727424.6)).toBe('USD $ 727.425')
  })

  it('con decimales usa coma decimal', () => {
    expect(fmtDinero(4123.456, 'COP', 2)).toBe('COP $ 4.123,46')
  })

  it('una divisa sin símbolo conocido lleva solo el código', () => {
    expect(fmtDinero(10, 'CHF')).toBe('CHF 10')
  })

  it('acepta texto numérico y da — sin número', () => {
    expect(fmtDinero('1,234', 'USD')).toBe('USD $ 1.234')
    expect(fmtDinero(null, 'USD')).toBe('—')
    expect(fmtDinero(undefined)).toBe('—')
    expect(fmtDinero('', 'USD')).toBe('—')
    expect(fmtDinero(Number.NaN, 'USD')).toBe('—')
  })
})

describe('fmtNumero', () => {
  it('formatea sin divisa', () => {
    expect(fmtNumero(1234)).toBe('1.234')
    expect(fmtNumero(-12.5, 2)).toBe('-12,50')
    expect(fmtNumero(null)).toBe('—')
  })
})

// Importe con moneda (PP-DEC-24): las mismas reglas que los dominios
// importe y codigo_moneda y el check de pareja de 00b-contrato-tabla.sql
describe('importe con moneda', () => {
  it('esCodigoMoneda: tres letras mayúsculas', () => {
    expect(esCodigoMoneda('COP')).toBe(true)
    expect(esCodigoMoneda('cop')).toBe(false)
    expect(esCodigoMoneda('CO')).toBe(false)
    expect(esCodigoMoneda('COPS')).toBe(false)
    expect(esCodigoMoneda(null)).toBe(false)
  })

  it('validarImporte: los dos o ninguno', () => {
    expect(validarImporte(null, null)).toBeNull()
    expect(validarImporte('', undefined)).toBeNull()
    expect(validarImporte(1500, 'COP')).toBeNull()
    expect(validarImporte(0, 'USD')).toBeNull()
    expect(validarImporte(1500, null)).toMatch(/Falta la moneda/)
    expect(validarImporte(null, 'COP')).toMatch(/Falta el importe/)
    expect(validarImporte(1500, 'cop')).toMatch(/tres letras/)
  })

  it('validarImporte: número o texto de la API, hasta 4 decimales y 14 cifras enteras', () => {
    expect(validarImporte('1234.5', 'COP')).toBeNull()
    expect(validarImporte('-0.2500', 'USD')).toBeNull()
    expect(validarImporte(1234.5678, 'USD')).toBeNull()
    expect(validarImporte(99999999999999.99, 'COP')).toBeNull()
    expect(validarImporte('1.23456', 'USD')).toMatch(/4 decimales/)
    expect(validarImporte(1e14, 'COP')).toMatch(/demasiado grande/)
    expect(validarImporte(99999999999999.99999, 'COP')).toMatch(/demasiado grande/)
    expect(validarImporte('100000000000000', 'COP')).toMatch(/demasiado grande/)
    expect(validarImporte('-100000000000000.5', 'COP')).toMatch(/demasiado grande/)
  })

  // Un número JSON solo es exacto hasta unas 15 cifras: el texto se valida
  // por sus cifras y un número se redondea a 4 decimales como en la base
  it('validarImporte: el máximo de numeric(18,4) en texto y las sumas del navegador', () => {
    expect(Number('99999999999999.9999')).toBe(1e14)
    expect(validarImporte('99999999999999.9999', 'COP')).toBeNull()
    expect(validarImporte('-00099999999999999.9999', 'COP')).toBeNull()
    expect(validarImporte(0.1 + 0.2, 'USD')).toBeNull()
    expect(validarImporte(1.23456, 'USD')).toBeNull()
    expect(validarImporte('1.234,5', 'COP')).toMatch(/no es un número/)
    expect(validarImporte(Number.NaN, 'COP')).toMatch(/no es un número/)
    expect(validarImporte(Number.POSITIVE_INFINITY, 'COP')).toMatch(/no es un número/)
    expect(validarImporte({}, 'COP')).toMatch(/no es un número/)
  })

  it('fmtImporte: formato es-CO con el código, — si el par no es válido', () => {
    expect(fmtImporte(1234567, 'COP')).toBe('COP $ 1.234.567')
    expect(fmtImporte('1234567.5', 'COP', 2)).toBe('COP $ 1.234.567,50')
    expect(fmtImporte(-12.5, 'EUR', 2)).toBe('EUR € -12,50')
    expect(fmtImporte(1500, null)).toBe('—')
    expect(fmtImporte(null, 'COP')).toBe('—')
    expect(fmtImporte(1500, 'usd')).toBe('—')
  })
})
